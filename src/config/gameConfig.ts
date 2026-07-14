import Phaser from 'phaser';
import { CANVAS_HEIGHT, CANVAS_WIDTH, GAME_HEIGHT, GAME_WIDTH } from './dimensions';

/** Scene list is provided by main.ts, which registers every scene. */
export const gameConfig: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    parent: 'game-container',
    backgroundColor: '#000000',
    pixelArt: true,
    physics: {
        default: 'arcade',
        // Default world bounds stay in logical 320×180 space (Phaser would
        // otherwise size them to the canvas backing store). Scenes with larger
        // worlds (WorldScene, cart-carry) set their own bounds explicitly.
        arcade: {
            width: GAME_WIDTH,
            height: GAME_HEIGHT
        }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        // Fullscreen must contain #ui-overlay (a body child), not just the canvas.
        fullscreenTarget: document.body
    }
};
