import Phaser from 'phaser';
import type { StageDef } from '../config/stages';
import { inputService } from '../input/InputService';
import { setVirtualPadVisible } from '../input/VirtualPadSource';
import { SceneKeys } from './keys';

const PLAYER_SPEED = 80; // px/s

/**
 * THE reusable map scene (PLAN.md §3.9): builds itself from a StageDef —
 * one instance serves all stages, never subclassed per stage.
 * Placeholder textures (tiles, player) are generated at runtime until the
 * art direction is decided (PLAN.md §5).
 */
const TILES_TEXTURE = 'tiles-placeholder';
const PLAYER_TEXTURE = 'player-placeholder';

export class WorldScene extends Phaser.Scene {
    private stage!: StageDef;
    private player!: Phaser.Physics.Arcade.Sprite;

    constructor() {
        super(SceneKeys.World);
    }

    init(data: { stage?: StageDef }): void {
        if (!data.stage) {
            throw new Error('WorldScene needs a StageDef — start stages via FlowDirector.startStage');
        }
        this.stage = data.stage;
    }

    preload(): void {
        if (!this.cache.tilemap.exists(this.stage.tilemapKey)) {
            this.load.tilemapTiledJSON(this.stage.tilemapKey, this.stage.tilemapUrl);
        }
    }

    create(): void {
        this.ensurePlaceholderTextures();

        const map = this.make.tilemap({ key: this.stage.tilemapKey });
        const tileset = map.addTilesetImage('tiles', TILES_TEXTURE);
        if (!tileset) {
            throw new Error(`Stage "${this.stage.id}": tileset "tiles" not found in its map`);
        }
        map.createLayer('ground', tileset);
        const walls = map.createLayer('walls', tileset);
        if (!walls) {
            throw new Error(`Stage "${this.stage.id}": map has no "walls" layer`);
        }
        walls.setCollisionByProperty({ collides: true });

        const spawn = map.findObject('objects', (obj) => obj.name === this.stage.spawn.objectName);
        if (!spawn || spawn.x == null || spawn.y == null) {
            throw new Error(
                `Stage "${this.stage.id}": spawn object "${this.stage.spawn.objectName}" not found in its map`
            );
        }

        this.player = this.physics.add.sprite(spawn.x, spawn.y, PLAYER_TEXTURE);
        this.physics.add.collider(this.player, walls);
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

        this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.cameras.main.startFollow(this.player);

        setVirtualPadVisible(true);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => setVirtualPadVisible(false));
    }

    update(): void {
        const dir = inputService.direction();
        this.player.setVelocity(dir.x * PLAYER_SPEED, dir.y * PLAYER_SPEED);
    }

    private ensurePlaceholderTextures(): void {
        if (!this.textures.exists(TILES_TEXTURE)) {
            // 2 tiles side by side: index 0 floor, index 1 wall (matches the map's tileset).
            const g = this.make.graphics({}, false);
            g.fillStyle(0x3a5f3a);
            g.fillRect(0, 0, 16, 16);
            g.fillStyle(0x466e46);
            g.fillRect(3, 3, 2, 2);
            g.fillRect(11, 9, 2, 2);
            g.fillStyle(0x6b4a3a);
            g.fillRect(16, 0, 16, 16);
            g.fillStyle(0x51382c);
            g.fillRect(16, 12, 16, 4);
            g.generateTexture(TILES_TEXTURE, 32, 16);
            g.destroy();
        }
        if (!this.textures.exists(PLAYER_TEXTURE)) {
            const g = this.make.graphics({}, false);
            g.fillStyle(0xf2d16b);
            g.fillRect(0, 0, 12, 12);
            g.fillStyle(0x2b2b2b);
            g.fillRect(3, 3, 2, 2);
            g.fillRect(7, 3, 2, 2);
            g.generateTexture(PLAYER_TEXTURE, 12, 12);
            g.destroy();
        }
    }
}
