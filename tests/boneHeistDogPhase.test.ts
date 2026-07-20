import { describe, expect, it } from 'vitest';
import { STIR_NOISE, dogPhaseForNoise } from '../src/scenes/minigames/bone-heist/dogPhase';
import { NOISE_MAX } from '../src/scenes/minigames/bone-heist/noise';

describe('bone-heist dogPhaseForNoise', () => {
    it('sleeps while noise is below the stir threshold', () => {
        expect(dogPhaseForNoise(0)).toBe('sleep');
        expect(dogPhaseForNoise(STIR_NOISE - 0.001)).toBe('sleep');
    });

    it('stirs from the threshold up to (but not including) the max', () => {
        expect(dogPhaseForNoise(STIR_NOISE)).toBe('stir');
        expect(dogPhaseForNoise(NOISE_MAX - 0.001)).toBe('stir');
    });

    it('wakes — the bite — the instant noise hits the max', () => {
        expect(dogPhaseForNoise(NOISE_MAX)).toBe('awake');
        expect(dogPhaseForNoise(NOISE_MAX + 10)).toBe('awake');
    });

    it('has a real warning band between stirring and waking', () => {
        expect(STIR_NOISE).toBeGreaterThan(0);
        expect(STIR_NOISE).toBeLessThan(NOISE_MAX);
    });
});
