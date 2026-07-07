import { describe, expect, it } from 'vitest';
import { difficultyFor } from '../src/scenes/minigames/pizza-run/difficulty';

describe('difficultyFor', () => {
    it('maps bar fractions to tiers at the quarter boundaries', () => {
        expect(difficultyFor(0).tier).toBe(0);
        expect(difficultyFor(0.24).tier).toBe(0);
        expect(difficultyFor(0.25).tier).toBe(1);
        expect(difficultyFor(0.5).tier).toBe(2);
        expect(difficultyFor(0.74).tier).toBe(2);
        expect(difficultyFor(0.75).tier).toBe(3);
    });

    it('caps at tier 3 for a full (and over-full) bar', () => {
        expect(difficultyFor(1).tier).toBe(3);
        expect(difficultyFor(1.5).tier).toBe(3);
    });

    it('clamps negative fractions to tier 0', () => {
        expect(difficultyFor(-0.5)).toEqual(difficultyFor(0));
    });

    it('speeds up and spawns more pizzas as tiers rise, keeping min < max', () => {
        for (let tier = 0; tier < 3; tier++) {
            const current = difficultyFor(tier / 4);
            const next = difficultyFor((tier + 1) / 4);
            expect(next.fallSpeedMin).toBeGreaterThan(current.fallSpeedMin);
            expect(next.fallSpeedMax).toBeGreaterThan(current.fallSpeedMax);
            expect(next.pizzasPerTick).toBeGreaterThanOrEqual(current.pizzasPerTick);
            expect(current.fallSpeedMin).toBeLessThan(current.fallSpeedMax);
        }
        expect(difficultyFor(1).pizzasPerTick).toBe(3);
    });

    it('activates the boss only at the last tier', () => {
        expect(difficultyFor(0.74).bossActive).toBe(false);
        expect(difficultyFor(0.75).bossActive).toBe(true);
    });
});
