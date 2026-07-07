/**
 * Logical canvas resolution (confirmed with user): 320×180, 16:9.
 * All pixel art is authored at this size; Scale.FIT integer-scales it up
 * (×4 at 720p, ×6 at 1080p). Phones letterbox slightly (most are 19.5:9).
 * Lives apart from gameConfig so DOM/service modules (and their unit tests)
 * can use it without importing Phaser.
 */
export const GAME_WIDTH = 320;
export const GAME_HEIGHT = 180;
