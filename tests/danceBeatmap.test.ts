import { describe, expect, it } from 'vitest';
import {
    LEAD_IN_MS,
    TAIL_MS,
    densityFor,
    generateBeatMap
} from '../src/scenes/minigames/dance/beatmap';

const RUN_MS = 60_000;

describe('dance densityFor', () => {
    it('clamps fractions outside 0..1', () => {
        expect(densityFor(-0.5)).toEqual(densityFor(0));
        expect(densityFor(1.5)).toEqual(densityFor(1));
    });

    it('has the intended endpoints', () => {
        const start = densityFor(0);
        expect(start.beatChance).toBe(0.5);
        expect(start.offBeatChance).toBe(0);
        expect(start.minGapMs).toBe(550);
        const end = densityFor(1);
        expect(end.beatChance).toBe(1);
        expect(end.offBeatChance).toBe(0.35);
        expect(end.minGapMs).toBe(280);
    });

    it('ramps monotonically: more notes, tighter spacing', () => {
        for (let i = 0; i < 10; i++) {
            const current = densityFor(i / 10);
            const next = densityFor((i + 1) / 10);
            expect(next.beatChance).toBeGreaterThan(current.beatChance);
            expect(next.offBeatChance).toBeGreaterThan(current.offBeatChance);
            expect(next.minGapMs).toBeLessThan(current.minGapMs);
        }
    });

    it('keeps every chance a valid probability across the ramp', () => {
        for (let i = 0; i <= 10; i++) {
            const d = densityFor(i / 10);
            expect(d.beatChance).toBeGreaterThanOrEqual(0);
            expect(d.beatChance).toBeLessThanOrEqual(1);
            expect(d.offBeatChance).toBeGreaterThanOrEqual(0);
            expect(d.offBeatChance).toBeLessThanOrEqual(1);
        }
    });
});

describe('dance generateBeatMap', () => {
    it('is deterministic for a seed and varies across seeds', () => {
        expect(generateBeatMap({ runMs: RUN_MS, seed: 42 })).toEqual(
            generateBeatMap({ runMs: RUN_MS, seed: 42 })
        );
        expect(generateBeatMap({ runMs: RUN_MS, seed: 42 })).not.toEqual(
            generateBeatMap({ runMs: RUN_MS, seed: 43 })
        );
    });

    it('produces a non-trivial, time-sorted map', () => {
        const notes = generateBeatMap({ runMs: RUN_MS, seed: 1 });
        expect(notes.length).toBeGreaterThan(30);
        for (let i = 1; i < notes.length; i++) {
            expect(notes[i].timeMs).toBeGreaterThan(notes[i - 1].timeMs);
        }
    });

    it('keeps every note inside the lead-in/tail bounds', () => {
        for (const seed of [1, 2, 3]) {
            const notes = generateBeatMap({ runMs: RUN_MS, seed });
            expect(notes[0].timeMs).toBeGreaterThanOrEqual(LEAD_IN_MS);
            expect(notes[notes.length - 1].timeMs).toBeLessThanOrEqual(RUN_MS - TAIL_MS);
        }
    });

    it('respects the ramping minimum gap between consecutive notes', () => {
        for (const seed of [1, 2, 3]) {
            const notes = generateBeatMap({ runMs: RUN_MS, seed });
            for (let i = 1; i < notes.length; i++) {
                const gap = notes[i].timeMs - notes[i - 1].timeMs;
                expect(gap).toBeGreaterThanOrEqual(densityFor(notes[i].timeMs / RUN_MS).minGapMs);
            }
        }
    });

    it('gets denser toward the end of the run', () => {
        const notes = generateBeatMap({ runMs: RUN_MS, seed: 7 });
        const firstThird = notes.filter((n) => n.timeMs < RUN_MS / 3).length;
        const lastThird = notes.filter((n) => n.timeMs >= (RUN_MS * 2) / 3).length;
        expect(lastThird).toBeGreaterThan(firstThird);
    });

    it('uses only lanes 0-3 and, across a map, all of them', () => {
        const notes = generateBeatMap({ runMs: RUN_MS, seed: 5 });
        for (const note of notes) {
            expect([0, 1, 2, 3]).toContain(note.lane);
        }
        expect(new Set(notes.map((n) => n.lane)).size).toBe(4);
    });

    it('caps to short runs without escaping the tail bound', () => {
        const notes = generateBeatMap({ runMs: 20_000, seed: 9 });
        expect(notes.length).toBeGreaterThan(0);
        expect(notes[notes.length - 1].timeMs).toBeLessThanOrEqual(20_000 - TAIL_MS);
    });
});
