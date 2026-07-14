/**
 * Cart Carry difficulty ramp over the level's obstacle-zone fraction (0..1):
 * denser sections, taller spikes, narrower gates; slaloms, gates and piranha
 * pipes phase in. On top sits HARDNESS, the one knob to retune the whole
 * game. Pure TS — unit-tested in tests/cartCarryDifficulty.test.ts.
 *
 * Invariants (asserted by the tests, for any hardness):
 * - gateGapSize >= CARRIER_SIZE + 2*OBSTACLE_MARGIN (gates always passable)
 * - spikeMaxH <= CORRIDOR_H - CARRIER_SIZE - 2*OBSTACLE_MARGIN (single
 *   spikes always leave an open channel)
 * - chance sum < 1 (single spikes always possible)
 */

/**
 * THE tuning knob: 1 = designed difficulty; 0.7 keeps the whole level ~30%
 * gentler; 1.5 starts the level partway up the ramp. Any value stays inside
 * the easy/hard endpoints below, so it can never produce an impossible run.
 */
export const HARDNESS = 1;

export interface Difficulty {
    /** Horizontal gap after a pattern's width before the next section. */
    sectionGapPx: number;
    /** Height range of single floor/ceiling spikes, px. */
    spikeMinH: number;
    spikeMaxH: number;
    slalomActive: boolean;
    /** Chance a section is a slalom pair (0 until it phases in). */
    slalomChance: number;
    gateActive: boolean;
    /** Chance a section is a pinch gate (0 until it phases in). */
    gateChance: number;
    /** Open gap a pinch gate leaves between its two spikes, px. */
    gateGapSize: number;
    piranhaActive: boolean;
    /** Chance a section is a piranha pipe (0 until it phases in). */
    piranhaChance: number;
    /** Piranha cycle phase durations. */
    piranhaHiddenMs: number;
    piranhaWarnMs: number;
    piranhaExtendedMs: number;
}

const SLALOM_FROM = 0.15;
const GATE_FROM = 0.25;
const PIRANHA_FROM = 0.35;

function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

function clamp01(value: number): number {
    return Math.min(Math.max(value, 0), 1);
}

export function difficultyFor(zoneFraction: number, hardness = HARDNESS): Difficulty {
    const raw = clamp01(zoneFraction);
    // Remap the fraction through the knob: <1 compresses the ramp from the
    // easy end, >1 skips ahead into it — never past the tuned endpoints.
    const t = clamp01(hardness <= 1 ? raw * hardness : 1 - (1 - raw) / hardness);
    return {
        sectionGapPx: lerp(480, 288, t),
        spikeMinH: lerp(160, 256, t),
        spikeMaxH: lerp(288, 416, t),
        slalomActive: t >= SLALOM_FROM,
        slalomChance: t < SLALOM_FROM ? 0 : lerp(0.25, 0.3, (t - SLALOM_FROM) / (1 - SLALOM_FROM)),
        gateActive: t >= GATE_FROM,
        gateChance: t < GATE_FROM ? 0 : lerp(0.2, 0.25, (t - GATE_FROM) / (1 - GATE_FROM)),
        gateGapSize: lerp(336, 240, t),
        piranhaActive: t >= PIRANHA_FROM,
        piranhaChance: t < PIRANHA_FROM ? 0 : lerp(0.25, 0.3, (t - PIRANHA_FROM) / (1 - PIRANHA_FROM)),
        piranhaHiddenMs: lerp(1200, 800, t),
        piranhaWarnMs: 400,
        piranhaExtendedMs: lerp(1000, 1200, t)
    };
}
