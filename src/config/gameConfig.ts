import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './dimensions';

/** Scene list is provided by main.ts, which registers every scene. */
export const gameConfig: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-container',
    backgroundColor: '#000000',
    // Smooth-art canvas, not pixel art — kept explicit; see
    // docs/option-b-smooth-art.md.
    pixelArt: false,
    physics: {
        default: 'arcade',
        // Default world bounds match the native 1280×720 canvas (one screen).
        // Scenes with larger worlds (WorldScene, cart-carry) set their own
        // bounds explicitly.
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
