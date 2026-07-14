import Phaser from 'phaser';
import {
    CAMERA_ZOOM,
    CANVAS_HEIGHT,
    CANVAS_WIDTH,
    GAME_HEIGHT,
    GAME_WIDTH
} from '../config/dimensions';

/**
 * Presents the 320×180 logical world on the 1280×720 canvas backing store
 * (PLAN.md §2): every in-canvas scene zooms its camera ×4, so pixel art stays
 * chunky (4×4 blocks) while video textures rasterize at full canvas
 * resolution instead of being downsampled to 320×180.
 *
 * Phaser zooms around the viewport midpoint (canvas center, 640/360), so:
 * - Static cameras must recenter on the logical midpoint — applyPixelCamera
 *   does both. Bounds clamping and follow are zoom-aware, but the zoom must be
 *   applied BEFORE setBounds/startFollow so their initial clamp uses the
 *   zoomed display size.
 * - setScrollFactor(0) removes scroll but NOT zoom: an sf=0 object at logical
 *   (x, y) lands at canvas (640 + 4·(x−640), …) — off-screen. Place sf=0
 *   objects at logical coords + HUD_OFFSET_X/Y to hit the intended spot.
 */
export function applyPixelCamera(scene: Phaser.Scene): void {
    scene.cameras.main.setZoom(CAMERA_ZOOM).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
}

/** Add to the logical coords of setScrollFactor(0) objects (see header). */
export const HUD_OFFSET_X = (CANVAS_WIDTH - GAME_WIDTH) / 2; // 480
export const HUD_OFFSET_Y = (CANVAS_HEIGHT - GAME_HEIGHT) / 2; // 270

/**
 * pixelArt:true forces NEAREST on every texture, and the WebGL renderer
 * re-stamps NEAREST onto the video GL texture on every new video frame
 * (WebGLRenderer#videoToTexture reads config.antialias), so a one-shot
 * setFilter is not enough: LINEAR is asserted when the texture is created AND
 * once per scene update. Video frames arrive via requestVideoFrameCallback,
 * which browsers run just before rAF — i.e. before Phaser draws — so the
 * per-update re-assert always wins. The Canvas renderer needs no re-assert
 * (it applies scaleMode per draw); the extra calls are harmless there.
 */
export function makeVideoSmooth(scene: Phaser.Scene, video: Phaser.GameObjects.Video): void {
    const apply = (): void => {
        video.videoTexture?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    };
    video.on(Phaser.GameObjects.Events.VIDEO_TEXTURE, apply);
    scene.events.on(Phaser.Scenes.Events.UPDATE, apply);
    video.once(Phaser.GameObjects.Events.DESTROY, () => {
        scene.events.off(Phaser.Scenes.Events.UPDATE, apply);
    });
}
