/**
 * Logical (world) resolution vs canvas backing store.
 *
 * All game logic, physics, and pixel art live in 320×180 world space, but the
 * canvas backing store is 1280×720: every in-canvas scene applies a zoom-4
 * camera (src/scenes/pixelCamera.ts), so pixel art renders as crisp 4×4 blocks
 * while in-canvas video textures rasterize at up to 720p instead of being
 * crushed to 320×180 (PLAN.md §2). Scale.FIT letterboxes the 16:9 canvas;
 * phones letterbox slightly (most are 19.5:9).
 * Lives apart from gameConfig so DOM/service modules (and their unit tests)
 * can use it without importing Phaser.
 */
export const GAME_WIDTH = 320;
export const GAME_HEIGHT = 180;

/** Canvas pixels per world pixel (pixel art renders as ZOOM×ZOOM blocks). */
export const CAMERA_ZOOM = 4;
export const CANVAS_WIDTH = GAME_WIDTH * CAMERA_ZOOM; // 1280
export const CANVAS_HEIGHT = GAME_HEIGHT * CAMERA_ZOOM; // 720
