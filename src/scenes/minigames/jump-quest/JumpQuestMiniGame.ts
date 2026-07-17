import Phaser from 'phaser';
import { GAME_WIDTH } from '../../../config/dimensions';
import { inputService } from '../../../input/InputService';
import { i18nService } from '../../../services/I18nService';
import { createOverlayElement, getOverlayRoot } from '../../../ui/domOverlay';
import { SceneKeys } from '../../keys';
import { MiniGameScene } from '../MiniGameScene';
import { platformPhaseAt } from './cycle';
import type { PlatformPhase } from './cycle';
import { FLICKER_INTERVAL_MS, HitState, KNOCKBACK_VX, computeKnockback } from './knockback';
import { LEVEL, PLATFORM_H } from './level';
import type { PatrolDef, PlatformDef } from './level';
import { GRAVITY_Y, JUMP_VELOCITY, MAX_FALL_SPEED, WALK_SPEED } from './physics';

/**
 * Jump Quest — MapleStory "Forest of Patience"-style vertical climb: reach
 * the goal at the top of a 3-screen tower to win. Walk with ←→, jump with A;
 * platforms are one-way (jump up through them, classic style). Patrol
 * monsters and crossing flyers knock the player away on touch — no HP and no
 * fail state, falling just means re-climbing (that's the patience). Timed
 * platforms blink a warning, vanish, and return (./cycle.ts); moving
 * platforms carry the rider. The layout lives in ./level.ts, provably
 * climbable via validateLevel against the ./physics.ts jump budget. Quit is
 * a top-right DOM button → abortActivity. Current art is placeholder photos
 * — replacement sizes in public/assets/images/jump-quest/README.md.
 */

const WIN_BEAT_MS = 300; // pause at the summit before completing

const PLAYER_SIZE = 96;
const PLAYER_HITBOX = 0.7; // body shrunk vs the visible sprite (touch fairness)
const MONSTER_SIZE = 80;
const FLYER_SIZE = 88;
const HAZARD_HITBOX = 0.7;
const GOAL_SIZE = 128;

const INPUT_DEADZONE = 0.3;
const WARN_ALPHA = 0.35;
const HIT_ALPHA = 0.3;

// Height-progress bar along the right edge (no text → Phaser, not DOM — §3.8).
const BAR_X = GAME_WIDTH - 24;
const BAR_W = 12;
const BAR_TOP = 60;
const BAR_BOTTOM = 660;

const TEX_PLAYER = 'jump-quest-player';
const TEX_MONSTER = 'jump-quest-monster';
const TEX_FLYER = 'jump-quest-flyer';
const TEX_PLATFORM = 'jump-quest-platform';
const TEX_PLATFORM_TIMED = 'jump-quest-platform-timed';
const TEX_GOAL = 'jump-quest-goal';

type JumpQuestState = 'running' | 'ended';

/** A ping-ponging body (monster, flyer or moving platform) and its bounds. */
interface Patroller {
    object: Phaser.GameObjects.Sprite | Phaser.GameObjects.TileSprite;
    patrol: PatrolDef;
    /** Monsters/flyers face their travel direction; platforms don't flip. */
    flips: boolean;
}

interface TimedPlatform {
    tile: Phaser.GameObjects.TileSprite;
    offsetMs: number;
    phase: PlatformPhase;
}

export class JumpQuestMiniGame extends MiniGameScene {
    private player!: Phaser.Physics.Arcade.Sprite;
    private hazards!: Phaser.Physics.Arcade.Group;
    private barFill!: Phaser.GameObjects.Rectangle;
    private patrollers: Patroller[] = [];
    private timedPlatforms: TimedPlatform[] = [];
    private readonly hitState = new HitState();
    private state: JumpQuestState = 'running';
    private createdAt = 0;
    private promptEl: HTMLElement | null = null;
    private quitButton: HTMLButtonElement | null = null;
    private offJump: (() => void) | null = null;

    constructor() {
        super(SceneKeys.JumpQuest);
    }

    preload(): void {
        if (!this.textures.exists(TEX_PLAYER)) {
            this.load.image(TEX_PLAYER, 'assets/images/jump-quest/player.png');
            this.load.image(TEX_MONSTER, 'assets/images/jump-quest/monster.png');
            this.load.image(TEX_FLYER, 'assets/images/jump-quest/flyer.png');
            this.load.image(TEX_PLATFORM, 'assets/images/jump-quest/platform.png');
            this.load.image(TEX_PLATFORM_TIMED, 'assets/images/jump-quest/platform-timed.png');
            this.load.image(TEX_GOAL, 'assets/images/jump-quest/goal.png');
        }
    }

    create(): void {
        // The same scene instance is reused across launches.
        this.state = 'running';
        this.hitState.reset();
        this.patrollers = [];
        this.timedPlatforms = [];
        this.createdAt = this.time.now;

        this.physics.world.setBounds(0, 0, LEVEL.worldWidth, LEVEL.worldHeight);
        this.cameras.main.setBounds(0, 0, LEVEL.worldWidth, LEVEL.worldHeight);
        this.cameras.main.setBackgroundColor('#16233a');

        this.player = this.physics.add.sprite(LEVEL.spawn.x, LEVEL.spawn.y, TEX_PLAYER);
        this.player.setDisplaySize(PLAYER_SIZE, PLAYER_SIZE);
        // Body size is in unscaled texture pixels; the scale from
        // setDisplaySize shrinks it to PLAYER_SIZE * PLAYER_HITBOX on screen.
        this.player.setBodySize(this.player.width * PLAYER_HITBOX, this.player.height * PLAYER_HITBOX);
        this.player.setGravityY(GRAVITY_Y);
        // vx cap must admit the knockback impulse, not just walking.
        this.player.setMaxVelocity(KNOCKBACK_VX, MAX_FALL_SPEED);
        this.player.setCollideWorldBounds(true);

        this.buildPlatforms();
        this.buildHazards();
        this.buildGoal();

        this.cameras.main.startFollow(this.player, false, 1, 0.15);

        this.add
            .rectangle(BAR_X, (BAR_TOP + BAR_BOTTOM) / 2, BAR_W + 8, BAR_BOTTOM - BAR_TOP + 8)
            .setStrokeStyle(4, 0xffffff)
            .setScrollFactor(0);
        this.barFill = this.add
            .rectangle(BAR_X, BAR_BOTTOM, BAR_W, BAR_BOTTOM - BAR_TOP, 0x8fd18f)
            .setOrigin(0.5, 1)
            .setScale(1, 0)
            .setScrollFactor(0);

        this.promptEl = createOverlayElement('hud-prompt');
        this.promptEl.textContent = i18nService.t('minigame.jumpQuest.prompt');

        this.quitButton = document.createElement('button');
        this.quitButton.className = 'menu-button jump-quest-quit';
        this.quitButton.textContent = i18nService.t('minigame.jumpQuest.quit');
        this.quitButton.addEventListener('click', () => this.onQuit());
        getOverlayRoot().appendChild(this.quitButton);

        this.offJump = inputService.onPress('A', () => this.onJump());

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.promptEl?.remove();
            this.quitButton?.remove();
            this.offJump?.();
        });
    }

    // ---------------------------------------------------------------- build

    private buildPlatforms(): void {
        const statics = this.physics.add.staticGroup();
        const movers: Phaser.GameObjects.TileSprite[] = [];

        for (const def of LEVEL.platforms) {
            const tile = this.makePlatformTile(def);
            if (def.kind === 'moving' && def.patrol) {
                this.physics.add.existing(tile);
                const body = tile.body as Phaser.Physics.Arcade.Body;
                body.setImmovable(true);
                body.setAllowGravity(false);
                this.makeOneWay(body);
                movers.push(tile);
                this.patrollers.push({ object: tile, patrol: def.patrol, flips: false });
                body.setVelocityX(def.patrol.speed);
            } else {
                statics.add(tile);
                this.makeOneWay(tile.body as Phaser.Physics.Arcade.StaticBody);
                if (def.kind === 'disappearing') {
                    this.timedPlatforms.push({ tile, offsetMs: def.cycleOffsetMs ?? 0, phase: 'solid' });
                }
            }
        }

        this.physics.add.collider(this.player, statics);
        this.physics.add.collider(this.player, movers);
    }

    /** TileSprite so wide platforms repeat the art horizontally instead of stretching it. */
    private makePlatformTile(def: PlatformDef): Phaser.GameObjects.TileSprite {
        const tex = def.kind === 'disappearing' ? TEX_PLATFORM_TIMED : TEX_PLATFORM;
        const tile = this.add.tileSprite(def.x, def.y + PLATFORM_H / 2, def.width, PLATFORM_H, tex);
        // Fit the (placeholder-photo-sized) texture to the platform height;
        // the same scale on x keeps its aspect across the horizontal repeat.
        const source = this.textures.get(tex).getSourceImage() as { height: number };
        const scale = PLATFORM_H / source.height;
        tile.setTileScale(scale, scale);
        return tile;
    }

    /** Classic jump-through platform: only the top face collides. */
    private makeOneWay(body: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody): void {
        body.checkCollision.down = false;
        body.checkCollision.left = false;
        body.checkCollision.right = false;
    }

    private buildHazards(): void {
        this.hazards = this.physics.add.group({ allowGravity: false });

        for (const def of LEVEL.monsters) {
            const platform = LEVEL.platforms[def.platformIndex];
            const startX = (def.patrol.minX + def.patrol.maxX) / 2;
            this.spawnHazard(TEX_MONSTER, startX, platform.y - MONSTER_SIZE / 2, MONSTER_SIZE, def.patrol, 1);
        }
        for (const def of LEVEL.flyers) {
            const startX = def.direction === 1 ? def.minX : def.maxX;
            this.spawnHazard(
                TEX_FLYER,
                startX,
                def.y,
                FLYER_SIZE,
                { minX: def.minX, maxX: def.maxX, speed: def.speed },
                def.direction
            );
        }

        this.physics.add.overlap(this.player, this.hazards, (_p, hazard) =>
            this.onHazardTouch(hazard as Phaser.Physics.Arcade.Sprite)
        );
    }

    private spawnHazard(texture: string, x: number, y: number, size: number, patrol: PatrolDef, dir: 1 | -1): void {
        const sprite = this.hazards.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
        sprite.setDisplaySize(size, size);
        sprite.setBodySize(sprite.width * HAZARD_HITBOX, sprite.height * HAZARD_HITBOX);
        sprite.setVelocityX(dir * patrol.speed);
        sprite.setFlipX(dir < 0);
        this.patrollers.push({ object: sprite, patrol, flips: true });
    }

    private buildGoal(): void {
        const { goal } = LEVEL;
        this.add.image(goal.x, goal.y, TEX_GOAL).setDisplaySize(GOAL_SIZE, GOAL_SIZE);
        const zone = this.add.zone(goal.x, goal.y, goal.width, goal.height);
        this.physics.add.existing(zone, true);
        this.physics.add.overlap(this.player, zone, () => this.onWin());
    }

    // --------------------------------------------------------------- update

    update(time: number): void {
        if (this.state === 'ended') {
            return;
        }

        // Walking — suspended right after a hit so the knockback actually lands.
        if (!this.hitState.controlLocked(time)) {
            const dx = inputService.direction().x;
            if (Math.abs(dx) > INPUT_DEADZONE) {
                this.player.setVelocityX(Math.sign(dx) * WALK_SPEED);
                this.player.setFlipX(dx < 0);
            } else {
                this.player.setVelocityX(0);
            }
        }
        this.player.setAlpha(this.hitState.flickerVisible(time) ? 1 : HIT_ALPHA);

        this.drivePatrollers();
        this.driveTimedPlatforms(time - this.createdAt);

        const { spawn, goal } = LEVEL;
        const fraction = (spawn.y - this.player.y) / (spawn.y - goal.y);
        this.barFill.setScale(1, Phaser.Math.Clamp(fraction, 0, 1));
    }

    /** Ping-pong every patroller between its bounds by flipping the velocity. */
    private drivePatrollers(): void {
        for (const { object, patrol, flips } of this.patrollers) {
            const body = object.body as Phaser.Physics.Arcade.Body;
            if (object.x <= patrol.minX && body.velocity.x < 0) {
                body.setVelocityX(patrol.speed);
                if (flips) {
                    (object as Phaser.GameObjects.Sprite).setFlipX(false);
                }
            } else if (object.x >= patrol.maxX && body.velocity.x > 0) {
                body.setVelocityX(-patrol.speed);
                if (flips) {
                    (object as Phaser.GameObjects.Sprite).setFlipX(true);
                }
            }
        }
    }

    /** Solid/warn/gone cycle: react to phase changes; blink per-frame while warning. */
    private driveTimedPlatforms(elapsedMs: number): void {
        for (const timed of this.timedPlatforms) {
            const phase = platformPhaseAt(elapsedMs, timed.offsetMs);
            if (phase !== timed.phase) {
                timed.phase = phase;
                timed.tile.setVisible(phase !== 'gone');
                (timed.tile.body as Phaser.Physics.Arcade.StaticBody).enable = phase !== 'gone';
                if (phase !== 'warn') {
                    timed.tile.setAlpha(1);
                }
            }
            if (phase === 'warn') {
                timed.tile.setAlpha(Math.floor(elapsedMs / FLICKER_INTERVAL_MS) % 2 ? WARN_ALPHA : 1);
            }
        }
    }

    // -------------------------------------------------------------- actions

    private onJump(): void {
        if (this.state !== 'running') {
            return;
        }
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        if (!body.blocked.down && !body.touching.down) {
            return; // no mid-air jumps
        }
        this.player.setVelocityY(JUMP_VELOCITY);
        this.promptEl?.remove();
        this.promptEl = null;
    }

    private onHazardTouch(hazard: Phaser.Physics.Arcade.Sprite): void {
        if (this.state !== 'running' || !this.hitState.hit(this.time.now)) {
            return; // already over, or still invulnerable from the last hit
        }
        const kb = computeKnockback(this.player.x, hazard.x, LEVEL.worldWidth);
        this.player.setVelocity(kb.vx, kb.vy);
    }

    private onWin(): void {
        if (this.state !== 'running') {
            return;
        }
        this.state = 'ended';
        this.player.setAlpha(1);
        this.physics.pause();
        this.time.delayedCall(WIN_BEAT_MS, () => this.completeActivity());
    }

    private onQuit(): void {
        if (this.state === 'ended') {
            return;
        }
        this.state = 'ended';
        this.abortActivity();
    }
}
