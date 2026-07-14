import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/dimensions';
import { SceneKeys } from './keys';

/** Loads global assets shared across stages, showing a progress bar. */
export class PreloadScene extends Phaser.Scene {
    constructor() {
        super(SceneKeys.Preload);
    }

    preload(): void {
        const barWidth = Math.floor(GAME_WIDTH * 0.6);
        const barHeight = 32;
        const x = Math.floor((GAME_WIDTH - barWidth) / 2);
        const y = Math.floor((GAME_HEIGHT - barHeight) / 2);

        const outline = this.add.graphics();
        outline.lineStyle(4, 0xffffff);
        outline.strokeRect(x - 8, y - 8, barWidth + 16, barHeight + 16);

        const fill = this.add.graphics();
        this.load.on('progress', (value: number) => {
            fill.clear();
            fill.fillStyle(0xffffff);
            fill.fillRect(x, y, Math.floor(barWidth * value), barHeight);
        });

        // Global assets (fonts, shared spritesheets, audio) are queued here in
        // later milestones. Stage-specific assets load per stage, not here.
    }

    create(): void {
        this.scene.start(SceneKeys.MainMenu);
    }
}
