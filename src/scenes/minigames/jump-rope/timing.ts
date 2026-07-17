/**
 * Rope timing for Jump Rope: a [0,1) phase loop (0 = rope at the top,
 * BOTTOM_PHASE = rope sweeping the feet), a per-jump accelerating period and
 * the run-in / airborne windows. Pure so the boundaries are unit-testable;
 * the scene only reacts to bottom crossings.
 */

/** Members jumping inside the rope (the two turners are scenery). */
export const JUMPER_COUNT = 4;
/** Consecutive successful jumps needed once everyone is in. */
export const TARGET_JUMPS = 10;

/** Rope period while members run in — constant and forgiving. */
export const ENTRY_PERIOD_MS = 2100;
/** Counting period ramps linearly from START (count 0) to END (last jump). */
export const START_PERIOD_MS = 1900;
export const END_PERIOD_MS = 1050;

/** A jump keeps a member airborne this long; being mid-air when the rope
    crosses the bottom clears it, being grounded there is a trip. */
export const AIR_MS = 480;

export const BOTTOM_PHASE = 0.5;
/** Safe run-in window: this fraction of a cycle right after a bottom
    crossing, while the rope is swinging up and away. */
export const ENTER_WINDOW = 0.38;

/** Rope period while the player is counting jumps; clamped so counts past
    the target (celebration frames) keep the final speed. */
export function periodForCount(count: number): number {
    const last = TARGET_JUMPS - 1;
    const t = Math.min(Math.max(count, 0), last) / last;
    return START_PERIOD_MS + (END_PERIOD_MS - START_PERIOD_MS) * t;
}

export interface PhaseStep {
    phase: number;
    crossedBottom: boolean;
}

/** Advances the phase by deltaMs and reports whether the rope passed the
    bottom during the step (once — deltas are frame-sized). */
export function advancePhase(phase: number, deltaMs: number, periodMs: number): PhaseStep {
    const next = phase + deltaMs / periodMs;
    const crossedBottom = phase < BOTTOM_PHASE ? next >= BOTTOM_PHASE : next >= BOTTOM_PHASE + 1;
    return { phase: next % 1, crossedBottom };
}

/** True while a member pressed in can safely dash under the rising rope. */
export function isSafeEnterPhase(phase: number): boolean {
    return phase >= BOTTOM_PHASE && phase < BOTTOM_PHASE + ENTER_WINDOW;
}

/** Ms until the rope next sweeps the feet (0 exactly at the bottom). */
export function timeToBottomMs(phase: number, periodMs: number): number {
    return ((BOTTOM_PHASE - phase + 1) % 1) * periodMs;
}
