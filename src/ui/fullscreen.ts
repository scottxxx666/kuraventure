import Phaser from 'phaser';

/**
 * Landscape-only + fullscreen (PLAN.md §3.10): called from the start-game
 * gesture. iPhone Safari has no Fullscreen API (`available` is false) and no
 * `orientation.lock`; desktop browsers reject the lock — in both cases the
 * portrait rotate overlay (ui/rotateOverlay.ts) is the remaining enforcement.
 */
export function enterFullscreenAndLockLandscape(scale: Phaser.Scale.ScaleManager): void {
    if (!scale.fullscreen.available || scale.isFullscreen) {
        return;
    }
    // orientation.lock only succeeds inside fullscreen, so wait for the enter event.
    scale.once(Phaser.Scale.Events.ENTER_FULLSCREEN, () => {
        // `lock` is missing from some TS DOM libs and some browsers (iOS).
        const orientation = screen.orientation as ScreenOrientation & {
            lock?: (orientation: string) => Promise<void>;
        };
        orientation?.lock?.('landscape').catch(() => {
            // Rejected (desktop / unsupported) — the rotate overlay covers it.
        });
    });
    scale.startFullscreen();
}
