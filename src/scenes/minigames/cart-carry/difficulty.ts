/**
 * Cart Carry difficulty ramp: like Flappy's, a continuous ramp over the
 * survival timer's elapsed fraction (0..1) — faster scroll, denser sections,
 * taller spikes; tilt pairs and piranha pipes phase in. On top sits HARDNESS,
 * the one knob to retune the whole game. Pure TS — unit-tested in
 * tests/cartCarryDifficulty.test.ts.
 *
 * Invariants (asserted by the tests, for any hardness):
 * - tiltSeparation + 20 <= MAX_SEPARATION (a tilt pair always leaves slack)
 * - spikeMaxH <= FLOOR_Y - CARRIER_MIN_Y - OBSTACLE_MARGIN (single spikes
 *   always leave room for both carriers on the open side)
 */

/**
 * THE tuning knob: 1 = designed difficulty; 0.7 keeps the whole run ~30%
 * gentler; 1.5 starts the run partway up the ramp. Any value stays inside
 * the easy/hard endpoints below, so it can never produce an impossible run.
 */
export const HARDNESS = 1;

export interface Difficulty {
    /** Leftward obstacle scroll speed, px/s. */
    scrollSpeed: number;
    /** Delay between spawned sections (one obstacle/pattern per section). */
    sectionIntervalMs: number;
    /** Height range of single floor/ceiling spikes, px. */
    spikeMinH: number;
    spikeMaxH: number;
    tiltActive: boolean;
    /** Chance a section is a tilt pair (0 until tilt phases in). */
    tiltChance: number;
    /** Vertical separation a tilt pair forces on the carriers, px. */
    tiltSeparation: number;
    piranhaActive: boolean;
    /** Chance a section is a piranha pipe (0 until piranhas phase in). */
    piranhaChance: number;
    /** Piranha cycle phase durations. */
    piranhaHiddenMs: number;
    piranhaWarnMs: number;
    piranhaExtendedMs: number;
}

const TILT_FROM = 0.2;
const PIRANHA_FROM = 0.35;

function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

function clamp01(value: number): number {
    return Math.min(Math.max(value, 0), 1);
}

export function difficultyFor(elapsedFraction: number, hardness = HARDNESS): Difficulty {
    const raw = clamp01(elapsedFraction);
    // Remap the fraction through the knob: <1 compresses the ramp from the
    // easy end, >1 skips ahead into it — never past the tuned endpoints.
    const t = clamp01(hardness <= 1 ? raw * hardness : 1 - (1 - raw) / hardness);
    return {
        scrollSpeed: lerp(55, 85, t),
        sectionIntervalMs: lerp(2400, 1600, t),
        spikeMinH: lerp(40, 64, t),
        spikeMaxH: lerp(72, 104, t),
        tiltActive: t >= TILT_FROM,
        tiltChance: t < TILT_FROM ? 0 : lerp(0.25, 0.4, (t - TILT_FROM) / (1 - TILT_FROM)),
        tiltSeparation: lerp(20, 36, t),
        piranhaActive: t >= PIRANHA_FROM,
        piranhaChance: t < PIRANHA_FROM ? 0 : lerp(0.25, 0.35, (t - PIRANHA_FROM) / (1 - PIRANHA_FROM)),
        piranhaHiddenMs: lerp(1200, 800, t),
        piranhaWarnMs: 400,
        piranhaExtendedMs: lerp(1000, 1200, t)
    };
}
