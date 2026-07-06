import Phaser from 'phaser';

/**
 * Logical canvas resolution (confirmed with user): 320×180, 16:9.
 * All pixel art is authored at this size; Scale.FIT integer-scales it up
 * (×4 at 720p, ×6 at 1080p). Phones letterbox slightly (most are 19.5:9).
 */
export const GAME_WIDTH = 320;
export const GAME_HEIGHT = 180;

/** Scene list is provided by main.ts, which registers every scene. */
export const gameConfig: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-container',
    backgroundColor: '#000000',
    pixelArt: true,
    physics: {
        default: 'arcade'
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};
