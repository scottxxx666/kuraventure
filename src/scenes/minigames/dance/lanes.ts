import type { Vec2 } from '../../../input/InputService';

/**
 * Lane model for Dance Beat — 4 direction lanes in DDR order ← ↓ ↑ →.
 * Pure TS — unit-tested in tests/danceJudgment.test.ts.
 */

export type Lane = 0 | 1 | 2 | 3;

export const LANES: readonly Lane[] = [0, 1, 2, 3];

/** Rotation of the arrow texture (drawn pointing up) per lane, radians. */
export const LANE_ROTATION: Readonly<Record<Lane, number>> = {
    0: -Math.PI / 2, // ←
    1: Math.PI, // ↓
    2: 0, // ↑
    3: Math.PI / 2 // →
};

/**
 * Quantizes an analog direction vector to a lane: null inside the deadzone,
 * else the dominant axis. Ties go horizontal — arbitrary but stable, so a
 * perfect keyboard diagonal never flickers between two lanes. The scene
 * edge-detects lane "presses" from this (InputService only has press events
 * for A/B), firing when the quantized lane changes.
 */
export function directionToLane(v: Vec2, deadzone = 0.5): Lane | null {
    if (Math.hypot(v.x, v.y) < deadzone) {
        return null;
    }
    if (Math.abs(v.x) >= Math.abs(v.y)) {
        return v.x < 0 ? 0 : 3;
    }
    return v.y < 0 ? 2 : 1;
}
