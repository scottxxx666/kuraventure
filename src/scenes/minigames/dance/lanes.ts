import type { PadLane } from '../../../input/InputService';

/**
 * Lane model for Dance Beat — 4 direction lanes in DDR order ← ↓ ↑ →.
 * The index type is InputService's PadLane (lane mode, PLAN.md §3.10);
 * presses arrive via inputService.onLanePress, so there is no direction
 * quantization here anymore.
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
