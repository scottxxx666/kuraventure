import type { Lane } from './lanes';

/**
 * Dance Beat map generation: notes on a half-beat grid whose density ramps
 * over the run (continuous curve like flappy's difficulty.ts). Deterministic
 * for a given seed (embedded mulberry32) so maps are unit-testable —
 * tests/danceBeatmap.test.ts; the scene seeds with Date.now() for variety.
 */

export interface Note {
    timeMs: number;
    lane: Lane;
}

export interface Density {
    /** Chance a full beat carries a note. */
    beatChance: number;
    /** Chance an off-beat (half-beat) carries a note. */
    offBeatChance: number;
    /** Minimum spacing between consecutive notes, ms. */
    minGapMs: number;
}

/** BPM the beat grid assumes — retune when a real song replaces the placeholder. */
export const BPM = 100;

/** Silent lead-in before the first note can land, ms. */
export const LEAD_IN_MS = 2400;
/** Note-free tail so the last note is judged before the run ends, ms. */
export const TAIL_MS = 1200;
/** Same-lane repeats closer than this are re-rolled (fast jacks are too hard for a casual game). */
const JACK_GAP_MS = 400;

function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

export function densityFor(elapsedFraction: number): Density {
    const t = Math.min(Math.max(elapsedFraction, 0), 1);
    return {
        beatChance: lerp(0.5, 1, t),
        offBeatChance: lerp(0, 0.35, t),
        minGapMs: lerp(550, 280, t)
    };
}

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

export interface BeatMapParams {
    runMs: number;
    seed: number;
    bpm?: number;
}

export function generateBeatMap({ runMs, seed, bpm = BPM }: BeatMapParams): Note[] {
    const rand = mulberry32(seed);
    const halfBeatMs = 60_000 / bpm / 2;
    const lastAllowed = runMs - TAIL_MS;
    const notes: Note[] = [];

    for (let half = 0; LEAD_IN_MS + half * halfBeatMs <= lastAllowed; half++) {
        const timeMs = LEAD_IN_MS + half * halfBeatMs;
        const { beatChance, offBeatChance, minGapMs } = densityFor(timeMs / runMs);
        const prev = notes[notes.length - 1];
        if (prev && timeMs - prev.timeMs < minGapMs) {
            continue;
        }
        if (rand() >= (half % 2 === 0 ? beatChance : offBeatChance)) {
            continue;
        }
        let lane = Math.floor(rand() * 4) as Lane;
        if (prev && lane === prev.lane && timeMs - prev.timeMs < JACK_GAP_MS) {
            lane = ((lane + 1 + Math.floor(rand() * 3)) % 4) as Lane;
        }
        notes.push({ timeMs, lane });
    }
    return notes;
}
