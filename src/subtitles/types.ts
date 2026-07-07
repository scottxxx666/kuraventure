/**
 * Subtitle data model (PLAN.md §3.5). One track file per locale:
 * public/assets/subtitles/<trackId>.<locale>.json — { "cues": [...] }.
 */

export interface SubtitleCue {
    /** Visible while start <= clock < end (ms — start inclusive, end exclusive). */
    start: number;
    end: number;
    text: string;
}

export interface SubtitleTrack {
    cues: SubtitleCue[];
}

/** Monotonic within one playback; one adapter per activity type (GameClock now, video clock in milestone 7). */
export interface ClockSource {
    nowMs(): number;
}

/** What the engine renders through; the DOM implementation is SubtitleOverlay, tests inject a fake. */
export interface SubtitleRenderer {
    /** null hides the subtitle. */
    setText(text: string | null): void;
}
