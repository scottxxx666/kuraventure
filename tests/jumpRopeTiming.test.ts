import { describe, expect, it } from 'vitest';
import {
    AIR_MS,
    BOTTOM_PHASE,
    END_PERIOD_MS,
    ENTER_WINDOW,
    JUMP_WINDOW_MS,
    START_PERIOD_MS,
    TARGET_JUMPS,
    advancePhase,
    enterGaugeFrac,
    isJumpWindow,
    isSafeEnterPhase,
    jumpGaugeFrac,
    periodForCount,
    timeToBottomMs
} from '../src/scenes/minigames/jump-rope/timing';

describe('jump-rope periodForCount', () => {
    it('ramps linearly from the start to the end period', () => {
        expect(periodForCount(0)).toBe(START_PERIOD_MS);
        expect(periodForCount(TARGET_JUMPS - 1)).toBe(END_PERIOD_MS);
        const mid = periodForCount(Math.floor((TARGET_JUMPS - 1) / 2));
        expect(mid).toBeLessThan(START_PERIOD_MS);
        expect(mid).toBeGreaterThan(END_PERIOD_MS);
    });

    it('gets strictly faster with every count', () => {
        for (let count = 1; count < TARGET_JUMPS; count++) {
            expect(periodForCount(count)).toBeLessThan(periodForCount(count - 1));
        }
    });

    it('clamps counts outside the ramp (celebration frames keep final speed)', () => {
        expect(periodForCount(-1)).toBe(START_PERIOD_MS);
        expect(periodForCount(TARGET_JUMPS)).toBe(END_PERIOD_MS);
        expect(periodForCount(TARGET_JUMPS + 5)).toBe(END_PERIOD_MS);
    });
});

describe('jump-rope advancePhase', () => {
    const PERIOD = 2000;

    it('advances proportionally to delta / period', () => {
        const step = advancePhase(0, 500, PERIOD);
        expect(step.phase).toBeCloseTo(0.25);
        expect(step.crossedBottom).toBe(false);
    });

    it('reports a bottom crossing exactly when the phase reaches it', () => {
        expect(advancePhase(0.4, 199, PERIOD).crossedBottom).toBe(false);
        expect(advancePhase(0.4, 200, PERIOD).crossedBottom).toBe(true);
    });

    it('does not re-report after the bottom has passed', () => {
        expect(advancePhase(0.5, 100, PERIOD).crossedBottom).toBe(false);
        expect(advancePhase(0.9, 100, PERIOD).crossedBottom).toBe(false);
    });

    it('wraps past 1 and still catches the next crossing', () => {
        const wrapped = advancePhase(0.9, 300, PERIOD);
        expect(wrapped.phase).toBeCloseTo(0.05);
        expect(wrapped.crossedBottom).toBe(false);

        const crossed = advancePhase(0.9, 1300, PERIOD);
        expect(crossed.phase).toBeCloseTo(0.55);
        expect(crossed.crossedBottom).toBe(true);
    });

    it('a full-cycle delta from past the bottom crosses it once', () => {
        const step = advancePhase(0.6, PERIOD, PERIOD);
        expect(step.phase).toBeCloseTo(0.6);
        expect(step.crossedBottom).toBe(true);
    });
});

describe('jump-rope isSafeEnterPhase', () => {
    it('opens exactly at the bottom sweep', () => {
        expect(isSafeEnterPhase(BOTTOM_PHASE)).toBe(true);
        expect(isSafeEnterPhase(BOTTOM_PHASE - 0.001)).toBe(false);
    });

    it('closes after the enter window', () => {
        expect(isSafeEnterPhase(BOTTOM_PHASE + ENTER_WINDOW - 0.001)).toBe(true);
        expect(isSafeEnterPhase(BOTTOM_PHASE + ENTER_WINDOW)).toBe(false);
    });

    it('is unsafe while the rope descends in front', () => {
        expect(isSafeEnterPhase(0)).toBe(false);
        expect(isSafeEnterPhase(0.25)).toBe(false);
        expect(isSafeEnterPhase(0.49)).toBe(false);
    });
});

describe('jump-rope timeToBottomMs', () => {
    const PERIOD = 2000;

    it('counts down toward the sweep', () => {
        expect(timeToBottomMs(0.25, PERIOD)).toBeCloseTo(500);
        expect(timeToBottomMs(0.499, PERIOD)).toBeCloseTo(2);
    });

    it('is zero exactly at the bottom', () => {
        expect(timeToBottomMs(BOTTOM_PHASE, PERIOD)).toBe(0);
    });

    it('wraps: just past the bottom the next sweep is almost a full cycle away', () => {
        expect(timeToBottomMs(0.51, PERIOD)).toBeCloseTo(0.99 * PERIOD);
        expect(timeToBottomMs(0.9, PERIOD)).toBeCloseTo(0.6 * PERIOD);
    });
});

describe('jump-rope QTE windows', () => {
    it('isJumpWindow covers (0, JUMP_WINDOW_MS] before the sweep', () => {
        expect(isJumpWindow(0)).toBe(false);
        expect(isJumpWindow(1)).toBe(true);
        expect(isJumpWindow(JUMP_WINDOW_MS)).toBe(true);
        expect(isJumpWindow(JUMP_WINDOW_MS + 1)).toBe(false);
    });

    it('jumpGaugeFrac starts full at the window open and drains to the sweep', () => {
        expect(jumpGaugeFrac(JUMP_WINDOW_MS)).toBe(1);
        expect(jumpGaugeFrac(JUMP_WINDOW_MS / 2)).toBeCloseTo(0.5);
        expect(jumpGaugeFrac(0)).toBe(0);
        expect(jumpGaugeFrac(JUMP_WINDOW_MS + 1)).toBe(0);
    });

    it('enterGaugeFrac drains across the safe run-in window', () => {
        expect(enterGaugeFrac(BOTTOM_PHASE)).toBeCloseTo(1);
        expect(enterGaugeFrac(BOTTOM_PHASE + ENTER_WINDOW / 2)).toBeCloseTo(0.5);
        expect(enterGaugeFrac(BOTTOM_PHASE + ENTER_WINDOW)).toBe(0);
        expect(enterGaugeFrac(0.25)).toBe(0);
    });

    it('a press at the first cue frame still clears the sweep', () => {
        // The press window must sit inside the airtime, or the cue would lie.
        expect(JUMP_WINDOW_MS).toBeLessThan(AIR_MS);
    });
});
