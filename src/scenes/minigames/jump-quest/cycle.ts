/**
 * Disappearing-platform timing for Jump Quest: a shared solid → warn → gone
 * loop, staggered per platform with an offset. Pure so the boundaries are
 * unit-testable; the scene only reacts to phase *changes*.
 */

export const SOLID_MS = 2600;
export const WARN_MS = 900; // blink warning before vanishing
export const GONE_MS = 1700;
export const CYCLE_MS = SOLID_MS + WARN_MS + GONE_MS;

export type PlatformPhase = 'solid' | 'warn' | 'gone';

export function platformPhaseAt(elapsedMs: number, offsetMs: number): PlatformPhase {
    const t = (((elapsedMs + offsetMs) % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
    if (t < SOLID_MS) {
        return 'solid';
    }
    return t < SOLID_MS + WARN_MS ? 'warn' : 'gone';
}
