import { describe, expect, it } from 'vitest';
import {
    CUTOFF_MS,
    NICE_WINDOW_MS,
    PERFECT_WINDOW_MS,
    SCORE,
    WIN_RATIO,
    approachFrac,
    isScoring,
    judgePress,
    winScore
} from '../src/scenes/minigames/time-to-shine/judgment';
import { MIN_NOTE_GAP_MS } from '../src/scenes/minigames/time-to-shine/rounds';

describe('time to shine judgePress', () => {
    it('grades perfect exactly inside the perfect window, both signs', () => {
        expect(judgePress(0, true)).toBe('perfect');
        expect(judgePress(PERFECT_WINDOW_MS, true)).toBe('perfect');
        expect(judgePress(-PERFECT_WINDOW_MS, true)).toBe('perfect');
        expect(judgePress(PERFECT_WINDOW_MS + 1, true)).toBe('nice');
        expect(judgePress(-(PERFECT_WINDOW_MS + 1), true)).toBe('nice');
    });

    it('grades nice up to the nice window, both signs', () => {
        expect(judgePress(NICE_WINDOW_MS, true)).toBe('nice');
        expect(judgePress(-NICE_WINDOW_MS, true)).toBe('nice');
    });

    it('splits early/late by press side beyond the nice window', () => {
        // deltaMs = note - press: positive means the press came early.
        expect(judgePress(NICE_WINDOW_MS + 1, true)).toBe('early');
        expect(judgePress(CUTOFF_MS, true)).toBe('early');
        expect(judgePress(-(NICE_WINDOW_MS + 1), true)).toBe('late');
        expect(judgePress(-CUTOFF_MS, true)).toBe('late');
    });

    it('grades a wrong lane as wrong no matter the timing', () => {
        expect(judgePress(0, false)).toBe('wrong');
        expect(judgePress(NICE_WINDOW_MS, false)).toBe('wrong');
        expect(judgePress(-CUTOFF_MS, false)).toBe('wrong');
    });
});

describe('time to shine scoring', () => {
    it('scores only perfect and nice', () => {
        expect(isScoring('perfect')).toBe(true);
        expect(isScoring('nice')).toBe(true);
        expect(isScoring('early')).toBe(false);
        expect(isScoring('late')).toBe(false);
        expect(isScoring('wrong')).toBe(false);
    });

    it('orders scores perfect > nice > 0', () => {
        expect(SCORE.perfect).toBeGreaterThan(SCORE.nice);
        expect(SCORE.nice).toBeGreaterThan(0);
    });

    it('computes the win threshold with ceil', () => {
        expect(winScore(20)).toBe(20 * SCORE.perfect * WIN_RATIO);
        expect(winScore(21)).toBe(Math.ceil(21 * SCORE.perfect * WIN_RATIO));
        expect(winScore(0)).toBe(0);
    });

    it('keeps the threshold reachable with all-nice hits or better mixes', () => {
        // 60 per nice vs a 60% bar of the perfect score: all-nice exactly clears.
        expect(20 * SCORE.nice).toBeGreaterThanOrEqual(winScore(20));
    });
});

describe('time to shine window geometry', () => {
    it('keeps scoring windows unambiguous at the minimum note gap', () => {
        // A press that can score must bind to the note it aimed at even at a
        // double cell's inner gap — guards retunes of either constant.
        expect(NICE_WINDOW_MS).toBeLessThan(MIN_NOTE_GAP_MS / 2);
    });

    it('expires notes only after the whole binding window has passed', () => {
        expect(CUTOFF_MS).toBeGreaterThanOrEqual(NICE_WINDOW_MS);
    });
});

describe('time to shine approachFrac', () => {
    const LEAD = 600;
    const NOTE = 5000;

    it('is 0 before the lead window opens', () => {
        expect(approachFrac(NOTE, NOTE - LEAD - 1, LEAD)).toBe(0);
        expect(approachFrac(NOTE, 0, LEAD)).toBe(0);
    });

    it('is 1 exactly one lead-length before the note', () => {
        expect(approachFrac(NOTE, NOTE - LEAD, LEAD)).toBe(1);
    });

    it('falls linearly across the lead window', () => {
        expect(approachFrac(NOTE, NOTE - LEAD / 2, LEAD)).toBe(0.5);
    });

    it('is 0 at the hit time and after (remaining <= 0)', () => {
        expect(approachFrac(NOTE, NOTE, LEAD)).toBe(0);
        expect(approachFrac(NOTE, NOTE + 100, LEAD)).toBe(0);
    });
});
