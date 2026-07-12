import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../config/dimensions';
import { inputService } from '../../../input/InputService';
import { i18nService } from '../../../services/I18nService';
import { createOverlayElement } from '../../../ui/domOverlay';
import { runFailFlow } from '../failFlow';
import { SceneKeys } from '../../keys';
import { MiniGameScene } from '../MiniGameScene';
import { difficultyFor } from './difficulty';
import type { Difficulty } from './difficulty';
import {
    BACK_X,
    CARRIER_MAX_Y,
    CARRIER_MIN_Y,
    CARRIER_SPEED,
    CART_SPAN,
    CEILING_Y,
    FLOOR_Y,
    FRONT_X,
    MAX_SEPARATION,
    TILT_BASE
} from './geometry';

/**
 * Cart Carry — single-player take on Mario Party's co-op "Miner Setbacks":
 * two carriers haul a cart through an auto-scrolling cave, one per hand.
 * The stick moves the BACK carrier up/down, held A/B moves the FRONT one
 * up/down; the cart tilts between them (separation capped — it's rigid).
 * Obstacles scroll right→left: floor/ceiling spikes, tilt pairs offset by
 * exactly the cart span (forcing a tilted pass), and piranha pipes whose
 * plant is deadly only while extended (a tinted peek telegraphs it).
 * One hit fails: banner → ending video → Retry / Give up (../failFlow.ts).
 * Survive the timer to win; density/speed ramp in ./difficulty.ts behind
 * the one HARDNESS knob. Current art is placeholder photos — replacement
 * sizes in public/assets/images/cart-carry/README.md.
 */

const SURVIVE_MS = 30_000; // survive this long to win
const WIN_BEAT_MS = 300; // pause on the full bar before completing

const CARRIER_SIZE = 20;
const CARRIER_HITBOX = 0.7; // body shrunk vs the visible sprite (touch fairness)
const CART_THICKNESS = 8;
const SENSOR_W = 16; // cart hit sensors sampled along the segment
const SENSOR_H = 8;
const START_Y = 90; // both carriers' pre-run height

const SPIKE_W = 16;
const SPIKE_HITBOX = 0.85;
const SPIKE_JITTER = 8; // ± px shifted between a tilt pair's two heights
const PIPE_W = 16;
const PIPE_H = 20;
const PLANT_W = 12;
const PLANT_H = 36;
const PLANT_PEEK_H = 8; // visible height during the warning phase
const PLANT_WARN_TINT = 0xffe066;

const TILT_EXTRA_MS = 1200; // breather after a tilt pair before the next section
const INPUT_DEADZONE = 0.3;
const SPAWN_X = GAME_WIDTH + 8;
const CULL_MARGIN = 120; // obstacles die this far off-screen

const BAR_W = 120;
const BAR_H = 5;
const BAR_Y = 8;

const TEX_CARRIER = 'cart-carry-carrier';
const TEX_CART = 'cart-carry-cart';
const TEX_SPIKE = 'cart-carry-spike';
const TEX_PIPE = 'cart-carry-pipe';
const TEX_PLANT = 'cart-carry-plant';
const ENDING_VIDEO_KEY = 'cart-carry-ending';

// Per-sprite data keys. Obstacles are deadly unless DEADLY is false — a
// piranha plant toggles it with its cycle phase (the plant's body stays
// enabled so it keeps scrolling with its pipe).
const DEADLY = 'deadly';
const IS_PLANT = 'isPlant';
const SPAWN_T = 'spawnT';
const PHASE_OFFSET = 'phaseOffset';
const HIDDEN_MS = 'hiddenMs';
const WARN_MS = 'warnMs';
const EXTENDED_MS = 'extendedMs';
const CUR_PHASE = 'curPhase';

type PlantPhase = 'hidden' | 'warn' | 'extended';
type CartCarryState = 'ready' | 'running' | 'ended';

export class CartCarryMiniGame extends MiniGameScene {
    private back!: Phaser.Physics.Arcade.Sprite;
    private front!: Phaser.Physics.Arcade.Sprite;
    private cart!: Phaser.GameObjects.Image;
    private sensors: Phaser.Physics.Arcade.Sprite[] = [];
    private obstacles!: Phaser.Physics.Arcade.Group;
    private barFill!: Phaser.GameObjects.Rectangle;
    private state: CartCarryState = 'ready';
    private elapsedMs = 0;
    private sectionTimer: Phaser.Time.TimerEvent | null = null;
    private pendingExtraMs = 0;
    private aWasDown = true; // assume held at launch so a carried-over press can't start the run
    private bWasDown = true;
    private promptEl: HTMLElement | null = null;
    private failFlowCleanup: (() => void) | null = null;

    constructor() {
        super(SceneKeys.CartCarry);
    }

    preload(): void {
        if (!this.textures.exists(TEX_CARRIER)) {
            this.load.image(TEX_CARRIER, 'assets/images/cart-carry/carrier.png');
            this.load.image(TEX_CART, 'assets/images/cart-carry/cart.png');
            this.load.image(TEX_SPIKE, 'assets/images/cart-carry/spike.png');
            this.load.image(TEX_PIPE, 'assets/images/cart-carry/pipe.png');
            this.load.image(TEX_PLANT, 'assets/images/cart-carry/plant.png');
        }
        if (!this.cache.video.exists(ENDING_VIDEO_KEY)) {
            this.load.video(ENDING_VIDEO_KEY, 'assets/video/cart-carry-ending.mp4');
        }
    }

    create(): void {
        // The same scene instance is reused across launches and restarts.
        this.state = 'ready';
        this.elapsedMs = 0;
        this.sectionTimer = null;
        this.pendingExtraMs = 0;
        this.aWasDown = true;
        this.bWasDown = true;
        this.failFlowCleanup = null;
        this.sensors = [];

        this.cameras.main.setBackgroundColor('#241a12');
        this.add.rectangle(GAME_WIDTH / 2, CEILING_Y / 2, GAME_WIDTH, CEILING_Y, 0x4a3626);
        this.add.rectangle(GAME_WIDTH / 2, (FLOOR_Y + GAME_HEIGHT) / 2, GAME_WIDTH, GAME_HEIGHT - FLOOR_Y, 0x4a3626);

        this.cart = this.add.image((BACK_X + FRONT_X) / 2, START_Y, TEX_CART);

        this.back = this.createCarrier(BACK_X);
        this.front = this.createCarrier(FRONT_X);

        this.obstacles = this.physics.add.group();

        for (let i = 1; i <= 3; i++) {
            const sensor = this.physics.add.sprite(0, START_Y, TEX_CART);
            sensor.setDisplaySize(SENSOR_W, SENSOR_H).setVisible(false);
            this.sensors.push(sensor);
        }
        for (const target of [this.back, this.front, ...this.sensors]) {
            this.physics.add.overlap(target, this.obstacles, (_t, obstacle) =>
                this.onObstacleTouch(obstacle as Phaser.Physics.Arcade.Sprite)
            );
        }
        this.layoutCart();

        // Survival-timer bar (game-scene UI, no text → Phaser, not DOM — §3.8).
        this.add
            .rectangle(GAME_WIDTH / 2, BAR_Y, BAR_W + 2, BAR_H + 2)
            .setStrokeStyle(1, 0xffffff);
        this.barFill = this.add
            .rectangle(GAME_WIDTH / 2 - BAR_W / 2, BAR_Y, BAR_W, BAR_H, 0x8fd18f)
            .setOrigin(0, 0.5)
            .setScale(0, 1);

        this.promptEl = createOverlayElement('hud-prompt');
        this.promptEl.textContent = i18nService.t('minigame.cartCarry.prompt');

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.promptEl?.remove();
            this.failFlowCleanup?.();
        });
    }

    private createCarrier(x: number): Phaser.Physics.Arcade.Sprite {
        const carrier = this.physics.add.sprite(x, START_Y, TEX_CARRIER);
        carrier.setDisplaySize(CARRIER_SIZE, CARRIER_SIZE);
        // Body size is in unscaled texture pixels; the scale from
        // setDisplaySize shrinks it to CARRIER_SIZE * CARRIER_HITBOX on screen.
        carrier.setBodySize(carrier.width * CARRIER_HITBOX, carrier.height * CARRIER_HITBOX);
        return carrier;
    }

    update(time: number, delta: number): void {
        if (this.state === 'ended') {
            return;
        }

        const dirY = inputService.direction().y;
        const aDown = inputService.isDown('A');
        const bDown = inputService.isDown('B');
        const aPressed = aDown && !this.aWasDown;
        const bPressed = bDown && !this.bWasDown;
        this.aWasDown = aDown;
        this.bWasDown = bDown;

        if (this.state === 'ready') {
            if (Math.abs(dirY) > INPUT_DEADZONE || aPressed || bPressed) {
                this.startRun();
            }
            return;
        }

        this.elapsedMs += delta;
        this.barFill.setScale(Math.min(1, this.elapsedMs / SURVIVE_MS), 1);
        if (this.elapsedMs >= SURVIVE_MS) {
            this.onWin();
            return;
        }

        const dt = delta / 1000;
        if (dt > 0) {
            // Bounds and the rigid-cart cap are enforced in velocity space —
            // carriers land exactly on a limit, never teleport (keeps arcade
            // overlap reliable, same rule as flappy's oscillators).
            let vyBack = Math.abs(dirY) > INPUT_DEADZONE ? Math.sign(dirY) * CARRIER_SPEED : 0;
            let vyFront = (aDown ? -CARRIER_SPEED : 0) + (bDown ? CARRIER_SPEED : 0);
            vyBack = this.clampToBand(this.back.y, vyBack, dt);
            vyFront = this.clampToBand(this.front.y, vyFront, dt);
            [vyBack, vyFront] = this.capSeparation(vyBack, vyFront, dt);
            this.back.setVelocityY(vyBack);
            this.front.setVelocityY(vyFront);
        }

        this.layoutCart();
        this.drivePlantsAndCull(time);
    }

    private clampToBand(y: number, vy: number, dt: number): number {
        const next = y + vy * dt;
        if (next < CARRIER_MIN_Y) {
            return (CARRIER_MIN_Y - y) / dt;
        }
        if (next > CARRIER_MAX_Y) {
            return (CARRIER_MAX_Y - y) / dt;
        }
        return vy;
    }

    /** Rigid cart: shave velocity off whichever carrier(s) move apart past the cap. */
    private capSeparation(vyBack: number, vyFront: number, dt: number): [number, number] {
        const nextBack = this.back.y + vyBack * dt;
        const nextFront = this.front.y + vyFront * dt;
        const over = Math.abs(nextBack - nextFront) - MAX_SEPARATION;
        if (over <= 0) {
            return [vyBack, vyFront];
        }
        const apart = Math.sign(nextBack - nextFront); // back moving this way separates
        const backApart = vyBack * apart > 0;
        const frontApart = vyFront * -apart > 0;
        const share = (over / dt) * (backApart && frontApart ? 0.5 : 1);
        return [
            backApart ? vyBack - apart * share : vyBack,
            frontApart ? vyFront + apart * share : vyFront
        ];
    }

    /** Stretch/rotate the cart between the carriers; re-seat the hit sensors. */
    private layoutCart(): void {
        const dy = this.front.y - this.back.y;
        this.cart.setPosition((BACK_X + FRONT_X) / 2, (this.back.y + this.front.y) / 2);
        this.cart.setDisplaySize(Math.hypot(CART_SPAN, dy), CART_THICKNESS);
        this.cart.setRotation(Math.atan2(dy, CART_SPAN));
        this.sensors.forEach((sensor, i) => {
            const f = (i + 1) / 4;
            sensor.setPosition(BACK_X + CART_SPAN * f, this.back.y + dy * f);
        });
    }

    private startRun(): void {
        this.state = 'running';
        this.promptEl?.remove();
        this.promptEl = null;
        this.scheduleSection();
    }

    /** Elapsed fraction of the survival timer — drives the difficulty ramp. */
    private difficulty(): Difficulty {
        return difficultyFor(this.elapsedMs / SURVIVE_MS);
    }

    // One weighted spawner (vs flappy's independent timers): sections never
    // overlap, and a tilt pair buys itself a breather before the next roll.
    private scheduleSection(): void {
        const delay = this.difficulty().sectionIntervalMs + this.pendingExtraMs;
        this.pendingExtraMs = 0;
        this.sectionTimer = this.time.delayedCall(delay, () => {
            this.spawnSection();
            this.scheduleSection();
        });
    }

    private spawnSection(): void {
        const d = this.difficulty();
        const roll = Math.random();
        if (roll < d.tiltChance) {
            this.spawnTiltPair(d);
            this.pendingExtraMs = TILT_EXTRA_MS;
        } else if (roll < d.tiltChance + d.piranhaChance) {
            this.spawnPiranha(d);
        } else {
            this.spawnSpike(d.scrollSpeed, Phaser.Math.Between(d.spikeMinH, d.spikeMaxH), Math.random() < 0.5, SPAWN_X);
        }
    }

    private spawnSpike(scrollSpeed: number, height: number, fromCeiling: boolean, x: number): void {
        const spike = this.obstacles.create(
            x,
            fromCeiling ? CEILING_Y + height / 2 : FLOOR_Y - height / 2,
            TEX_SPIKE
        ) as Phaser.Physics.Arcade.Sprite;
        spike.setDisplaySize(SPIKE_W, height).setFlipY(fromCeiling);
        spike.setBodySize(spike.width * SPIKE_HITBOX, spike.height * SPIKE_HITBOX);
        spike.setVelocityX(-scrollSpeed);
    }

    /**
     * Floor+ceiling spikes offset by exactly the cart span: when the floor
     * spike is under one carrier the ceiling spike is over the other, so the
     * cart must tilt by `tiltSeparation` (heights sum to it plus TILT_BASE —
     * always inside MAX_SEPARATION, see difficulty.ts invariants).
     */
    private spawnTiltPair(d: Difficulty): void {
        const sum = d.tiltSeparation + TILT_BASE;
        const jitter = Phaser.Math.Between(-SPIKE_JITTER, SPIKE_JITTER);
        const floorH = sum / 2 + jitter;
        const ceilingH = sum - floorH;
        const floorLeads = Math.random() < 0.5;
        this.spawnSpike(d.scrollSpeed, floorH, false, floorLeads ? SPAWN_X : SPAWN_X + CART_SPAN);
        this.spawnSpike(d.scrollSpeed, ceilingH, true, floorLeads ? SPAWN_X + CART_SPAN : SPAWN_X);
    }

    /** Pipe on the floor (always deadly) + plant that cycles hidden/warn/extended. */
    private spawnPiranha(d: Difficulty): void {
        const pipe = this.obstacles.create(SPAWN_X, FLOOR_Y - PIPE_H / 2, TEX_PIPE) as Phaser.Physics.Arcade.Sprite;
        pipe.setDisplaySize(PIPE_W, PIPE_H).setVelocityX(-d.scrollSpeed);

        const plant = this.obstacles.create(SPAWN_X, this.plantY('hidden'), TEX_PLANT) as Phaser.Physics.Arcade.Sprite;
        plant.setDisplaySize(PLANT_W, PLANT_PEEK_H).setVisible(false).setVelocityX(-d.scrollSpeed);
        const cycleMs = d.piranhaHiddenMs + d.piranhaWarnMs + d.piranhaExtendedMs;
        plant.setData(IS_PLANT, true);
        plant.setData(DEADLY, false);
        plant.setData(CUR_PHASE, 'hidden' satisfies PlantPhase);
        plant.setData(SPAWN_T, this.time.now);
        plant.setData(PHASE_OFFSET, Math.random() * cycleMs);
        plant.setData(HIDDEN_MS, d.piranhaHiddenMs);
        plant.setData(WARN_MS, d.piranhaWarnMs);
        plant.setData(EXTENDED_MS, d.piranhaExtendedMs);
    }

    private plantY(phase: PlantPhase): number {
        const pipeTop = FLOOR_Y - PIPE_H;
        return phase === 'extended' ? pipeTop - PLANT_H / 2 : pipeTop - PLANT_PEEK_H / 2;
    }

    /**
     * Cull off-screen obstacles and run the piranha cycle. The phase comes
     * from scene time (no per-pipe timers to clean up); visuals and the
     * DEADLY flag change only on phase transitions. The plant's body stays
     * enabled throughout so it keeps scrolling — deadliness is gated by the
     * flag in onObstacleTouch, not by body.enable.
     */
    private drivePlantsAndCull(time: number): void {
        for (const child of [...this.obstacles.getChildren()]) {
            const sprite = child as Phaser.Physics.Arcade.Sprite;
            if (sprite.x < -CULL_MARGIN) {
                sprite.destroy();
                continue;
            }
            if (!sprite.getData(IS_PLANT)) {
                continue;
            }
            const hiddenMs = sprite.getData(HIDDEN_MS) as number;
            const warnMs = sprite.getData(WARN_MS) as number;
            const extendedMs = sprite.getData(EXTENDED_MS) as number;
            const cycleMs = hiddenMs + warnMs + extendedMs;
            const cyclePos =
                (time - (sprite.getData(SPAWN_T) as number) + (sprite.getData(PHASE_OFFSET) as number)) % cycleMs;
            const phase: PlantPhase = cyclePos < hiddenMs ? 'hidden' : cyclePos < hiddenMs + warnMs ? 'warn' : 'extended';
            if (phase === sprite.getData(CUR_PHASE)) {
                continue;
            }
            sprite.setData(CUR_PHASE, phase);
            sprite.setData(DEADLY, phase === 'extended');
            sprite.setVisible(phase !== 'hidden');
            sprite.setDisplaySize(PLANT_W, phase === 'extended' ? PLANT_H : PLANT_PEEK_H);
            sprite.setY(this.plantY(phase));
            if (phase === 'warn') {
                sprite.setTint(PLANT_WARN_TINT);
            } else {
                sprite.clearTint();
            }
        }
    }

    private onObstacleTouch(obstacle: Phaser.Physics.Arcade.Sprite): void {
        if (obstacle.getData(DEADLY) === false) {
            return; // a hidden/peeking piranha plant
        }
        this.onHit();
    }

    private onWin(): void {
        this.state = 'ended';
        this.freezePlay();
        this.time.delayedCall(WIN_BEAT_MS, () => this.completeActivity());
    }

    private onHit(): void {
        if (this.state !== 'running') {
            return;
        }
        this.state = 'ended';
        this.freezePlay();
        this.back.setTint(0xff0000);
        this.front.setTint(0xff0000);
        this.cart.setTint(0xff0000);

        this.failFlowCleanup = runFailFlow({
            scene: this,
            videoKey: ENDING_VIDEO_KEY,
            failedTextKey: 'minigame.cartCarry.failed',
            retryTextKey: 'minigame.cartCarry.retry',
            quitTextKey: 'minigame.cartCarry.quit',
            bannerClassName: 'cart-carry-failed',
            onRetry: () => this.scene.restart({ activity: this.activity, flagId: this.flagId }),
            onQuit: () => this.abortActivity()
        });
    }

    private freezePlay(): void {
        this.sectionTimer?.remove();
        this.physics.pause();
    }
}
