import type { ClockSource } from './types';

/**
 * Clock adapter for in-game dialogue (PLAN.md §3.5): the hosting scene feeds
 * it its UPDATE deltas, so it freezes automatically while the scene is paused
 * (a paused scene receives no UPDATE events). The video clock adapter (over
 * video.getCurrentTime()) arrives in milestone 7.
 */
export class GameClock implements ClockSource {
    private elapsed = 0;

    advance(deltaMs: number): void {
        this.elapsed += deltaMs;
    }

    nowMs(): number {
        return this.elapsed;
    }
}
