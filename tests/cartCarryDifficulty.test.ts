import { describe, expect, it } from 'vitest';
import { difficultyFor } from '../src/scenes/minigames/cart-carry/difficulty';
import {
    CARRIER_SIZE,
    CORRIDOR_H,
    OBSTACLE_MARGIN
} from '../src/scenes/minigames/cart-carry/geometry';

describe('cart-carry difficultyFor', () => {
    it('clamps fractions outside 0..1', () => {
        expect(difficultyFor(-0.5)).toEqual(difficultyFor(0));
        expect(difficultyFor(1.5)).toEqual(difficultyFor(1));
    });

    it('has the intended endpoints', () => {
        const start = difficultyFor(0);
        expect(start.sectionGapPx).toBe(480);
        expect(start.spikeMinH).toBe(160);
        expect(start.spikeMaxH).toBe(288);
        expect(start.gateGapSize).toBe(336);
        const end = difficultyFor(1);
        expect(end.sectionGapPx).toBe(288);
        expect(end.spikeMinH).toBe(256);
        expect(end.spikeMaxH).toBe(416);
        expect(end.gateGapSize).toBe(240);
        expect(end.slalomChance).toBe(0.3);
        expect(end.gateChance).toBe(0.25);
        expect(end.piranhaChance).toBe(0.3);
        expect(end.piranhaHiddenMs).toBe(800);
        expect(end.piranhaExtendedMs).toBe(1200);
    });

    it('ramps monotonically: denser sections, taller spikes, narrower gates', () => {
        for (let i = 0; i < 10; i++) {
            const current = difficultyFor(i / 10);
            const next = difficultyFor((i + 1) / 10);
            expect(next.sectionGapPx).toBeLessThan(current.sectionGapPx);
            expect(next.spikeMinH).toBeGreaterThan(current.spikeMinH);
            expect(next.spikeMaxH).toBeGreaterThan(current.spikeMaxH);
            expect(next.gateGapSize).toBeLessThan(current.gateGapSize);
            expect(next.slalomChance).toBeGreaterThanOrEqual(current.slalomChance);
            expect(next.gateChance).toBeGreaterThanOrEqual(current.gateChance);
            expect(next.piranhaChance).toBeGreaterThanOrEqual(current.piranhaChance);
            expect(next.piranhaHiddenMs).toBeLessThan(current.piranhaHiddenMs);
        }
    });

    it('phases slaloms in from 15%, gates from 25%, piranhas from 35%', () => {
        expect(difficultyFor(0.14).slalomActive).toBe(false);
        expect(difficultyFor(0.14).slalomChance).toBe(0);
        expect(difficultyFor(0.15).slalomActive).toBe(true);
        expect(difficultyFor(0.15).slalomChance).toBeGreaterThan(0);
        expect(difficultyFor(0.24).gateActive).toBe(false);
        expect(difficultyFor(0.24).gateChance).toBe(0);
        expect(difficultyFor(0.25).gateActive).toBe(true);
        expect(difficultyFor(0.25).gateChance).toBeGreaterThan(0);
        expect(difficultyFor(0.34).piranhaActive).toBe(false);
        expect(difficultyFor(0.34).piranhaChance).toBe(0);
        expect(difficultyFor(0.35).piranhaActive).toBe(true);
        expect(difficultyFor(0.35).piranhaChance).toBeGreaterThan(0);
    });

    it('keeps single spikes always possible (chance sum < 1) for any hardness', () => {
        for (const hardness of [0.5, 1, 2]) {
            for (let i = 0; i <= 10; i++) {
                const d = difficultyFor(i / 10, hardness);
                expect(d.slalomChance).toBeGreaterThanOrEqual(0);
                expect(d.gateChance).toBeGreaterThanOrEqual(0);
                expect(d.piranhaChance).toBeGreaterThanOrEqual(0);
                expect(d.slalomChance + d.gateChance + d.piranhaChance).toBeLessThan(1);
            }
        }
    });

    it('stays passable for any hardness: gate gaps and spike clearance', () => {
        const gateFloor = CARRIER_SIZE + 2 * OBSTACLE_MARGIN; // 176
        const spikeCeiling = CORRIDOR_H - CARRIER_SIZE - 2 * OBSTACLE_MARGIN; // 480
        for (const hardness of [0.5, 1, 2]) {
            for (let i = 0; i <= 10; i++) {
                const d = difficultyFor(i / 10, hardness);
                expect(d.gateGapSize).toBeGreaterThanOrEqual(gateFloor);
                expect(d.spikeMaxH).toBeLessThanOrEqual(spikeCeiling);
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
            // 0.5 compresses the level into the easy half of the ramp...
            expect(difficultyFor(1, 0.5)).toEqual(difficultyFor(0.5));
            // ...and 2 starts the level halfway up it.
            expect(difficultyFor(0, 2)).toEqual(difficultyFor(0.5));
        });

        it('is monotone in hardness at a fixed fraction', () => {
            for (const t of [0.25, 0.5, 0.75]) {
                expect(difficultyFor(t, 0.5).sectionGapPx).toBeGreaterThan(difficultyFor(t, 1).sectionGapPx);
                expect(difficultyFor(t, 1).sectionGapPx).toBeGreaterThan(difficultyFor(t, 2).sectionGapPx);
            }
        });

        it('never escapes the tuned endpoint envelope', () => {
            for (const hardness of [0.1, 0.5, 2, 10]) {
                for (const t of [0, 0.5, 1]) {
                    const d = difficultyFor(t, hardness);
                    expect(d.sectionGapPx).toBeGreaterThanOrEqual(288);
                    expect(d.sectionGapPx).toBeLessThanOrEqual(480);
                    expect(d.gateGapSize).toBeGreaterThanOrEqual(240);
                    expect(d.gateGapSize).toBeLessThanOrEqual(336);
                }
            }
        });
    });
});
