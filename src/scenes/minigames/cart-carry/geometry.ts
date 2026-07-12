/**
 * Cart Carry layout constants, shared by the scene, the difficulty ramp and
 * its tests (which assert every spawned section stays passable). Pure TS.
 */

/** Fixed x of the back carrier (stick-controlled). */
export const BACK_X = 64;
/** Fixed x of the front carrier (A/B-controlled). */
export const FRONT_X = 176;
/** Horizontal cart span between the carriers. */
export const CART_SPAN = FRONT_X - BACK_X;
/** Rigid-cart cap on the carriers' vertical separation, px (max tilt ~27°). */
export const MAX_SEPARATION = 56;
/** Vertical speed of both carriers, px/s. */
export const CARRIER_SPEED = 90;

/** Bottom edge of the ceiling strip. */
export const CEILING_Y = 8;
/** Top edge of the floor strip. */
export const FLOOR_Y = 172;
/** Clamp band for carrier centers. */
export const CARRIER_MIN_Y = 18;
export const CARRIER_MAX_Y = 162;

/** Carrier body half-size plus grace, used in the tilt-gap spike math. */
export const OBSTACLE_MARGIN = 12;
/**
 * Spike-height sum at which a tilt pair leaves zero clearance for a LEVEL
 * cart; a pair's heights sum to `tiltSeparation + TILT_BASE`, forcing that
 * much tilt.
 */
export const TILT_BASE = FLOOR_Y - CEILING_Y - 2 * OBSTACLE_MARGIN;
