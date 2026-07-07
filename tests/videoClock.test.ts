import { describe, expect, it } from 'vitest';
import { VideoClock } from '../src/subtitles/VideoClock';

describe('VideoClock', () => {
    it('converts the video position (seconds) to cue time (ms), following seeks', () => {
        let currentTime = 0;
        const clock = new VideoClock({ getCurrentTime: () => currentTime });

        expect(clock.nowMs()).toBe(0);
        currentTime = 1.234;
        expect(clock.nowMs()).toBeCloseTo(1234);
        currentTime = 0.5; // seeking backwards moves the clock backwards too
        expect(clock.nowMs()).toBe(500);
    });
});
