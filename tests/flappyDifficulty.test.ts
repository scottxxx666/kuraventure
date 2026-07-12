import { describe, expect, it } from 'vitest';
import { difficultyFor } from '../src/scenes/minigames/flappy/difficulty';

describe('flappy difficultyFor', () => {
    it('clamps fractions outside 0..1', () => {
        expect(difficultyFor(-0.5)).toEqual(difficultyFor(0));
        expect(difficultyFor(1.5)).toEqual(difficultyFor(1));
    });

    it('has the intended endpoints', () => {
        const start = difficultyFor(0);
        expect(start.scrollSpeed).toBe(55);
        expect(start.gateIntervalMs).toBe(2600);
        expect(start.gapSize).toBe(88);
        const end = difficultyFor(1);
        expect(end.scrollSpeed).toBe(100);
        expect(end.gateIntervalMs).toBe(2000);
        expect(end.gapSize).toBe(64);
        expect(end.moverChance).toBe(0.5);
    });

    it('ramps monotonically: faster scroll, denser gates, smaller gaps', () => {
        for (let i = 0; i < 10; i++) {
            const current = difficultyFor(i / 10);
            const next = difficultyFor((i + 1) / 10);
            expect(next.scrollSpeed).toBeGreaterThan(current.scrollSpeed);
            expect(next.gateIntervalMs).toBeLessThan(current.gateIntervalMs);
            expect(next.gapSize).toBeLessThan(current.gapSize);
            expect(next.floaterIntervalMs).toBeLessThan(current.floaterIntervalMs);
            expect(next.sweeperIntervalMs).toBeLessThan(current.sweeperIntervalMs);
            expect(next.moverChance).toBeGreaterThanOrEqual(current.moverChance);
            expect(next.bobChance).toBeGreaterThan(current.bobChance);
        }
    });

    it('phases moving gates in from 25%, ramping their chance', () => {
        expect(difficultyFor(0).moverChance).toBe(0);
        expect(difficultyFor(0.24).moverChance).toBe(0);
        expect(difficultyFor(0.25).moverChance).toBeGreaterThan(0);
        expect(difficultyFor(1).moverChance).toBeGreaterThan(difficultyFor(0.25).moverChance);
    });

    it('activates floaters from 20% and sweepers from 40%', () => {
        expect(difficultyFor(0.19).floaterActive).toBe(false);
        expect(difficultyFor(0.2).floaterActive).toBe(true);
        expect(difficultyFor(0.39).sweeperActive).toBe(false);
        expect(difficultyFor(0.4).sweeperActive).toBe(true);
    });

    it('keeps every chance a valid probability across the ramp', () => {
        for (let i = 0; i <= 10; i++) {
            const d = difficultyFor(i / 10);
            expect(d.moverChance).toBeGreaterThanOrEqual(0);
            expect(d.moverChance).toBeLessThanOrEqual(1);
            expect(d.bobChance).toBeGreaterThanOrEqual(0);
            expect(d.bobChance).toBeLessThanOrEqual(1);
        }
    });
});
