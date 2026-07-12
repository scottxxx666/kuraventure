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

/**
 * Flappy Flight — Flappy Bird-style survival run. Press A to flap; survive
 * the timer to win. Obstacles scroll right→left: pipe-pair gates (some with
 * an oscillating gap), floating single images (some bobbing), and diagonal
 * sweepers from the top-right/bottom-right corners; density/speed ramp with
 * the timer (./difficulty.ts). Touching anything — or the floor/ceiling —
 * fails: banner → ending video → Retry / Give up (../failFlow.ts).
 * Current art is placeholder photos — replacement sizes in
 * public/assets/images/flappy/README.md.
 */

const SURVIVE_MS = 60_000; // survive this long to win
const WIN_BEAT_MS = 300; // pause on the full bar before completing

const PLAYER_X = 64;
const GRAVITY_Y = 600; // px/s²
const FLAP_VELOCITY = -180; // px/s upward per A press
const PLAYER_HITBOX = 0.7; // body shrunk vs the visible sprite (touch fairness)
const HOVER_VELOCITY = 15; // gentle pre-start bob, px/s

const GATE_SEGMENT = 32; // square segment size of a gate column
const GATE_EDGE_MARGIN = 8; // min distance of the gap edge from floor/ceiling
const MOVER_AMPLITUDE = 18; // px a moving gate's gap travels up/down
const MOVER_PERIOD_MS = 2200;
const BOB_AMPLITUDE = 12;
const BOB_PERIOD_MS = 1600;
const SWEEPER_EXTRA_VX = 40; // sweepers outrun the scroll by this much, px/s
const SWEEPER_VY = 65; // vertical crossing speed, px/s
const CULL_MARGIN = 120; // obstacles die this far off-screen

// Logical display sizes (the placeholder photos are much larger).
const PLAYER_SIZE = 24;
const FLOATER_SIZE = 24;
const SWEEPER_SIZE = 32;
const BAR_W = 120;
const BAR_H = 5;
const BAR_Y = 8;

const TEX_PLAYER = 'flappy-player';
const TEX_PIPE = 'flappy-pipe';
const TEX_FLOATER = 'flappy-floater';
const TEX_SWEEPER = 'flappy-sweeper';
const ENDING_VIDEO_KEY = 'flappy-ending';

// Per-sprite data keys driving the sine oscillation (movers/bobbers). Gate
// segments share one oscStart so the whole gap moves as a unit.
const OSC_AMP = 'oscAmp';
const OSC_PERIOD = 'oscPeriod';
const OSC_START = 'oscStart';

type FlappyState = 'ready' | 'running' | 'ended';

export class FlappyMiniGame extends MiniGameScene {
    private player!: Phaser.Physics.Arcade.Sprite;
    private obstacles!: Phaser.Physics.Arcade.Group;
    private barFill!: Phaser.GameObjects.Rectangle;
    private state: FlappyState = 'ready';
    private elapsedMs = 0;
    private gateTimer: Phaser.Time.TimerEvent | null = null;
    private floaterTimer: Phaser.Time.TimerEvent | null = null;
    private sweeperTimer: Phaser.Time.TimerEvent | null = null;
    private promptEl: HTMLElement | null = null;
    private failFlowCleanup: (() => void) | null = null;
    private offFlap: (() => void) | null = null;

    constructor() {
        super(SceneKeys.Flappy);
    }

    preload(): void {
        if (!this.textures.exists(TEX_PLAYER)) {
            this.load.image(TEX_PLAYER, 'assets/images/flappy/player.png');
            this.load.image(TEX_PIPE, 'assets/images/flappy/pipe.png');
            this.load.image(TEX_FLOATER, 'assets/images/flappy/floater.png');
            this.load.image(TEX_SWEEPER, 'assets/images/flappy/sweeper.png');
        }
        if (!this.cache.video.exists(ENDING_VIDEO_KEY)) {
            this.load.video(ENDING_VIDEO_KEY, 'assets/video/flappy-ending.mp4');
        }
    }

    create(): void {
        // The same scene instance is reused across launches and restarts.
        this.state = 'ready';
        this.elapsedMs = 0;
        this.gateTimer = null;
        this.floaterTimer = null;
        this.sweeperTimer = null;
        this.failFlowCleanup = null;

        this.cameras.main.setBackgroundColor('#1d2a3d');

        this.player = this.physics.add.sprite(PLAYER_X, GAME_HEIGHT / 2, TEX_PLAYER);
        this.player.setDisplaySize(PLAYER_SIZE, PLAYER_SIZE);
        // Body size is in unscaled texture pixels; the scale from
        // setDisplaySize shrinks it to PLAYER_SIZE * PLAYER_HITBOX on screen.
        this.player.setBodySize(this.player.width * PLAYER_HITBOX, this.player.height * PLAYER_HITBOX);

        this.obstacles = this.physics.add.group();
        this.physics.add.overlap(this.player, this.obstacles, () => this.onHit());

        // Survival-timer bar (game-scene UI, no text → Phaser, not DOM — §3.8).
        this.add
            .rectangle(GAME_WIDTH / 2, BAR_Y, BAR_W + 2, BAR_H + 2)
            .setStrokeStyle(1, 0xffffff);
        this.barFill = this.add
            .rectangle(GAME_WIDTH / 2 - BAR_W / 2, BAR_Y, BAR_W, BAR_H, 0x8fd18f)
            .setOrigin(0, 0.5)
            .setScale(0, 1);

        this.promptEl = createOverlayElement('hud-prompt');
        this.promptEl.textContent = i18nService.t('minigame.flappy.prompt');

        this.offFlap = inputService.onPress('A', () => this.onFlap());

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.promptEl?.remove();
            this.offFlap?.();
            this.failFlowCleanup?.();
        });
    }

    update(time: number, delta: number): void {
        if (this.state === 'ended') {
            return;
        }
        if (this.state === 'ready') {
            // Gravity-free hover until the first flap.
            this.player.setVelocityY(Math.cos(time / 250) * HOVER_VELOCITY);
            return;
        }

        this.elapsedMs += delta;
        this.barFill.setScale(Math.min(1, this.elapsedMs / SURVIVE_MS), 1);
        if (this.elapsedMs >= SURVIVE_MS) {
            this.onWin();
            return;
        }

        // Classic rule: the floor AND the ceiling end the run.
        const half = PLAYER_SIZE / 2;
        if (this.player.y <= half || this.player.y >= GAME_HEIGHT - half) {
            this.onHit();
            return;
        }

        this.driveOscillatorsAndCull(time);
    }

    private onFlap(): void {
        if (this.state === 'ended') {
            return; // the fail flow owns A (video skip) past this point
        }
        if (this.state === 'ready') {
            this.startRun();
        }
        this.player.setVelocityY(FLAP_VELOCITY);
    }

    private startRun(): void {
        this.state = 'running';
        this.promptEl?.remove();
        this.promptEl = null;
        this.player.setGravityY(GRAVITY_Y);
        this.scheduleGate();
        this.scheduleFloater();
        this.scheduleSweeper();
    }

    /** Elapsed fraction of the survival timer — drives the difficulty ramp. */
    private difficulty(): Difficulty {
        return difficultyFor(this.elapsedMs / SURVIVE_MS);
    }

    // Spawners re-schedule themselves so the interval tracks the ramp.
    private scheduleGate(): void {
        this.gateTimer = this.time.delayedCall(this.difficulty().gateIntervalMs, () => {
            this.spawnGate();
            this.scheduleGate();
        });
    }

    private scheduleFloater(): void {
        this.floaterTimer = this.time.delayedCall(this.difficulty().floaterIntervalMs, () => {
            if (this.difficulty().floaterActive) {
                this.spawnFloater();
            }
            this.scheduleFloater();
        });
    }

    private scheduleSweeper(): void {
        this.sweeperTimer = this.time.delayedCall(this.difficulty().sweeperIntervalMs, () => {
            if (this.difficulty().sweeperActive) {
                this.spawnSweeper();
            }
            this.scheduleSweeper();
        });
    }

    /** Pipe-pair gate: top+bottom columns of stacked segments around a gap. */
    private spawnGate(): void {
        const { scrollSpeed, gapSize, moverChance } = this.difficulty();
        const mover = Math.random() < moverChance;
        // A moving gap needs extra clearance so it never swings past the edges.
        const margin = GATE_EDGE_MARGIN + (mover ? MOVER_AMPLITUDE : 0);
        const gapCenter = Phaser.Math.Between(
            Math.round(gapSize / 2 + margin),
            Math.round(GAME_HEIGHT - gapSize / 2 - margin)
        );
        const x = GAME_WIDTH + GATE_SEGMENT / 2;
        const oscStart = mover ? this.time.now : 0;
        // Columns overshoot the screen edges by the swing so no hole opens up.
        const overshoot = GATE_SEGMENT + MOVER_AMPLITUDE;
        for (let y = gapCenter - gapSize / 2 - GATE_SEGMENT / 2; y > -overshoot; y -= GATE_SEGMENT) {
            this.spawnObstacle(TEX_PIPE, x, y, GATE_SEGMENT, -scrollSpeed, 0, mover, MOVER_AMPLITUDE, MOVER_PERIOD_MS, oscStart);
        }
        for (let y = gapCenter + gapSize / 2 + GATE_SEGMENT / 2; y < GAME_HEIGHT + overshoot; y += GATE_SEGMENT) {
            this.spawnObstacle(TEX_PIPE, x, y, GATE_SEGMENT, -scrollSpeed, 0, mover, MOVER_AMPLITUDE, MOVER_PERIOD_MS, oscStart);
        }
    }

    /** Free-floating single image at a random height; some sine-bob. */
    private spawnFloater(): void {
        const { scrollSpeed, bobChance } = this.difficulty();
        const bob = Math.random() < bobChance;
        const margin = FLOATER_SIZE + (bob ? BOB_AMPLITUDE : 0);
        const y = Phaser.Math.Between(margin, GAME_HEIGHT - margin);
        this.spawnObstacle(
            TEX_FLOATER,
            GAME_WIDTH + FLOATER_SIZE,
            y,
            FLOATER_SIZE,
            -scrollSpeed,
            0,
            bob,
            BOB_AMPLITUDE,
            BOB_PERIOD_MS,
            this.time.now
        );
    }

    /** Diagonal sweeper: enters at a right corner, crosses to the far edge. */
    private spawnSweeper(): void {
        const { scrollSpeed } = this.difficulty();
        const fromTop = Math.random() < 0.5;
        this.spawnObstacle(
            TEX_SWEEPER,
            GAME_WIDTH + SWEEPER_SIZE,
            fromTop ? -SWEEPER_SIZE : GAME_HEIGHT + SWEEPER_SIZE,
            SWEEPER_SIZE,
            -(scrollSpeed + SWEEPER_EXTRA_VX),
            fromTop ? SWEEPER_VY : -SWEEPER_VY,
            false,
            0,
            0,
            0
        );
    }

    private spawnObstacle(
        texture: string,
        x: number,
        y: number,
        size: number,
        vx: number,
        vy: number,
        oscillates: boolean,
        oscAmp: number,
        oscPeriodMs: number,
        oscStart: number
    ): void {
        const sprite = this.obstacles.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
        sprite.setDisplaySize(size, size).setVelocity(vx, vy);
        if (oscillates) {
            sprite.setData(OSC_AMP, oscAmp);
            sprite.setData(OSC_PERIOD, oscPeriodMs);
            sprite.setData(OSC_START, oscStart);
        }
    }

    /**
     * Sine motion is applied as per-frame velocity (never teleported
     * positions) so arcade overlap stays reliable; segments sharing an
     * oscStart get identical velocities, keeping their gap intact.
     */
    private driveOscillatorsAndCull(time: number): void {
        for (const child of [...this.obstacles.getChildren()]) {
            const sprite = child as Phaser.Physics.Arcade.Sprite;
            if (
                sprite.x < -CULL_MARGIN ||
                sprite.y < -CULL_MARGIN ||
                sprite.y > GAME_HEIGHT + CULL_MARGIN
            ) {
                sprite.destroy();
                continue;
            }
            const amp = sprite.getData(OSC_AMP) as number | undefined;
            if (amp !== undefined) {
                const omega = (2 * Math.PI) / (sprite.getData(OSC_PERIOD) as number);
                const t = time - (sprite.getData(OSC_START) as number);
                sprite.setVelocityY(amp * omega * Math.cos(omega * t));
            }
        }
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
        this.player.setTint(0xff0000);

        this.failFlowCleanup = runFailFlow({
            scene: this,
            videoKey: ENDING_VIDEO_KEY,
            failedTextKey: 'minigame.flappy.failed',
            retryTextKey: 'minigame.flappy.retry',
            quitTextKey: 'minigame.flappy.quit',
            bannerClassName: 'flappy-failed',
            onRetry: () => this.scene.restart({ activity: this.activity, flagId: this.flagId }),
            onQuit: () => this.abortActivity()
        });
    }

    private freezePlay(): void {
        this.gateTimer?.remove();
        this.floaterTimer?.remove();
        this.sweeperTimer?.remove();
        this.physics.pause();
    }
}
