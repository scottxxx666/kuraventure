import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../config/dimensions';
import { inputService } from '../../../input/InputService';
import { runFailFlow } from '../failFlow';
import { SceneKeys } from '../../keys';
import { MiniGameScene } from '../MiniGameScene';
import { difficultyFor } from './difficulty';

/**
 * Pizza Run — port of https://github.com/scottxxx666/izone-pizza-game.
 * Run left/right, catch falling dumplings to fill the bar (full = win),
 * touching a pizza fails: fail banner → ending video → Retry / Give up.
 * At the last difficulty tier a boss patrols the sky deflecting pizzas.
 * Current art is the original repo's photos — replacement sizes in
 * public/assets/images/pizza-run/README.md.
 */

const PLAYER_SPEED = 560; // px/s left/right
const BAR_TARGET = 20; // dumplings to fill the bar
const DUMPLING_TICK_MS = 1000;
const PIZZA_TICK_MS = 1200;
const ITEM_DRIFT_X = 100; // max sideways velocity of falling items, px/s
const BOSS_SPEED = 240;
const BOSS_Y = 144;
const PIZZA_DEFLECT_VELOCITY = -1040; // boss knocks pizzas up off-screen
const WIN_BEAT_MS = 300; // pause on the full bar before completing
// Display sizes on the native 1280×720 canvas (the placeholder photos are much larger).
const PLAYER_W = 64;
const PLAYER_H = 96;
const DUMPLING_SIZE = 48;
const PIZZA_SIZE = 56;
const BOSS_SIZE = 128;
const BAR_W = 480;
const BAR_H = 20;
const BAR_Y = 32;

const TEX_PLAYER = 'pizza-run-player';
const TEX_DUMPLING = 'pizza-run-dumpling';
const TEX_PIZZA = 'pizza-run-pizza';
const TEX_BOSS = 'pizza-run-boss';
const ENDING_VIDEO_KEY = 'pizza-run-ending';

export class PizzaRunMiniGame extends MiniGameScene {
    private player!: Phaser.Physics.Arcade.Sprite;
    private dumplings!: Phaser.Physics.Arcade.Group;
    private pizzas!: Phaser.Physics.Arcade.Group;
    private boss: Phaser.Physics.Arcade.Sprite | null = null;
    private barFill!: Phaser.GameObjects.Rectangle;
    private spawnTimers: Phaser.Time.TimerEvent[] = [];
    private caught = 0;
    private ended = false;
    private failFlowCleanup: (() => void) | null = null;

    constructor() {
        super(SceneKeys.PizzaRun);
    }

    preload(): void {
        if (!this.textures.exists(TEX_PLAYER)) {
            this.load.image(TEX_PLAYER, 'assets/images/pizza-run/player.png');
            this.load.image(TEX_DUMPLING, 'assets/images/pizza-run/dumpling.png');
            this.load.image(TEX_PIZZA, 'assets/images/pizza-run/pizza.png');
            this.load.image(TEX_BOSS, 'assets/images/pizza-run/boss.png');
        }
        if (!this.cache.video.exists(ENDING_VIDEO_KEY)) {
            this.load.video(ENDING_VIDEO_KEY, 'assets/video/pizza-run-ending.mp4');
        }
    }

    create(): void {
        // The same scene instance is reused across launches and restarts.
        this.caught = 0;
        this.ended = false;
        this.boss = null;
        this.spawnTimers = [];
        this.failFlowCleanup = null;

        this.cameras.main.setBackgroundColor('#1d2233');

        this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT - PLAYER_H / 2 - 8, TEX_PLAYER);
        this.player.setDisplaySize(PLAYER_W, PLAYER_H).setCollideWorldBounds(true);

        this.dumplings = this.physics.add.group();
        this.pizzas = this.physics.add.group();
        this.physics.add.overlap(this.player, this.dumplings, (_player, dumpling) =>
            this.onDumplingCaught(dumpling as Phaser.Physics.Arcade.Sprite)
        );
        this.physics.add.overlap(this.player, this.pizzas, () => this.onPizzaHit());

        // Progress bar (game-scene UI, no text → Phaser, not DOM — §3.8).
        this.add
            .rectangle(GAME_WIDTH / 2, BAR_Y, BAR_W + 8, BAR_H + 8)
            .setStrokeStyle(4, 0xffffff);
        this.barFill = this.add
            .rectangle(GAME_WIDTH / 2 - BAR_W / 2, BAR_Y, BAR_W, BAR_H, 0x8fd18f)
            .setOrigin(0, 0.5)
            .setScale(0, 1);

        this.spawnTimers = [
            this.time.addEvent({ delay: DUMPLING_TICK_MS, loop: true, callback: () => this.spawnDumplings() }),
            this.time.addEvent({ delay: PIZZA_TICK_MS, loop: true, callback: () => this.spawnPizzas() })
        ];

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.failFlowCleanup?.());
    }

    update(): void {
        if (this.ended) {
            return;
        }
        const dx = inputService.direction().x;
        this.player.setVelocity(dx * PLAYER_SPEED, 0);
        if (dx !== 0) {
            this.player.setFlipX(dx < 0);
        }

        this.cullOffscreen(this.dumplings);
        this.cullOffscreen(this.pizzas);

        if (!this.boss && difficultyFor(this.caught / BAR_TARGET).bossActive) {
            this.spawnBoss();
        }
    }

    private spawnDumplings(): void {
        const count = Phaser.Math.Between(1, 2);
        for (let i = 0; i < count; i++) {
            this.spawnItem(this.dumplings, TEX_DUMPLING, DUMPLING_SIZE);
        }
    }

    private spawnPizzas(): void {
        const { pizzasPerTick } = difficultyFor(this.caught / BAR_TARGET);
        for (let i = 0; i < pizzasPerTick; i++) {
            this.spawnItem(this.pizzas, TEX_PIZZA, PIZZA_SIZE);
        }
    }

    private spawnItem(group: Phaser.Physics.Arcade.Group, texture: string, size: number): void {
        const { fallSpeedMin, fallSpeedMax } = difficultyFor(this.caught / BAR_TARGET);
        const x = Phaser.Math.Between(size, GAME_WIDTH - size);
        const item = group.create(x, -size, texture) as Phaser.Physics.Arcade.Sprite;
        item.setDisplaySize(size, size).setVelocity(
            Phaser.Math.Between(-ITEM_DRIFT_X, ITEM_DRIFT_X),
            Phaser.Math.Between(fallSpeedMin, fallSpeedMax)
        );
    }

    private cullOffscreen(group: Phaser.Physics.Arcade.Group): void {
        for (const child of [...group.getChildren()]) {
            const sprite = child as Phaser.Physics.Arcade.Sprite;
            if (sprite.y > GAME_HEIGHT + BOSS_SIZE || sprite.y < -BOSS_SIZE) {
                sprite.destroy();
            }
        }
    }

    /** Boss enters at the last tier and patrols the sky deflecting pizzas (like the original). */
    private spawnBoss(): void {
        this.boss = this.physics.add.sprite(BOSS_SIZE, BOSS_Y, TEX_BOSS);
        this.boss
            .setDisplaySize(BOSS_SIZE, BOSS_SIZE)
            .setCollideWorldBounds(true)
            .setBounce(1, 0)
            .setVelocityX(BOSS_SPEED);
        this.physics.add.overlap(this.boss, this.pizzas, (_boss, pizza) =>
            (pizza as Phaser.Physics.Arcade.Sprite).setVelocityY(PIZZA_DEFLECT_VELOCITY)
        );
    }

    private onDumplingCaught(dumpling: Phaser.Physics.Arcade.Sprite): void {
        if (this.ended) {
            return;
        }
        dumpling.destroy();
        this.caught++;
        this.barFill.setScale(Math.min(1, this.caught / BAR_TARGET), 1);
        if (this.caught >= BAR_TARGET) {
            this.ended = true;
            this.freezePlay();
            this.time.delayedCall(WIN_BEAT_MS, () => this.completeActivity());
        }
    }

    private onPizzaHit(): void {
        if (this.ended) {
            return;
        }
        this.ended = true;
        this.freezePlay();
        this.player.setTint(0xff0000);

        this.failFlowCleanup = runFailFlow({
            scene: this,
            videoKey: ENDING_VIDEO_KEY,
            failedTextKey: 'minigame.pizzaRun.failed',
            retryTextKey: 'minigame.pizzaRun.retry',
            quitTextKey: 'minigame.pizzaRun.quit',
            bannerClassName: 'pizza-run-failed',
            onRetry: () => this.scene.restart({ activity: this.activity, flagId: this.flagId }),
            onQuit: () => this.abortActivity()
        });
    }

    private freezePlay(): void {
        for (const timer of this.spawnTimers) {
            timer.remove();
        }
        this.physics.pause();
    }
}
