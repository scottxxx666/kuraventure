import Phaser from 'phaser';
import { SceneKeys } from './keys';

/**
 * First scene: loads only what PreloadScene needs to show its progress UI
 * (currently nothing — the progress bar is drawn with Graphics).
 */
export class BootScene extends Phaser.Scene {
    constructor() {
        super(SceneKeys.Boot);
    }

    create(): void {
        this.scene.start(SceneKeys.Preload);
    }
}
