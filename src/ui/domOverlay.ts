/**
 * Single container for ALL DOM elements rendered over the canvas
 * (virtual pad, and later subtitles/menus — PLAN.md §3.8).
 * The overlay ignores pointer events; interactive children opt back in
 * via CSS `pointer-events: auto`.
 */

import { UI_GRID_HEIGHT, UI_GRID_WIDTH } from '../config/dimensions';

let overlayRoot: HTMLDivElement | null = null;

export function getOverlayRoot(): HTMLDivElement {
    if (!overlayRoot) {
        overlayRoot = document.createElement('div');
        overlayRoot.id = 'ui-overlay';
        document.body.appendChild(overlayRoot);
    }
    return overlayRoot;
}

/** Appends a div to the overlay; the creating scene removes it on SHUTDOWN. */
export function createOverlayElement(className: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = className;
    getOverlayRoot().appendChild(el);
    return el;
}

/**
 * Keeps --px (CSS pixels per unit of the 320×180 pixel-font grid, integer ≥ 1)
 * in sync with the window, so DOM text sized as calc(var(--px) * 12px) always
 * sits on an integer multiple of the pixel font's 12px grid (PLAN.md §3.8).
 * Uses the UI_GRID_* font grid, NOT the native canvas size, so text keeps its
 * historical crisp scaling independent of the 1280×720 canvas.
 */
export function initOverlayScale(): void {
    const apply = (): void => {
        const scale = Math.min(window.innerWidth / UI_GRID_WIDTH, window.innerHeight / UI_GRID_HEIGHT);
        getOverlayRoot().style.setProperty('--px', String(Math.max(1, Math.floor(scale))));
    };
    window.addEventListener('resize', apply);
    apply();
}
