import type { Lane } from './lanes';
import { LANES } from './lanes';

/**
 * Time to Shine chart generation: call-and-response rounds on one beat grid.
 * Each round the host demonstrates a phrase (its slots drawn from rhythm
 * cells), one rest slot cues the hand-over, then the response repeats the
 * phrase as a pure (phraseSlots + 1)·slotMs time shift. Deterministic for a
 * given seed (embedded mulberry32) so charts are unit-testable —
 * tests/timeToShineRounds.test.ts; the scene seeds with Date.now().
 */

export type CellKind = 'single' | 'double' | 'rest';

export interface PoseNote {
    timeMs: number;
    lane: Lane;
    roundIndex: number;
    /** Index among its round's notes — drives the progress dots. */
    noteIndex: number;
}

export interface Round {
    index: number;
    phraseSlots: number;
    /** Sounding notes in the phrase (≠ phraseSlots once cells kick in). */
    noteCount: number;
    demoStartMs: number;
    /** Demo slots end here; the count-in rest slot follows. */
    demoEndMs: number;
    responseStartMs: number;
    /** Response slots + the trailing rest slot end here; next round starts. */
    endMs: number;
}

export interface Chart {
    rounds: Round[];
    demoNotes: PoseNote[];
    responseNotes: PoseNote[];
    /** Last response note + one slot of breathing room. */
    endMs: number;
}

/**
 * Beat-grid period; kept an integer so every derived time lands on a whole ms
 * (the round tests assert exact `% SLOT_MS`). 550 ms ≈ 109 BPM — a touch
 * quicker than a flat 100. Must stay > 500 or NICE_WINDOW_MS breaks the
 * judgment invariant (NICE < MIN_NOTE_GAP_MS/2). Retune with a real song.
 */
export const BEAT_MS = 550;
export const BPM = Math.round(60_000 / BEAT_MS);
/** One pose slot = 2 beats; fixed all run — difficulty ramps via phrase length. */
export const SLOT_MS = BEAT_MS * 2;
/**
 * Count-in before the first pose. Must be a whole number of BEAT_MS so every
 * note lands on the same beat grid the whistle/ring use — everything in the
 * game derives from BEAT_MS, so retuning it keeps the whole game in sync.
 */
export const LEAD_IN_MS = 4 * BEAT_MS;
/** Phrase length (in slots) per round. */
export const PHRASE_SCHEDULE: readonly number[] = [1, 1, 2, 2, 3, 3, 4, 4];
/** Closest two notes can sit (a double cell's inner gap) — judgment windows must respect it. */
export const MIN_NOTE_GAP_MS = SLOT_MS / 2;

/** rhythmPatterns rollout: doubles from round index 4, rests from 6. */
const DOUBLE_FROM_ROUND = 4;
const REST_FROM_ROUND = 6;
const DOUBLE_CHANCE = 0.35;
const REST_CHANCE = 0.25;

/** mulberry32 — tiny deterministic PRNG, uniform in [0, 1). */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export interface ChartParams {
    seed: number;
    schedule?: readonly number[];
    slotMs?: number;
    leadInMs?: number;
    /** Feature B — rhythm cells; off = every slot a plain single. */
    rhythmPatterns?: boolean;
    /** Feature C — rounds 1–2 draw lanes from {←, →} only. */
    laneRamp?: boolean;
}

export function generateChart({
    seed,
    schedule = PHRASE_SCHEDULE,
    slotMs = SLOT_MS,
    leadInMs = LEAD_IN_MS,
    rhythmPatterns = false,
    laneRamp = false
}: ChartParams): Chart {
    const rand = mulberry32(seed);
    const rounds: Round[] = [];
    const demoNotes: PoseNote[] = [];
    const responseNotes: PoseNote[] = [];

    let startMs = leadInMs;
    schedule.forEach((phraseSlots, index) => {
        const cells = rollCells(rand, phraseSlots, index, rhythmPatterns);
        const lanes = rollLanes(rand, cells, index, laneRamp);

        const demoStartMs = startMs;
        const demoEndMs = demoStartMs + phraseSlots * slotMs;
        const responseStartMs = demoEndMs + slotMs;
        const endMs = responseStartMs + (phraseSlots + 1) * slotMs;
        const shiftMs = responseStartMs - demoStartMs;

        let noteIndex = 0;
        cells.forEach((cell, slot) => {
            for (const offset of cellOffsets(cell, slotMs)) {
                const timeMs = demoStartMs + slot * slotMs + offset;
                const lane = lanes[noteIndex];
                demoNotes.push({ timeMs, lane, roundIndex: index, noteIndex });
                responseNotes.push({ timeMs: timeMs + shiftMs, lane, roundIndex: index, noteIndex });
                noteIndex++;
            }
        });

        rounds.push({ index, phraseSlots, noteCount: noteIndex, demoStartMs, demoEndMs, responseStartMs, endMs });
        startMs = endMs;
    });

    const last = responseNotes[responseNotes.length - 1];
    return { rounds, demoNotes, responseNotes, endMs: last ? last.timeMs + slotMs : startMs };
}

function cellOffsets(cell: CellKind, slotMs: number): number[] {
    switch (cell) {
        case 'single':
            return [0];
        case 'double':
            return [0, slotMs / 2];
        case 'rest':
            return [];
    }
}

/** Slot 0 always sounds (entry anchor); at most half the slots may rest. */
function rollCells(rand: () => number, phraseSlots: number, roundIndex: number, rhythmPatterns: boolean): CellKind[] {
    const cells: CellKind[] = [];
    const maxRests = Math.floor(phraseSlots / 2);
    let rests = 0;
    for (let slot = 0; slot < phraseSlots; slot++) {
        let kind: CellKind = 'single';
        if (rhythmPatterns) {
            if (roundIndex >= REST_FROM_ROUND && slot > 0 && rests < maxRests && rand() < REST_CHANCE) {
                kind = 'rest';
            } else if (roundIndex >= DOUBLE_FROM_ROUND && rand() < DOUBLE_CHANCE) {
                kind = 'double';
            }
        }
        if (kind === 'rest') {
            rests++;
        }
        cells.push(kind);
    }
    return cells;
}

/**
 * One lane per sounding note; adjacent notes in a phrase never repeat a lane
 * (two identical consecutive arrows read as one pose, not two).
 */
function rollLanes(rand: () => number, cells: CellKind[], roundIndex: number, laneRamp: boolean): Lane[] {
    const pool: readonly Lane[] = laneRamp && roundIndex < 2 ? [0, 3] : LANES;
    const lanes: Lane[] = [];
    let prev: Lane | null = null;
    for (const cell of cells) {
        for (let i = cellOffsets(cell, SLOT_MS).length; i > 0; i--) {
            const choices = prev === null ? pool : pool.filter((lane) => lane !== prev);
            const lane = choices[Math.floor(rand() * choices.length)];
            lanes.push(lane);
            prev = lane;
        }
    }
    return lanes;
}
