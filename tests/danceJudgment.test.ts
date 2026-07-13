import { describe, expect, it } from 'vitest';
import {
    GOOD_WINDOW_MS,
    PERFECT_WINDOW_MS,
    SCORE,
    WIN_RATIO,
    judge,
    winScore
} from '../src/scenes/minigames/dance/judgment';

describe('dance judge', () => {
    it('grades by window boundaries, symmetrically in both signs', () => {
        expect(judge(0)).toBe('perfect');
        expect(judge(PERFECT_WINDOW_MS)).toBe('perfect');
        expect(judge(-PERFECT_WINDOW_MS)).toBe('perfect');
        expect(judge(PERFECT_WINDOW_MS + 1)).toBe('good');
        expect(judge(-PERFECT_WINDOW_MS - 1)).toBe('good');
        expect(judge(GOOD_WINDOW_MS)).toBe('good');
        expect(judge(-GOOD_WINDOW_MS)).toBe('good');
        expect(judge(GOOD_WINDOW_MS + 1)).toBeNull();
        expect(judge(-GOOD_WINDOW_MS - 1)).toBeNull();
    });

    it('scores perfect above good', () => {
        expect(SCORE.perfect).toBeGreaterThan(SCORE.good);
    });
});

describe('dance winScore', () => {
    it('is the win ratio of an all-perfect run, rounded up', () => {
        expect(winScore(10)).toBe(Math.ceil(10 * SCORE.perfect * WIN_RATIO));
        expect(winScore(0)).toBe(0);
    });

    it('is reachable with all-good hits at the current tuning', () => {
        // Sanity guard on the constants: a player who hits every note, even
        // sloppily, must clear the stage.
        expect(100 * SCORE.good).toBeGreaterThanOrEqual(winScore(100));
    });
});
