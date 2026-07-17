/**
 * Movement constants + jump math for Jump Quest. The level validator
 * (./level.ts) enforces that every gap in the authored layout stays inside
 * MAX_RISE / MAX_GAP_X, which are derived from these numbers — retuning
 * gravity or the jump here automatically re-checks the level in tests.
 */

export const GRAVITY_Y = 2400; // px/s² — matches flappy's feel
export const JUMP_VELOCITY = -950; // px/s upward per A press (grounded only)
export const WALK_SPEED = 320; // px/s
export const MAX_FALL_SPEED = 1300; // ≈22 px/frame @60fps < platform height → no tunneling

/** Apex of a full jump: v²/2g ≈ 188px with the defaults. */
export function maxJumpHeight(v: number = -JUMP_VELOCITY, g: number = GRAVITY_Y): number {
    return (v * v) / (2 * g);
}

// Level-authoring budget: rises use ~80% of the apex, horizontal edge-to-edge
// gaps ~75% of the full-hop reach (2v/g · WALK_SPEED ≈ 253px), so every
// prescribed jump has a comfortable margin.
export const MAX_RISE = 150;
export const MAX_GAP_X = 190;
