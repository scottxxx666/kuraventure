import { createOverlayElement } from '../ui/domOverlay';
import type { SubtitleRenderer } from './types';

/**
 * THE subtitle element (PLAN.md §3.5): a single DOM div over the canvas,
 * shared by dialogue and (milestone 7) video, styled by .subtitle-bar in
 * style.css. Created lazily on first text, kept for the session, hidden
 * between cues.
 */
export class SubtitleOverlay implements SubtitleRenderer {
    private el: HTMLDivElement | null = null;

    setText(text: string | null): void {
        if (text === null) {
            if (this.el) {
                this.el.hidden = true;
            }
            return;
        }
        if (!this.el) {
            this.el = createOverlayElement('subtitle-bar');
        }
        this.el.textContent = text;
        this.el.hidden = false;
    }
}
