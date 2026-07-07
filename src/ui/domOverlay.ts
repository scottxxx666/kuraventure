/**
 * Single container for ALL DOM elements rendered over the canvas
 * (virtual pad, and later subtitles/menus — PLAN.md §3.8).
 * The overlay ignores pointer events; interactive children opt back in
 * via CSS `pointer-events: auto`.
 */

import { GAME_HEIGHT, GAME_WIDTH } from '../config/dimensions';

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
 * Keeps --px (CSS pixels per logical canvas pixel, integer ≥ 1) in sync with
 * the window, so DOM text sized as calc(var(--px) * 12px) always sits on an
 * integer multiple of the pixel font's 12px grid (PLAN.md §3.8).
 */
export function initOverlayScale(): void {
    const apply = (): void => {
        const scale = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
        getOverlayRoot().style.setProperty('--px', String(Math.max(1, Math.floor(scale))));
    };
    window.addEventListener('resize', apply);
    apply();
}
