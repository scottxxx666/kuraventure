/**
 * Cart Carry layout constants and the loose-grip cart constraint, shared by
 * the scene, the difficulty ramp and their tests (which assert every placed
 * pattern stays passable). Pure TS.
 */

import type { Vec2 } from '../../../input/InputService';

/** Level size: ~4 screens wide, one screen tall. */
export const LEVEL_W = 1280;
/** Bottom edge of the ceiling strip / top edge of the floor strip. */
export const CEILING_Y = 8;
export const FLOOR_Y = 172;
export const CORRIDOR_H = FLOOR_Y - CEILING_Y;
/** Clamp band for carrier centers. */
export const CARRIER_MIN_Y = 18;
export const CARRIER_MAX_Y = 162;
export const CARRIER_SIZE = 20;
/** Carrier walk speed, px/s — matches WorldScene's. */
export const CARRIER_SPEED = 80;

/** Loose grip: carrier distance is clamped to this range; rotation is free. */
export const MIN_DIST = 88;
export const MAX_DIST = 136;
/** cart.png native width — the unstretched span. */
export const NATURAL_DIST = 112;

/** Carrier body half-size plus grace, used in passability invariants. */
export const OBSTACLE_MARGIN = 12;
/** Reach the goal line to win. */
export const GOAL_X = LEVEL_W - 48;
/** Obstacle zone: safe runway before, clear approach after. */
export const OBSTACLE_START_X = 220;
export const OBSTACLE_END_X = GOAL_X - 112;
/**
 * Solvability rule: each pattern's open channel stays within this many px
 * of the previous pattern's, so the cart never needs an impossible jump
 * between adjacent sections.
 */
export const MAX_CHANNEL_SHIFT = 48;
/** Horizontal offset between a slalom pair's two spikes. */
export const SLALOM_OFFSET_PX = 112;

export const BACK_START: Vec2 = { x: 64, y: 90 };
export const FRONT_START: Vec2 = { x: 176, y: 90 };

/**
 * Loose-grip projection: if |a−b| is outside [minD, maxD], pull/push both
 * points symmetrically along the segment axis onto the nearest bound
 * (midpoint preserved). Coincident points separate horizontally to minD.
 * Never mutates its inputs.
 */
export function constrainSpan(a: Vec2, b: Vec2, minD: number, maxD: number): [Vec2, Vec2] {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d === 0) {
        return [
            { x: a.x - minD / 2, y: a.y },
            { x: b.x + minD / 2, y: b.y }
        ];
    }
    const target = d > maxD ? maxD : d < minD ? minD : d;
    if (target === d) {
        return [{ ...a }, { ...b }];
    }
    const shift = (d - target) / 2 / d; // positive pulls together, negative pushes apart
    return [
        { x: a.x + dx * shift, y: a.y + dy * shift },
        { x: b.x - dx * shift, y: b.y - dy * shift }
    ];
}
