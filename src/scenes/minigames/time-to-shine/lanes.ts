import type { PadLane } from '../../../input/InputService';

/**
 * Lane model for Time to Shine — 4 direction lanes in DDR order ← ↓ ↑ →.
 * Identical to dance/lanes.ts by design (per-game helpers stay in their own
 * folder, PLAN.md §3.1); presses arrive via inputService.onLanePress.
 */

export type Lane = PadLane;

export const LANES: readonly Lane[] = [0, 1, 2, 3];

/** Rotation of the arrow texture (drawn pointing up) per lane, radians. */
export const LANE_ROTATION: Readonly<Record<Lane, number>> = {
    0: -Math.PI / 2, // ←
    1: Math.PI, // ↓
    2: 0, // ↑
    3: Math.PI / 2 // →
};
