/**
 * Native canvas resolution.
 *
 * The game renders at a native 1280×720 smooth-art canvas: world coordinates
 * == canvas coordinates, no camera zoom, `pixelArt: false` (PLAN.md §2,
 * docs/option-b-smooth-art.md). Scale.FIT letterboxes the 16:9 canvas; phones
 * letterbox slightly (most are 19.5:9).
 * Lives apart from gameConfig so DOM/service modules (and their unit tests)
 * can use it without importing Phaser.
 */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/**
 * The pixel-font grid the DOM overlay's integer `--px` scale is computed from
 * (src/ui/domOverlay.ts) — intentionally NOT the canvas size. The Fusion Pixel
 * 12px font stays sized in multiples of this 320×180 grid, so DOM text keeps
 * today's crisp integer scaling independent of the native canvas resolution.
 */
export const UI_GRID_WIDTH = 320;
export const UI_GRID_HEIGHT = 180;
