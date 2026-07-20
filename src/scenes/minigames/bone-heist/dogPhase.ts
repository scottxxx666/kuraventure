/**
 * Bone Heist dog state, derived purely from the noise meter (家有惡狗 model):
 * calm while quiet, stirs as a warning when noise climbs, and wakes — biting —
 * the instant noise hits the max. No timers, no positional danger; recklessness
 * alone is the threat. Deterministic + pure so it is trivially testable.
 */

import { NOISE_MAX } from './noise';

export type DogPhase = 'sleep' | 'stir' | 'awake';

/** Noise at/above which the dog visibly stirs — the "slow down" warning band. */
export const STIR_NOISE = 65;

export function dogPhaseForNoise(noise: number): DogPhase {
    if (noise >= NOISE_MAX) return 'awake';
    if (noise >= STIR_NOISE) return 'stir';
    return 'sleep';
}
