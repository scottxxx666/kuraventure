/**
 * Bone Heist noise meter: dragging faster than the free speed makes noise,
 * stillness lets it decay. Hard-pulling a ball that a bone still covers pays
 * a loud multiplier — the push-your-luck trade. Pure TS.
 */

export const NOISE_MAX = 100;
/** Full bar drains in ~4 s of stillness. */
export const NOISE_DECAY_PER_SEC = 24;
/** Noise per px of drag beyond the free distance for the frame. */
export const NOISE_PER_PX = 0.1;
/** Movement at or below this speed is silent. */
export const FREE_SPEED_PX_PER_SEC = 120;
/** Gain multiplier while yanking a still-covered ball. */
export const COVERED_PULL_MULTIPLIER = 3;

export interface NoiseStepInput {
    /** Current level, 0..NOISE_MAX. */
    noise: number;
    /** Pointer-drag distance applied since the last step (0 when idle). */
    dragDistPx: number;
    deltaMs: number;
    /** The dragged item is a ball still overlapped by a bone. */
    coveredPull: boolean;
}

/** One frame of the meter: gain from movement above the free speed, then decay. */
export function stepNoise(input: NoiseStepInput): number {
    const dt = input.deltaMs / 1000;
    const freeDist = FREE_SPEED_PX_PER_SEC * dt;
    const gain =
        Math.max(0, input.dragDistPx - freeDist) *
        NOISE_PER_PX *
        (input.coveredPull ? COVERED_PULL_MULTIPLIER : 1);
    const next = input.noise + gain - NOISE_DECAY_PER_SEC * dt;
    return Math.min(NOISE_MAX, Math.max(0, next));
}
