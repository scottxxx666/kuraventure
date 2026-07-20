/**
 * Time to Shine press judgment & scoring. Pure TS — unit-tested in
 * tests/timeToShineJudgment.test.ts. Windows are wider than dance's (memory
 * game, casual feel). A press that binds to a response note CONSUMES it
 * whatever the direction — without that, mashing all four lanes every slot
 * would score full marks; presses that bind to nothing cost nothing.
 */

export type ScoringJudgment = 'perfect' | 'nice';
/** What a bound press resolves to; only perfect/nice score. */
export type Feedback = ScoringJudgment | 'early' | 'late' | 'wrong';

export const PERFECT_WINDOW_MS = 100;
export const NICE_WINDOW_MS = 250;
/**
 * A press binds to the nearest pending note within ±this (earlier wins
 * ties); an unhit note expires as a miss this long past its time. Must stay
 * under half the minimum note gap (rounds.ts MIN_NOTE_GAP_MS) only for the
 * scoring windows — binding may overlap, nearest-note search disambiguates.
 */
export const CUTOFF_MS = 300;

export const SCORE: Readonly<Record<ScoringJudgment, number>> = { perfect: 100, nice: 60 };

/** Fraction of the maximum (all-perfect) score needed to clear the stage. */
export const WIN_RATIO = 0.6;

/** deltaMs = note.timeMs - pressTimeMs, so positive = pressed early. */
export function judgePress(deltaMs: number, correctLane: boolean): Feedback {
    if (!correctLane) {
        return 'wrong';
    }
    const d = Math.abs(deltaMs);
    if (d <= PERFECT_WINDOW_MS) {
        return 'perfect';
    }
    if (d <= NICE_WINDOW_MS) {
        return 'nice';
    }
    return deltaMs > 0 ? 'early' : 'late';
}

export function isScoring(feedback: Feedback): feedback is ScoringJudgment {
    return feedback === 'perfect' || feedback === 'nice';
}

export function winScore(responseNoteCount: number): number {
    return Math.ceil(responseNoteCount * SCORE.perfect * WIN_RATIO);
}

/**
 * Fill for the approach ring that telegraphs *when* to press the next
 * remembered pose: 1 exactly one lead-length before the note, falling
 * linearly to 0 at the hit time; 0 before the lead window opens and once the
 * note is reached or past (remaining ≤ 0).
 */
export function approachFrac(noteMs: number, nowMs: number, leadMs: number): number {
    const remaining = noteMs - nowMs;
    if (remaining <= 0 || remaining > leadMs) {
        return 0;
    }
    return remaining / leadMs;
}
