import { describe, expect, it } from 'vitest';
import {
    CYCLE_MS,
    GONE_MS,
    SOLID_MS,
    WARN_MS,
    platformPhaseAt
} from '../src/scenes/minigames/jump-quest/cycle';

describe('jump-quest platformPhaseAt', () => {
    it('walks solid → warn → gone across one cycle', () => {
        expect(platformPhaseAt(0, 0)).toBe('solid');
        expect(platformPhaseAt(SOLID_MS - 1, 0)).toBe('solid');
        expect(platformPhaseAt(SOLID_MS, 0)).toBe('warn');
        expect(platformPhaseAt(SOLID_MS + WARN_MS - 1, 0)).toBe('warn');
        expect(platformPhaseAt(SOLID_MS + WARN_MS, 0)).toBe('gone');
        expect(platformPhaseAt(CYCLE_MS - 1, 0)).toBe('gone');
    });

    it('wraps back to solid at the cycle boundary', () => {
        expect(platformPhaseAt(CYCLE_MS, 0)).toBe('solid');
        expect(platformPhaseAt(CYCLE_MS + SOLID_MS, 0)).toBe('warn');
    });

    it('the phase durations cover the whole cycle', () => {
        expect(SOLID_MS + WARN_MS + GONE_MS).toBe(CYCLE_MS);
    });

    it('offset shifts the schedule: phaseAt(t, off) === phaseAt(t + off, 0)', () => {
        for (const t of [0, 500, SOLID_MS, SOLID_MS + WARN_MS, CYCLE_MS - 1]) {
            for (const off of [0, 1300, SOLID_MS, CYCLE_MS - 1]) {
                expect(platformPhaseAt(t, off)).toBe(platformPhaseAt(t + off, 0));
            }
        }
    });

    it('stays correct for very large elapsed times', () => {
        const big = CYCLE_MS * 100_000;
        expect(platformPhaseAt(big, 0)).toBe('solid');
        expect(platformPhaseAt(big + SOLID_MS, 0)).toBe('warn');
        expect(platformPhaseAt(big + SOLID_MS + WARN_MS, 0)).toBe('gone');
    });
});
