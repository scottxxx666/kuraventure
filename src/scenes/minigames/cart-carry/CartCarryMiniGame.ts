import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../config/dimensions';
import { inputService } from '../../../input/InputService';
import type { Vec2 } from '../../../input/InputService';
import { setVirtualPadTwinStick } from '../../../input/VirtualPadSource';
import { i18nService } from '../../../services/I18nService';
import { createOverlayElement } from '../../../ui/domOverlay';
import { runFailFlow } from '../failFlow';
import { SceneKeys } from '../../keys';
import { HUD_OFFSET_X, HUD_OFFSET_Y } from '../../pixelCamera';
import { MiniGameScene } from '../MiniGameScene';
import { difficultyFor } from './difficulty';
import type { Difficulty } from './difficulty';
import {
    BACK_START,
    CARRIER_MAX_Y,
    CARRIER_MIN_Y,
    CARRIER_SIZE,
    CARRIER_SPEED,
    CEILING_Y,
    CORRIDOR_H,
    FLOOR_Y,
    FRONT_START,
    GOAL_X,
    LEVEL_W,
    MAX_CHANNEL_SHIFT,
    MAX_DIST,
    MIN_DIST,
    OBSTACLE_END_X,
    OBSTACLE_START_X,
    SLALOM_OFFSET_PX,
    constrainSpan
} from './geometry';

/**
 * Cart Carry — single-player take on Mario Party's co-op "Miner Setbacks":
 * two carriers haul a cart through a static cave, one hand each. Twin-stick
 * (PLAN.md §3.10 signed-off exception): WASD / left virtual stick moves the
 * BACK carrier, arrows / right virtual stick the FRONT one, both free in 4
 * directions at their own pace. The cart spans between them with a loose
 * grip (distance clamped to [MIN_DIST, MAX_DIST], rotation free). The level
 * is generated at create() from ./difficulty.ts (one HARDNESS knob): floor/
 * ceiling spikes, slalom pairs, pinch gates and piranha pipes whose plant is
 * deadly only while extended (a tinted peek telegraphs it). One hit fails:
 * banner → ending video → Retry / Give up (../failFlow.ts). Reach the goal
 * line to win — no timer; the bar shows distance. Current art is placeholder
 * photos — replacement sizes in public/assets/images/cart-carry/README.md.
 */

const WIN_BEAT_MS = 300; // pause on the full bar before completing

const CARRIER_HITBOX = 0.7; // body shrunk vs the visible sprite (touch fairness)
const CART_THICKNESS = 8;
const SENSOR_W = 16; // cart hit sensors sampled along the segment
const SENSOR_H = 8;
const CARRIER_MIN_X = 12;
const CARRIER_MAX_X = LEVEL_W - 12;

const SPIKE_W = 16;
const SPIKE_HITBOX = 0.85;
const GATE_EDGE_MARGIN = 4; // min spike height a gate keeps on each side
const PIPE_W = 16;
const PIPE_H = 20;
const PLANT_W = 12;
const PLANT_H = 36;
const PLANT_PEEK_H = 8; // visible height during the warning phase
const PLANT_WARN_TINT = 0xffe066;

const INPUT_DEADZONE = 0.3;
const PROGRESS_START_X = (BACK_START.x + FRONT_START.x) / 2;

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
// piranha plant toggles it with its cycle phase (its static body stays at
// the extended position; only visuals change per phase).
const DEADLY = 'deadly';
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
    private obstacles!: Phaser.Physics.Arcade.StaticGroup;
    private plants: Phaser.Physics.Arcade.Sprite[] = [];
    private followTarget!: Phaser.GameObjects.Rectangle;
    private barFill!: Phaser.GameObjects.Rectangle;
    private state: CartCarryState = 'ready';
    private createdAt = 0;
    private channelCenter = GAME_HEIGHT / 2; // level-gen solvability tracking
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
        this.failFlowCleanup = null;
        this.sensors = [];
        this.plants = [];
        this.channelCenter = GAME_HEIGHT / 2;
        this.createdAt = this.time.now;

        inputService.setTwinStick(true);
        setVirtualPadTwinStick(true);

        this.physics.world.setBounds(0, 0, LEVEL_W, GAME_HEIGHT);
        this.cameras.main.setBounds(0, 0, LEVEL_W, GAME_HEIGHT);
        this.cameras.main.setBackgroundColor('#241a12');
        this.add.rectangle(LEVEL_W / 2, CEILING_Y / 2, LEVEL_W, CEILING_Y, 0x4a3626);
        this.add.rectangle(LEVEL_W / 2, (FLOOR_Y + GAME_HEIGHT) / 2, LEVEL_W, GAME_HEIGHT - FLOOR_Y, 0x4a3626);
        this.add.rectangle(GOAL_X, GAME_HEIGHT / 2, 6, CORRIDOR_H, 0x8fd18f, 0.5);

        this.cart = this.add.image(PROGRESS_START_X, BACK_START.y, TEX_CART);
        this.back = this.createCarrier(BACK_START);
        this.front = this.createCarrier(FRONT_START);

        this.obstacles = this.physics.add.staticGroup();

        for (let i = 1; i <= 3; i++) {
            const sensor = this.physics.add.sprite(PROGRESS_START_X, BACK_START.y, TEX_CART);
            sensor.setDisplaySize(SENSOR_W, SENSOR_H).setVisible(false);
            this.sensors.push(sensor);
        }
        for (const target of [this.back, this.front, ...this.sensors]) {
            this.physics.add.overlap(target, this.obstacles, (_t, obstacle) =>
                this.onObstacleTouch(obstacle as Phaser.GameObjects.GameObject)
            );
        }

        this.generateLevel();
        this.layoutCart();

        this.followTarget = this.add.rectangle(PROGRESS_START_X, GAME_HEIGHT / 2, 1, 1).setVisible(false);
        this.cameras.main.startFollow(this.followTarget, true, 0.15, 0.15);

        // Distance bar (game-scene UI, no text → Phaser, not DOM — §3.8).
        // sf=0 objects need the HUD offset to land on screen (pixelCamera.ts).
        this.add
            .rectangle(GAME_WIDTH / 2 + HUD_OFFSET_X, BAR_Y + HUD_OFFSET_Y, BAR_W + 2, BAR_H + 2)
            .setStrokeStyle(1, 0xffffff)
            .setScrollFactor(0);
        this.barFill = this.add
            .rectangle(GAME_WIDTH / 2 - BAR_W / 2 + HUD_OFFSET_X, BAR_Y + HUD_OFFSET_Y, BAR_W, BAR_H, 0x8fd18f)
            .setOrigin(0, 0.5)
            .setScale(0, 1)
            .setScrollFactor(0);

        this.promptEl = createOverlayElement('hud-prompt');
        this.promptEl.textContent = i18nService.t('minigame.cartCarry.prompt');

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.promptEl?.remove();
            this.failFlowCleanup?.();
            inputService.setTwinStick(false);
            setVirtualPadTwinStick(false);
        });
    }

    private createCarrier(at: Vec2): Phaser.Physics.Arcade.Sprite {
        const carrier = this.physics.add.sprite(at.x, at.y, TEX_CARRIER);
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

        const d1 = inputService.direction();
        const d2 = inputService.direction2();

        if (this.state === 'ready') {
            if (Math.hypot(d1.x, d1.y) > INPUT_DEADZONE || Math.hypot(d2.x, d2.y) > INPUT_DEADZONE) {
                this.startRun();
            }
            this.drivePlants(time);
            return;
        }

        // Kinematic movement (no physics velocities): the loose-grip cart is
        // then a simple position projection, and at <2 px/frame the arcade
        // overlap (bodies re-sync from the game objects each step) is safe.
        const dt = delta / 1000;
        let bp = { x: this.back.x + d1.x * CARRIER_SPEED * dt, y: this.back.y + d1.y * CARRIER_SPEED * dt };
        let fp = { x: this.front.x + d2.x * CARRIER_SPEED * dt, y: this.front.y + d2.y * CARRIER_SPEED * dt };
        bp = clampToBand(bp);
        fp = clampToBand(fp);
        [bp, fp] = constrainSpan(bp, fp, MIN_DIST, MAX_DIST);
        // Re-clamp after the projection; a residual overshoot of a few px in
        // a corner is visual only (the cart stretches to the actual distance)
        // and self-corrects next frame.
        bp = clampToBand(bp);
        fp = clampToBand(fp);
        this.back.setPosition(bp.x, bp.y);
        this.front.setPosition(fp.x, fp.y);
        this.layoutCart();

        const midX = (this.back.x + this.front.x) / 2;
        this.followTarget.setPosition(midX, GAME_HEIGHT / 2);
        this.barFill.setScale(
            Math.min(1, Math.max(0, (midX - PROGRESS_START_X) / (GOAL_X - PROGRESS_START_X))),
            1
        );
        if (midX >= GOAL_X) {
            this.onWin();
            return;
        }

        this.drivePlants(time);
    }

    /** Stretch/rotate the cart between the carriers; re-seat the hit sensors. */
    private layoutCart(): void {
        const dx = this.front.x - this.back.x;
        const dy = this.front.y - this.back.y;
        this.cart.setPosition(this.back.x + dx / 2, this.back.y + dy / 2);
        this.cart.setDisplaySize(Math.hypot(dx, dy), CART_THICKNESS);
        this.cart.setRotation(Math.atan2(dy, dx));
        this.sensors.forEach((sensor, i) => {
            const f = (i + 1) / 4;
            sensor.setPosition(this.back.x + dx * f, this.back.y + dy * f);
        });
    }

    private startRun(): void {
        this.state = 'running';
        this.promptEl?.remove();
        this.promptEl = null;
    }

    // ---------------------------------------------------------------- level

    /**
     * Places the whole level at create(): sections from OBSTACLE_START_X to
     * OBSTACLE_END_X, each rolled from the difficulty at that point of the
     * zone. `channelCenter` keeps consecutive open channels within
     * MAX_CHANNEL_SHIFT so no transition is ever impossible for the cart.
     */
    private generateLevel(): void {
        let x = OBSTACLE_START_X;
        while (x < OBSTACLE_END_X) {
            const t = (x - OBSTACLE_START_X) / (OBSTACLE_END_X - OBSTACLE_START_X);
            const d = difficultyFor(t);
            const roll = Math.random();
            let width: number;
            if (roll < d.gateChance) {
                width = this.placeGate(d, x);
            } else if (roll < d.gateChance + d.slalomChance) {
                width = this.placeSlalom(d, x);
            } else if (roll < d.gateChance + d.slalomChance + d.piranhaChance) {
                width = this.placePiranha(d, x);
            } else {
                width = this.placeSingleSpike(d, x);
            }
            x += width + d.sectionGapPx;
        }
    }

    /** Aligned ceiling+floor spikes leaving gateGapSize open at the shifted channel. */
    private placeGate(d: Difficulty, x: number): number {
        const halfGap = d.gateGapSize / 2;
        const shifted = this.channelCenter + Phaser.Math.Between(-MAX_CHANNEL_SHIFT, MAX_CHANNEL_SHIFT);
        const center = Phaser.Math.Clamp(
            shifted,
            CEILING_Y + halfGap + GATE_EDGE_MARGIN,
            FLOOR_Y - halfGap - GATE_EDGE_MARGIN
        );
        this.placeSpike(x, center - halfGap - CEILING_Y, true);
        this.placeSpike(x, FLOOR_Y - (center + halfGap), false);
        this.channelCenter = center;
        return SPIKE_W;
    }

    /** Two random-height spikes on opposite sides, offset by the cart span. */
    private placeSlalom(d: Difficulty, x: number): number {
        const floorLeads = Math.random() < 0.5;
        const h1 = Phaser.Math.Between(d.spikeMinH, d.spikeMaxH);
        const h2 = Phaser.Math.Between(d.spikeMinH, d.spikeMaxH);
        this.placeSpike(x, h1, !floorLeads);
        this.placeSpike(x + SLALOM_OFFSET_PX, h2, floorLeads);
        this.channelCenter = openChannelCenter(h2, floorLeads);
        return SLALOM_OFFSET_PX + SPIKE_W;
    }

    /** Single spike on the side that keeps the open channel near channelCenter. */
    private placeSingleSpike(d: Difficulty, x: number): number {
        const fromCeiling = this.channelCenter > GAME_HEIGHT / 2;
        const h = Phaser.Math.Between(d.spikeMinH, d.spikeMaxH);
        this.placeSpike(x, h, fromCeiling);
        this.channelCenter = openChannelCenter(h, fromCeiling);
        return SPIKE_W;
    }

    /** Pipe on the floor (always deadly) + plant that cycles hidden/warn/extended. */
    private placePiranha(d: Difficulty, x: number): number {
        const pipe = this.obstacles.create(x, FLOOR_Y - PIPE_H / 2, TEX_PIPE) as Phaser.Physics.Arcade.Sprite;
        pipe.setDisplaySize(PIPE_W, PIPE_H);
        pipe.refreshBody();

        // Body fixed ONCE at the extended pose (static bodies don't follow
        // later visual changes — exactly what the phase cycle needs).
        const plant = this.obstacles.create(x, plantY('extended'), TEX_PLANT) as Phaser.Physics.Arcade.Sprite;
        plant.setDisplaySize(PLANT_W, PLANT_H);
        plant.refreshBody();
        (plant.body as Phaser.Physics.Arcade.StaticBody).setSize(PLANT_W * SPIKE_HITBOX, PLANT_H * SPIKE_HITBOX);
        plant.setVisible(false).setDisplaySize(PLANT_W, PLANT_PEEK_H).setY(plantY('hidden'));
        const cycleMs = d.piranhaHiddenMs + d.piranhaWarnMs + d.piranhaExtendedMs;
        plant.setData(DEADLY, false);
        plant.setData(CUR_PHASE, 'hidden' satisfies PlantPhase);
        plant.setData(PHASE_OFFSET, Math.random() * cycleMs);
        plant.setData(HIDDEN_MS, d.piranhaHiddenMs);
        plant.setData(WARN_MS, d.piranhaWarnMs);
        plant.setData(EXTENDED_MS, d.piranhaExtendedMs);
        this.plants.push(plant);

        this.channelCenter = (CEILING_Y + (FLOOR_Y - PIPE_H - PLANT_H)) / 2;
        return SPIKE_W;
    }

    private placeSpike(x: number, height: number, fromCeiling: boolean): void {
        const spike = this.obstacles.create(
            x,
            fromCeiling ? CEILING_Y + height / 2 : FLOOR_Y - height / 2,
            TEX_SPIKE
        ) as Phaser.Physics.Arcade.Sprite;
        spike.setDisplaySize(SPIKE_W, height).setFlipY(fromCeiling);
        spike.refreshBody();
        (spike.body as Phaser.Physics.Arcade.StaticBody).setSize(SPIKE_W * SPIKE_HITBOX, height * SPIKE_HITBOX);
    }

    // --------------------------------------------------------------- update

    /** Run the piranha cycle: visuals + DEADLY flag change only on phase transitions. */
    private drivePlants(time: number): void {
        for (const plant of this.plants) {
            const hiddenMs = plant.getData(HIDDEN_MS) as number;
            const warnMs = plant.getData(WARN_MS) as number;
            const extendedMs = plant.getData(EXTENDED_MS) as number;
            const cycleMs = hiddenMs + warnMs + extendedMs;
            const cyclePos = (time - this.createdAt + (plant.getData(PHASE_OFFSET) as number)) % cycleMs;
            const phase: PlantPhase = cyclePos < hiddenMs ? 'hidden' : cyclePos < hiddenMs + warnMs ? 'warn' : 'extended';
            if (phase === plant.getData(CUR_PHASE)) {
                continue;
            }
            plant.setData(CUR_PHASE, phase);
            plant.setData(DEADLY, phase === 'extended');
            plant.setVisible(phase !== 'hidden');
            plant.setDisplaySize(PLANT_W, phase === 'extended' ? PLANT_H : PLANT_PEEK_H);
            plant.setY(plantY(phase));
            if (phase === 'warn') {
                plant.setTint(PLANT_WARN_TINT);
            } else {
                plant.clearTint();
            }
        }
    }

    private onObstacleTouch(obstacle: Phaser.GameObjects.GameObject): void {
        if (obstacle.getData(DEADLY) === false) {
            return; // a hidden/peeking piranha plant
        }
        this.onHit();
    }

    private onWin(): void {
        this.state = 'ended';
        this.physics.pause();
        this.time.delayedCall(WIN_BEAT_MS, () => this.completeActivity());
    }

    private onHit(): void {
        if (this.state !== 'running') {
            return;
        }
        this.state = 'ended';
        this.physics.pause();
        this.back.setTint(0xff0000);
        this.front.setTint(0xff0000);
        this.cart.setTint(0xff0000);

        // Restore normal controls: the fail flow's video skip is an A-press,
        // so the vpad must show its buttons again (PLAN.md §3.10).
        inputService.setTwinStick(false);
        setVirtualPadTwinStick(false);

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
}

function clampToBand(p: Vec2): Vec2 {
    return {
        x: Math.min(Math.max(p.x, CARRIER_MIN_X), CARRIER_MAX_X),
        y: Math.min(Math.max(p.y, CARRIER_MIN_Y), CARRIER_MAX_Y)
    };
}

/** Midpoint of the corridor left open beside a single spike. */
function openChannelCenter(height: number, fromCeiling: boolean): number {
    return fromCeiling ? (CEILING_Y + height + FLOOR_Y) / 2 : (CEILING_Y + FLOOR_Y - height) / 2;
}

function plantY(phase: PlantPhase): number {
    const pipeTop = FLOOR_Y - PIPE_H;
    return phase === 'extended' ? pipeTop - PLANT_H / 2 : pipeTop - PLANT_PEEK_H / 2;
}
