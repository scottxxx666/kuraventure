import { describe, expect, it } from 'vitest';
import { difficultyFor } from '../src/scenes/minigames/cart-carry/difficulty';
import {
    CARRIER_MIN_Y,
    FLOOR_Y,
    MAX_SEPARATION,
    OBSTACLE_MARGIN
} from '../src/scenes/minigames/cart-carry/geometry';

describe('cart-carry difficultyFor', () => {
    it('clamps fractions outside 0..1', () => {
        expect(difficultyFor(-0.5)).toEqual(difficultyFor(0));
        expect(difficultyFor(1.5)).toEqual(difficultyFor(1));
    });

    it('has the intended endpoints', () => {
        const start = difficultyFor(0);
        expect(start.scrollSpeed).toBe(55);
        expect(start.sectionIntervalMs).toBe(2400);
        expect(start.spikeMinH).toBe(40);
        expect(start.spikeMaxH).toBe(72);
        const end = difficultyFor(1);
        expect(end.scrollSpeed).toBe(85);
        expect(end.sectionIntervalMs).toBe(1600);
        expect(end.spikeMinH).toBe(64);
        expect(end.spikeMaxH).toBe(104);
        expect(end.tiltSeparation).toBe(36);
        expect(end.tiltChance).toBe(0.4);
        expect(end.piranhaChance).toBe(0.35);
    });

    it('ramps monotonically: faster scroll, denser sections, taller spikes, more tilt', () => {
        for (let i = 0; i < 10; i++) {
            const current = difficultyFor(i / 10);
            const next = difficultyFor((i + 1) / 10);
            expect(next.scrollSpeed).toBeGreaterThan(current.scrollSpeed);
            expect(next.sectionIntervalMs).toBeLessThan(current.sectionIntervalMs);
            expect(next.spikeMinH).toBeGreaterThan(current.spikeMinH);
            expect(next.spikeMaxH).toBeGreaterThan(current.spikeMaxH);
            expect(next.tiltSeparation).toBeGreaterThan(current.tiltSeparation);
            expect(next.tiltChance).toBeGreaterThanOrEqual(current.tiltChance);
            expect(next.piranhaChance).toBeGreaterThanOrEqual(current.piranhaChance);
            expect(next.piranhaHiddenMs).toBeLessThan(current.piranhaHiddenMs);
        }
    });

    it('phases tilt pairs in from 20% and piranhas from 35%', () => {
        expect(difficultyFor(0.19).tiltActive).toBe(false);
        expect(difficultyFor(0.19).tiltChance).toBe(0);
        expect(difficultyFor(0.2).tiltActive).toBe(true);
        expect(difficultyFor(0.2).tiltChance).toBeGreaterThan(0);
        expect(difficultyFor(0.34).piranhaActive).toBe(false);
        expect(difficultyFor(0.34).piranhaChance).toBe(0);
        expect(difficultyFor(0.35).piranhaActive).toBe(true);
        expect(difficultyFor(0.35).piranhaChance).toBeGreaterThan(0);
    });

    it('keeps every chance a valid probability (and their sum below 1) across the ramp', () => {
        for (let i = 0; i <= 10; i++) {
            const d = difficultyFor(i / 10);
            expect(d.tiltChance).toBeGreaterThanOrEqual(0);
            expect(d.piranhaChance).toBeGreaterThanOrEqual(0);
            // Sections roll tilt, then piranha, else spike — spikes must stay possible.
            expect(d.tiltChance + d.piranhaChance).toBeLessThan(1);
        }
    });

    it('stays passable for any hardness: tilt slack and spike clearance', () => {
        for (const hardness of [0.5, 1, 2]) {
            for (let i = 0; i <= 10; i++) {
                const d = difficultyFor(i / 10, hardness);
                expect(d.tiltSeparation).toBeLessThanOrEqual(MAX_SEPARATION - 20);
                expect(d.spikeMaxH).toBeLessThanOrEqual(FLOOR_Y - CARRIER_MIN_Y - OBSTACLE_MARGIN);
            }
        }
    });

    describe('HARDNESS knob', () => {
        it('is the identity at 1', () => {
            for (let i = 0; i <= 10; i++) {
                expect(difficultyFor(i / 10, 1)).toEqual(difficultyFor(i / 10));
            }
        });

        it('remaps the ramp fraction symmetrically', () => {
            // 0.5 compresses the run into the easy half of the ramp...
            expect(difficultyFor(1, 0.5)).toEqual(difficultyFor(0.5));
            // ...and 2 starts the run halfway up it.
            expect(difficultyFor(0, 2)).toEqual(difficultyFor(0.5));
        });

        it('is monotone in hardness at a fixed fraction', () => {
            for (const t of [0.25, 0.5, 0.75]) {
                expect(difficultyFor(t, 0.5).scrollSpeed).toBeLessThan(difficultyFor(t, 1).scrollSpeed);
                expect(difficultyFor(t, 1).scrollSpeed).toBeLessThan(difficultyFor(t, 2).scrollSpeed);
            }
        });

        it('never escapes the tuned endpoint envelope', () => {
            for (const hardness of [0.1, 0.5, 2, 10]) {
                for (const t of [0, 0.5, 1]) {
                    const d = difficultyFor(t, hardness);
                    expect(d.scrollSpeed).toBeGreaterThanOrEqual(55);
                    expect(d.scrollSpeed).toBeLessThanOrEqual(85);
                    expect(d.tiltSeparation).toBeGreaterThanOrEqual(20);
                    expect(d.tiltSeparation).toBeLessThanOrEqual(36);
                }
            }
        });
    });
});
