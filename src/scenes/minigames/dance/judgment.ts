/**
 * Dance Beat hit judgment & scoring. Pure TS — unit-tested in
 * tests/danceJudgment.test.ts. Windows are generous because the virtual
 * joystick is imprecise (PLAN.md §3.10); stray presses cost nothing
 * (family-friendly — a miss only happens when a note goes unhit).
 */

export type Judgment = 'perfect' | 'good';

export const PERFECT_WINDOW_MS = 60;
export const GOOD_WINDOW_MS = 150;

export const SCORE: Readonly<Record<Judgment, number>> = { perfect: 100, good: 60 };

/** Fraction of the maximum (all-perfect) score needed to clear the stage. */
export const WIN_RATIO = 0.6;

/** Judges a press by its offset from the note time (either sign), null = too far. */
export function judge(deltaMs: number): Judgment | null {
    const d = Math.abs(deltaMs);
    if (d <= PERFECT_WINDOW_MS) {
        return 'perfect';
    }
    if (d <= GOOD_WINDOW_MS) {
        return 'good';
    }
    return null;
}

export function winScore(noteCount: number): number {
    return Math.ceil(noteCount * SCORE.perfect * WIN_RATIO);
}
