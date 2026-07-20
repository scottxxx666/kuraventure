import { describe, expect, it } from 'vitest';
import {
    LEAD_IN_MS,
    MIN_NOTE_GAP_MS,
    PHRASE_SCHEDULE,
    SLOT_MS,
    generateChart
} from '../src/scenes/minigames/time-to-shine/rounds';
import type { Chart } from '../src/scenes/minigames/time-to-shine/rounds';

const SEEDS = [1, 2, 3, 42, 99];

function chart(seed: number, flags: { rhythmPatterns?: boolean; laneRamp?: boolean } = {}): Chart {
    return generateChart({ seed, ...flags });
}

describe('time to shine generateChart — timeline', () => {
    it('is deterministic for a seed and varies across seeds', () => {
        expect(chart(42)).toEqual(chart(42));
        expect(chart(42, { rhythmPatterns: true })).toEqual(chart(42, { rhythmPatterns: true }));
        expect(chart(42)).not.toEqual(chart(43));
    });

    it('builds one round per schedule entry, contiguous from the lead-in', () => {
        const { rounds } = chart(1);
        expect(rounds).toHaveLength(PHRASE_SCHEDULE.length);
        let cursor = LEAD_IN_MS;
        rounds.forEach((round, i) => {
            expect(round.index).toBe(i);
            expect(round.phraseSlots).toBe(PHRASE_SCHEDULE[i]);
            expect(round.demoStartMs).toBe(cursor);
            expect(round.demoEndMs).toBe(round.demoStartMs + round.phraseSlots * SLOT_MS);
            expect(round.responseStartMs).toBe(round.demoEndMs + SLOT_MS);
            expect(round.endMs).toBe(round.responseStartMs + (round.phraseSlots + 1) * SLOT_MS);
            cursor = round.endMs;
        });
    });

    it('mirrors every demo note into the response as a pure time shift', () => {
        for (const seed of SEEDS) {
            const c = chart(seed, { rhythmPatterns: true });
            expect(c.responseNotes).toHaveLength(c.demoNotes.length);
            c.demoNotes.forEach((demo, i) => {
                const response = c.responseNotes[i];
                const round = c.rounds[demo.roundIndex];
                expect(response.lane).toBe(demo.lane);
                expect(response.roundIndex).toBe(demo.roundIndex);
                expect(response.noteIndex).toBe(demo.noteIndex);
                expect(response.timeMs).toBe(demo.timeMs + (round.phraseSlots + 1) * SLOT_MS);
            });
        }
    });

    it('keeps notes inside their round and strictly time-sorted', () => {
        for (const seed of SEEDS) {
            const c = chart(seed, { rhythmPatterns: true });
            for (const list of [c.demoNotes, c.responseNotes]) {
                for (let i = 1; i < list.length; i++) {
                    expect(list[i].timeMs).toBeGreaterThan(list[i - 1].timeMs);
                }
            }
            for (const note of c.demoNotes) {
                const round = c.rounds[note.roundIndex];
                expect(note.timeMs).toBeGreaterThanOrEqual(round.demoStartMs);
                expect(note.timeMs).toBeLessThan(round.demoEndMs);
            }
            for (const note of c.responseNotes) {
                const round = c.rounds[note.roundIndex];
                expect(note.timeMs).toBeGreaterThanOrEqual(round.responseStartMs);
                expect(note.timeMs).toBeLessThan(round.endMs - SLOT_MS);
            }
        }
    });

    it('never places two notes closer than the minimum gap', () => {
        for (const seed of SEEDS) {
            const { responseNotes } = chart(seed, { rhythmPatterns: true });
            for (let i = 1; i < responseNotes.length; i++) {
                if (responseNotes[i].roundIndex === responseNotes[i - 1].roundIndex) {
                    expect(responseNotes[i].timeMs - responseNotes[i - 1].timeMs).toBeGreaterThanOrEqual(
                        MIN_NOTE_GAP_MS
                    );
                }
            }
        }
    });

    it('runs 60–90 s with the default schedule, first note past the lead-in', () => {
        for (const flags of [{}, { rhythmPatterns: true }]) {
            const c = chart(7, flags);
            expect(c.demoNotes[0].timeMs).toBeGreaterThanOrEqual(LEAD_IN_MS);
            expect(c.endMs).toBeGreaterThan(60_000);
            expect(c.endMs).toBeLessThan(90_000);
        }
    });
});

describe('time to shine generateChart — lanes', () => {
    it('uses only lanes 0-3 and, across a chart, all of them', () => {
        const c = chart(5);
        for (const note of c.demoNotes) {
            expect([0, 1, 2, 3]).toContain(note.lane);
        }
        expect(new Set(c.demoNotes.map((n) => n.lane)).size).toBe(4);
    });

    it('never repeats a lane on adjacent notes within a phrase', () => {
        for (const seed of SEEDS) {
            const { demoNotes } = chart(seed, { rhythmPatterns: true, laneRamp: true });
            for (let i = 1; i < demoNotes.length; i++) {
                if (demoNotes[i].roundIndex === demoNotes[i - 1].roundIndex) {
                    expect(demoNotes[i].lane).not.toBe(demoNotes[i - 1].lane);
                }
            }
        }
    });

    it('laneRamp on: rounds 1-2 draw only ← and →', () => {
        for (const seed of SEEDS) {
            const { demoNotes } = chart(seed, { laneRamp: true });
            for (const note of demoNotes.filter((n) => n.roundIndex < 2)) {
                expect([0, 3]).toContain(note.lane);
            }
        }
    });

    it('laneRamp off: early rounds may use vertical lanes too', () => {
        const early = SEEDS.flatMap((seed) =>
            chart(seed).demoNotes.filter((n) => n.roundIndex < 2)
        );
        expect(early.some((n) => n.lane === 1 || n.lane === 2)).toBe(true);
    });
});

describe('time to shine generateChart — rhythm cells', () => {
    it('rhythmPatterns off: every slot is a plain on-grid single', () => {
        for (const seed of SEEDS) {
            const c = chart(seed);
            const slotCount = PHRASE_SCHEDULE.reduce((a, b) => a + b, 0);
            expect(c.demoNotes).toHaveLength(slotCount);
            for (const note of c.demoNotes) {
                const round = c.rounds[note.roundIndex];
                expect((note.timeMs - round.demoStartMs) % SLOT_MS).toBe(0);
            }
        }
    });

    it('rhythmPatterns on: rounds 1-4 stay plain singles', () => {
        for (const seed of SEEDS) {
            const c = chart(seed, { rhythmPatterns: true });
            for (const note of c.demoNotes.filter((n) => n.roundIndex < 4)) {
                const round = c.rounds[note.roundIndex];
                expect((note.timeMs - round.demoStartMs) % SLOT_MS).toBe(0);
            }
            for (let i = 0; i < 4; i++) {
                expect(c.rounds[i].noteCount).toBe(c.rounds[i].phraseSlots);
            }
        }
    });

    it('rhythmPatterns on: off-grid notes are exactly half-slot doubles', () => {
        const offGrid = SEEDS.flatMap((seed) => {
            const c = chart(seed, { rhythmPatterns: true });
            return c.demoNotes.filter(
                (n) => (n.timeMs - c.rounds[n.roundIndex].demoStartMs) % SLOT_MS !== 0
            );
        });
        expect(offGrid.length).toBeGreaterThan(0); // doubles do appear across seeds
        for (const seed of SEEDS) {
            const c = chart(seed, { rhythmPatterns: true });
            for (const note of c.demoNotes) {
                const offset = (note.timeMs - c.rounds[note.roundIndex].demoStartMs) % SLOT_MS;
                expect([0, SLOT_MS / 2]).toContain(offset);
            }
        }
    });

    it('rhythmPatterns on: every phrase opens on its first slot and mostly sounds', () => {
        for (const seed of SEEDS) {
            const c = chart(seed, { rhythmPatterns: true });
            for (const round of c.rounds) {
                const notes = c.demoNotes.filter((n) => n.roundIndex === round.index);
                expect(notes[0].timeMs).toBe(round.demoStartMs); // slot 0 always sounds
                const soundingSlots = new Set(
                    notes.map((n) => Math.floor((n.timeMs - round.demoStartMs) / SLOT_MS))
                );
                expect(soundingSlots.size).toBeGreaterThanOrEqual(Math.ceil(round.phraseSlots / 2));
            }
        }
    });
});
