/**
 * Single container for ALL DOM elements rendered over the canvas
 * (virtual pad, and later subtitles/menus — PLAN.md §3.8).
 * The overlay ignores pointer events; interactive children opt back in
 * via CSS `pointer-events: auto`.
 */

let overlayRoot: HTMLDivElement | null = null;

export function getOverlayRoot(): HTMLDivElement {
    if (!overlayRoot) {
        overlayRoot = document.createElement('div');
        overlayRoot.id = 'ui-overlay';
        document.body.appendChild(overlayRoot);
    }
    return overlayRoot;
}
