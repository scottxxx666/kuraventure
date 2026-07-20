import { describe, expect, it } from 'vitest';
import {
    COVERED_PULL_MULTIPLIER,
    FREE_SPEED_PX_PER_SEC,
    NOISE_DECAY_PER_SEC,
    NOISE_MAX,
    NOISE_PER_PX,
    stepNoise
} from '../src/scenes/minigames/bone-heist/noise';

describe('bone-heist stepNoise', () => {
    it('decays with stillness and floors at zero', () => {
        const after = stepNoise({ noise: 50, dragDistPx: 0, deltaMs: 1000, coveredPull: false });
        expect(after).toBeCloseTo(50 - NOISE_DECAY_PER_SEC);
        expect(stepNoise({ noise: 1, dragDistPx: 0, deltaMs: 1000, coveredPull: false })).toBe(0);
        expect(stepNoise({ noise: 0, dragDistPx: 0, deltaMs: 1000, coveredPull: false })).toBe(0);
    });

    it('movement at or below the free speed adds nothing (pure decay)', () => {
        const freeDist = FREE_SPEED_PX_PER_SEC; // 1 s worth
        const at = stepNoise({ noise: 50, dragDistPx: freeDist, deltaMs: 1000, coveredPull: false });
        const below = stepNoise({ noise: 50, dragDistPx: freeDist / 2, deltaMs: 1000, coveredPull: false });
        expect(at).toBeCloseTo(50 - NOISE_DECAY_PER_SEC);
        expect(below).toBeCloseTo(50 - NOISE_DECAY_PER_SEC);
    });

    it('only the distance beyond the free speed makes noise', () => {
        const extraPx = 200;
        const after = stepNoise({
            noise: 50,
            dragDistPx: FREE_SPEED_PX_PER_SEC + extraPx,
            deltaMs: 1000,
            coveredPull: false
        });
        expect(after).toBeCloseTo(50 + extraPx * NOISE_PER_PX - NOISE_DECAY_PER_SEC);
    });

    it('a covered pull multiplies the gain, not the decay', () => {
        const extraPx = 200;
        const quiet = stepNoise({
            noise: 50,
            dragDistPx: FREE_SPEED_PX_PER_SEC + extraPx,
            deltaMs: 1000,
            coveredPull: false
        });
        const loud = stepNoise({
            noise: 50,
            dragDistPx: FREE_SPEED_PX_PER_SEC + extraPx,
            deltaMs: 1000,
            coveredPull: true
        });
        expect(loud - 50 + NOISE_DECAY_PER_SEC).toBeCloseTo(
            (quiet - 50 + NOISE_DECAY_PER_SEC) * COVERED_PULL_MULTIPLIER
        );
    });

    it('clamps at NOISE_MAX', () => {
        const after = stepNoise({ noise: NOISE_MAX, dragDistPx: 5000, deltaMs: 16, coveredPull: true });
        expect(after).toBe(NOISE_MAX);
    });
});
