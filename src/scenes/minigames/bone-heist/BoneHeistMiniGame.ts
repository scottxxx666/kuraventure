import Phaser from 'phaser';
import { setVirtualPadVisible } from '../../../input/VirtualPadSource';
import { i18nService } from '../../../services/I18nService';
import { createOverlayElement } from '../../../ui/domOverlay';
import { runFailFlow } from '../failFlow';
import { SceneKeys } from '../../keys';
import { MiniGameScene } from '../MiniGameScene';
import { cycleTimings, initialDogState, stepDog } from './dogCycle';
import type { CycleTimings, DogPhase, DogState } from './dogCycle';
import { NOISE_MAX, stepNoise } from './noise';
import {
    BALL_STARTS,
    BASKET,
    BONE_STARTS,
    DANGER_RADIUS,
    DOG_POS,
    clampToPlayBounds,
    isCovered,
    isInBasket,
    isInDanger
} from './layout';

/**
 * Bone Heist — "beware of the dog" arcade homage, and the pointer exception
 * (PLAN.md §3.10 signed-off, like twin-stick/lane mode): played entirely by
 * mouse/touch drag, no virtual pad. Bones are obstacles — drag them aside to
 * uncover the balls, then sneak each ball to the basket. Dragging fast makes
 * noise (yanking a still-covered ball is 3× louder) and noise wakes the dog
 * sooner. The dog telegraphs (stir) before waking; holding the pointer down
 * inside the danger circle while it is awake = bitten → banner → ending
 * video → Retry / Give up (../failFlow.ts). Deliver every ball to win.
 * Placeholder art — replacement sizes in public/assets/images/bone-heist/README.md.
 */

const WIN_BEAT_MS = 300;

/** Grab hit circles are 1.4× the sprite — virtual fingers are imprecise. */
const GRAB_SCALE = 1.4;

const DOG_SIZE = { w: 220, h: 180 };
const BONE_SIZE = { w: 150, h: 70 };
const BALL_SIZE = { w: 80, h: 80 };
const BASKET_SIZE = { w: 200, h: 160 };

const DEPTH_BASKET = 1;
const DEPTH_BALL = 2;
const DEPTH_BONE = 4; // bones render above balls so "covered" reads on screen
const DEPTH_DRAG_BUMP = 1;
const DEPTH_DOG = 6;
const DEPTH_HUD = 10;

const BAR_X = 32;
const BAR_Y = 32;
const BAR_W = 320;
const BAR_H = 20;

const DANGER_STYLE: Record<DogPhase, { color: number; alpha: number }> = {
    sleep: { color: 0xffffff, alpha: 0.08 },
    stir: { color: 0xffe066, alpha: 0.16 },
    awake: { color: 0xff4444, alpha: 0.26 }
};
const STIR_TINT = 0xffe066;
const AWAKE_TINT = 0xff5a5a;

const TEX_DOG = 'bone-heist-dog';
const TEX_BONE = 'bone-heist-bone';
const TEX_BALL = 'bone-heist-ball';
const TEX_BASKET = 'bone-heist-basket';
const ENDING_VIDEO_KEY = 'bone-heist-ending';

type BoneHeistState = 'running' | 'ended';

export class BoneHeistMiniGame extends MiniGameScene {
    private state: BoneHeistState = 'running';
    private noise = 0;
    private pendingDragPx = 0;
    private timings!: CycleTimings;
    private dogState!: DogState;
    private dogSprite!: Phaser.GameObjects.Image;
    private dogBaseScale = { x: 1, y: 1 };
    private dangerCircle!: Phaser.GameObjects.Arc;
    private balls: Phaser.GameObjects.Image[] = [];
    private bones: Phaser.GameObjects.Image[] = [];
    private delivered = 0;
    private draggedBall: Phaser.GameObjects.Image | null = null;
    private noiseFill!: Phaser.GameObjects.Rectangle;
    private promptEl: HTMLElement | null = null;
    private failFlowCleanup: (() => void) | null = null;

    constructor() {
        super(SceneKeys.BoneHeist);
    }

    preload(): void {
        if (!this.textures.exists(TEX_DOG)) {
            this.load.image(TEX_DOG, 'assets/images/bone-heist/dog.png');
            this.load.image(TEX_BONE, 'assets/images/bone-heist/bone.png');
            this.load.image(TEX_BALL, 'assets/images/bone-heist/ball.png');
            this.load.image(TEX_BASKET, 'assets/images/bone-heist/basket.png');
        }
        if (!this.cache.video.exists(ENDING_VIDEO_KEY)) {
            this.load.video(ENDING_VIDEO_KEY, 'assets/video/bone-heist-ending.mp4');
        }
    }

    create(): void {
        // The same scene instance is reused across launches and restarts.
        this.state = 'running';
        this.noise = 0;
        this.pendingDragPx = 0;
        this.balls = [];
        this.bones = [];
        this.delivered = 0;
        this.draggedBall = null;
        this.failFlowCleanup = null;

        // Pure pointer game — the pad would only cover the loot (§3.10
        // exception; VideoScene precedent). Restored on fail and on SHUTDOWN.
        setVirtualPadVisible(false);

        this.cameras.main.setBackgroundColor('#2c2418');
        this.dangerCircle = this.add.circle(
            DOG_POS.x,
            DOG_POS.y,
            DANGER_RADIUS,
            DANGER_STYLE.sleep.color,
            DANGER_STYLE.sleep.alpha
        );

        this.add
            .image(BASKET.x, BASKET.y, TEX_BASKET)
            .setDisplaySize(BASKET_SIZE.w, BASKET_SIZE.h)
            .setDepth(DEPTH_BASKET);

        for (const at of BALL_STARTS) {
            this.balls.push(this.createLoot(at, TEX_BALL, BALL_SIZE, DEPTH_BALL));
        }
        for (const at of BONE_STARTS) {
            this.bones.push(this.createLoot(at, TEX_BONE, BONE_SIZE, DEPTH_BONE));
        }

        this.dogSprite = this.add.image(DOG_POS.x, DOG_POS.y, TEX_DOG).setDepth(DEPTH_DOG);
        this.dogSprite.setDisplaySize(DOG_SIZE.w, DOG_SIZE.h);
        this.dogBaseScale = { x: this.dogSprite.scaleX, y: this.dogSprite.scaleY };
        this.timings = cycleTimings();
        this.dogState = initialDogState(this.timings);
        this.applyDogPhase('sleep');

        // Noise bar top-left (game-scene UI, no text → Phaser, not DOM — §3.8);
        // top-center is the dog's, bottom is where thumbs work.
        this.add
            .rectangle(BAR_X + BAR_W / 2, BAR_Y, BAR_W + 8, BAR_H + 8)
            .setStrokeStyle(4, 0xffffff)
            .setDepth(DEPTH_HUD);
        this.noiseFill = this.add
            .rectangle(BAR_X, BAR_Y, BAR_W, BAR_H, 0xffa94d)
            .setOrigin(0, 0.5)
            .setScale(0, 1)
            .setDepth(DEPTH_HUD);

        this.input.on(Phaser.Input.Events.DRAG_START, this.onDragStart, this);
        this.input.on(Phaser.Input.Events.DRAG, this.onDrag, this);
        this.input.on(Phaser.Input.Events.DRAG_END, this.onDragEnd, this);

        this.promptEl = createOverlayElement('hud-prompt');
        this.promptEl.textContent = i18nService.t('minigame.boneHeist.prompt');

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.promptEl?.remove();
            this.failFlowCleanup?.();
            setVirtualPadVisible(true);
        });
    }

    private createLoot(
        at: { x: number; y: number },
        texture: string,
        size: { w: number; h: number },
        depth: number
    ): Phaser.GameObjects.Image {
        const img = this.add.image(at.x, at.y, texture).setDepth(depth);
        img.setDisplaySize(size.w, size.h);
        // Hit area is in unscaled texture pixels; a circle 1.4× the texture's
        // larger half-dimension gives the generous grab the touch rules ask for.
        const grabRadius = (Math.max(img.width, img.height) / 2) * GRAB_SCALE;
        img.setInteractive({
            hitArea: new Phaser.Geom.Circle(img.width / 2, img.height / 2, grabRadius),
            hitAreaCallback: Phaser.Geom.Circle.Contains,
            draggable: true
        });
        return img;
    }

    // ----------------------------------------------------------------- drag

    private onDragStart(_pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject): void {
        if (this.state !== 'running') {
            return;
        }
        this.promptEl?.remove();
        this.promptEl = null;
        const img = obj as Phaser.GameObjects.Image;
        this.draggedBall = this.balls.includes(img) ? img : null;
        // Bump within its own class: a dragged ball still renders under the
        // bones, so a hard pull visibly happens "underneath".
        img.setDepth((this.draggedBall ? DEPTH_BALL : DEPTH_BONE) + DEPTH_DRAG_BUMP);
    }

    private onDrag(
        _pointer: Phaser.Input.Pointer,
        obj: Phaser.GameObjects.GameObject,
        dragX: number,
        dragY: number
    ): void {
        if (this.state !== 'running') {
            return;
        }
        const img = obj as Phaser.GameObjects.Image;
        const next = clampToPlayBounds({ x: dragX, y: dragY });
        this.pendingDragPx += Math.hypot(next.x - img.x, next.y - img.y);
        img.setPosition(next.x, next.y);
    }

    private onDragEnd(_pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject): void {
        this.draggedBall = null;
        if (this.state !== 'running') {
            return;
        }
        const img = obj as Phaser.GameObjects.Image;
        if (this.balls.includes(img) && isInBasket(img)) {
            this.deliverBall(img);
        }
    }

    private deliverBall(ball: Phaser.GameObjects.Image): void {
        ball.disableInteractive();
        ball.setDepth(DEPTH_BASKET - 0.5); // tucked behind the basket = "inside"
        this.tweens.add({
            targets: ball,
            x: BASKET.x,
            y: BASKET.y,
            scaleX: ball.scaleX * 0.6,
            scaleY: ball.scaleY * 0.6,
            duration: 200,
            ease: 'Quad.easeOut'
        });
        this.delivered++;
        if (this.delivered === BALL_STARTS.length) {
            this.onWin();
        }
    }

    // --------------------------------------------------------------- update

    update(_time: number, delta: number): void {
        if (this.state !== 'running') {
            return;
        }

        const coveredPull =
            this.draggedBall !== null &&
            isCovered(this.draggedBall, this.bones.map((bone) => ({ x: bone.x, y: bone.y })));
        this.noise = stepNoise({
            noise: this.noise,
            dragDistPx: this.pendingDragPx,
            deltaMs: delta,
            coveredPull
        });
        this.pendingDragPx = 0;
        this.noiseFill.setScale(this.noise / NOISE_MAX, 1);

        const prevPhase = this.dogState.phase;
        this.dogState = stepDog(this.dogState, delta, this.noise, this.timings);
        if (this.dogState.phase !== prevPhase) {
            this.applyDogPhase(this.dogState.phase);
        }

        const pointer = this.input.activePointer;
        if (
            this.dogState.phase === 'awake' &&
            pointer.isDown &&
            isInDanger({ x: pointer.worldX, y: pointer.worldY })
        ) {
            this.onBite();
        }
    }

    /** Telegraph is pure visuals at the top of the screen — no text, no hover. */
    private applyDogPhase(phase: DogPhase): void {
        const style = DANGER_STYLE[phase];
        this.dangerCircle.setFillStyle(style.color, style.alpha);
        this.tweens.killTweensOf(this.dogSprite);
        this.dogSprite.setScale(this.dogBaseScale.x, this.dogBaseScale.y);
        this.dogSprite.setPosition(DOG_POS.x, DOG_POS.y);
        if (phase === 'sleep') {
            this.dogSprite.clearTint();
            this.tweens.add({
                targets: this.dogSprite,
                scaleY: this.dogBaseScale.y * 1.05,
                duration: 900,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        } else if (phase === 'stir') {
            this.dogSprite.setTint(STIR_TINT);
            this.tweens.add({
                targets: this.dogSprite,
                x: DOG_POS.x + 6,
                duration: 70,
                yoyo: true,
                repeat: -1
            });
        } else {
            this.dogSprite.setTint(AWAKE_TINT);
            this.dogSprite.setScale(this.dogBaseScale.x * 1.12, this.dogBaseScale.y * 1.12);
        }
    }

    private onWin(): void {
        this.state = 'ended';
        this.time.delayedCall(WIN_BEAT_MS, () => this.completeActivity());
    }

    private onBite(): void {
        if (this.state !== 'running') {
            return;
        }
        this.state = 'ended';
        this.tweens.killTweensOf(this.dogSprite);
        this.dogSprite.setTint(AWAKE_TINT);
        this.tweens.add({
            targets: this.dogSprite,
            y: DOG_POS.y + 48,
            duration: 120,
            yoyo: true,
            ease: 'Quad.easeIn'
        });

        // Bring the pad back before the fail flow: its video skip is an
        // A-press, so touch players need their buttons (PLAN.md §3.10).
        // create() hides it again on retry-restart.
        setVirtualPadVisible(true);

        this.failFlowCleanup = runFailFlow({
            scene: this,
            videoKey: ENDING_VIDEO_KEY,
            failedTextKey: 'minigame.boneHeist.failed',
            retryTextKey: 'minigame.boneHeist.retry',
            quitTextKey: 'minigame.boneHeist.quit',
            bannerClassName: 'bone-heist-failed',
            onRetry: () => this.scene.restart({ activity: this.activity, flagId: this.flagId }),
            onQuit: () => this.abortActivity()
        });
    }
}
