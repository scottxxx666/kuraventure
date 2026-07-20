/**
 * Bone Heist dog wake cycle: sleep → stir (telegraph) → awake → sleep, forever.
 * Noise speeds up the sleep clock only — the stir telegraph and the awake
 * window always run in real time, so the warning stays trustworthy.
 * Deterministic (no RNG) so it is trivially testable. Pure TS.
 */

import { NOISE_MAX } from './noise';

/** THE tuning knob: >1 = shorter sleeps and longer awake spells. */
export const HARDNESS = 1;

const BASE_SLEEP_MS = 6000;
const STIR_MS = 1200;
const BASE_AWAKE_MS = 2400;
const AWAKE_CAP_MS = 4000;
/** Extra sleep-clock speed at full noise: sleeps pass (1 + this)× faster. */
const NOISE_ACCEL = 3;

export type DogPhase = 'sleep' | 'stir' | 'awake';

export interface DogState {
    phase: DogPhase;
    /** Phase time left, in the phase's own clock (real ms except noisy sleep). */
    remainingMs: number;
}

export interface CycleTimings {
    sleepMs: number;
    stirMs: number;
    awakeMs: number;
    noiseAccel: number;
}

export function cycleTimings(hardness = HARDNESS): CycleTimings {
    return {
        sleepMs: BASE_SLEEP_MS / hardness,
        stirMs: STIR_MS,
        awakeMs: Math.min(BASE_AWAKE_MS * hardness, AWAKE_CAP_MS),
        noiseAccel: NOISE_ACCEL
    };
}

export function initialDogState(timings: CycleTimings): DogState {
    return { phase: 'sleep', remainingMs: timings.sleepMs };
}

const NEXT_PHASE: Record<DogPhase, DogPhase> = { sleep: 'stir', stir: 'awake', awake: 'sleep' };

function phaseLengthMs(phase: DogPhase, timings: CycleTimings): number {
    return phase === 'sleep' ? timings.sleepMs : phase === 'stir' ? timings.stirMs : timings.awakeMs;
}

/**
 * Advances the cycle by deltaMs of real time. During 'sleep' the clock runs
 * at (1 + noiseAccel · noise / NOISE_MAX)×; leftover delta carries across a
 * phase boundary, so one big step can land mid-stir but never skip it.
 */
export function stepDog(
    state: DogState,
    deltaMs: number,
    noise: number,
    timings: CycleTimings
): DogState {
    let phase = state.phase;
    let remainingMs = state.remainingMs;
    let realMsLeft = deltaMs;
    while (realMsLeft > 0) {
        const clockSpeed = phase === 'sleep' ? 1 + (timings.noiseAccel * noise) / NOISE_MAX : 1;
        const phaseMsAdvanced = realMsLeft * clockSpeed;
        if (phaseMsAdvanced < remainingMs) {
            remainingMs -= phaseMsAdvanced;
            break;
        }
        realMsLeft -= remainingMs / clockSpeed;
        phase = NEXT_PHASE[phase];
        remainingMs = phaseLengthMs(phase, timings);
    }
    return { phase, remainingMs };
}
