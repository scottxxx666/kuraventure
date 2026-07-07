import type { ClockSource } from './types';

/** Structural slice of Phaser.GameObjects.Video — pure TS, unit-testable. */
export interface VideoTimeSource {
    /** Current playback time in seconds. */
    getCurrentTime(): number;
}

/**
 * Clock adapter for video playback (PLAN.md §3.5): subtitles read the video
 * element's own playback position, so pausing, stalling, or seeking the video
 * keeps them in sync automatically.
 */
export class VideoClock implements ClockSource {
    constructor(private readonly video: VideoTimeSource) {}

    nowMs(): number {
        return this.video.getCurrentTime() * 1000;
    }
}
