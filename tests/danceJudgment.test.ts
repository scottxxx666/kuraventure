import { describe, expect, it } from 'vitest';
import {
    GOOD_WINDOW_MS,
    PERFECT_WINDOW_MS,
    SCORE,
    WIN_RATIO,
    judge,
    winScore
} from '../src/scenes/minigames/dance/judgment';
import { directionToLane } from '../src/scenes/minigames/dance/lanes';

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

describe('dance directionToLane', () => {
    it('returns null inside the deadzone', () => {
        expect(directionToLane({ x: 0, y: 0 })).toBeNull();
        expect(directionToLane({ x: 0.3, y: 0.3 })).toBeNull();
        expect(directionToLane({ x: 0.49, y: 0 })).toBeNull();
    });

    it('maps the four cardinals in DDR order ← ↓ ↑ →', () => {
        expect(directionToLane({ x: -1, y: 0 })).toBe(0);
        expect(directionToLane({ x: 0, y: 1 })).toBe(1);
        expect(directionToLane({ x: 0, y: -1 })).toBe(2);
        expect(directionToLane({ x: 1, y: 0 })).toBe(3);
    });

    it('picks the dominant axis on off-diagonals', () => {
        expect(directionToLane({ x: -0.9, y: 0.3 })).toBe(0);
        expect(directionToLane({ x: 0.2, y: 0.9 })).toBe(1);
        expect(directionToLane({ x: -0.1, y: -0.8 })).toBe(2);
        expect(directionToLane({ x: 0.8, y: -0.4 })).toBe(3);
    });

    it('breaks perfect-diagonal ties horizontally, stably', () => {
        expect(directionToLane({ x: 0.71, y: -0.71 })).toBe(3);
        expect(directionToLane({ x: -0.71, y: 0.71 })).toBe(0);
    });

    it('honors a custom deadzone', () => {
        expect(directionToLane({ x: 0.4, y: 0 }, 0.3)).toBe(3);
        expect(directionToLane({ x: 0.4, y: 0 }, 0.6)).toBeNull();
    });
});
