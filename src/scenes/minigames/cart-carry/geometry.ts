/**
 * Cart Carry layout constants and the loose-grip cart constraint, shared by
 * the scene, the difficulty ramp and their tests (which assert every placed
 * pattern stays passable). Pure TS.
 */

import type { Vec2 } from '../../../input/InputService';

/** Level size: ~4 screens wide, one screen tall. */
export const LEVEL_W = 5120;
/** Bottom edge of the ceiling strip / top edge of the floor strip. */
export const CEILING_Y = 32;
export const FLOOR_Y = 688;
export const CORRIDOR_H = FLOOR_Y - CEILING_Y;
/** Clamp band for carrier centers. */
export const CARRIER_MIN_Y = 72;
export const CARRIER_MAX_Y = 648;
export const CARRIER_SIZE = 80;
/** Carrier walk speed, px/s — matches WorldScene's. */
export const CARRIER_SPEED = 320;

/** Loose grip: carrier distance is clamped to this range; rotation is free. */
export const MIN_DIST = 352;
export const MAX_DIST = 544;
/** The cart's unstretched span (cart.png is drawn stretched to fit). */
export const NATURAL_DIST = 448;

/** Carrier body half-size plus grace, used in passability invariants. */
export const OBSTACLE_MARGIN = 48;
/** Reach the goal line to win. */
export const GOAL_X = LEVEL_W - 192;
/** Obstacle zone: safe runway before, clear approach after. */
export const OBSTACLE_START_X = 880;
export const OBSTACLE_END_X = GOAL_X - 448;
/**
 * Solvability rule: each pattern's open channel stays within this many px
 * of the previous pattern's, so the cart never needs an impossible jump
 * between adjacent sections.
 */
export const MAX_CHANNEL_SHIFT = 192;
/** Horizontal offset between a slalom pair's two spikes. */
export const SLALOM_OFFSET_PX = 448;

export const BACK_START: Vec2 = { x: 256, y: 360 };
export const FRONT_START: Vec2 = { x: 704, y: 360 };

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
