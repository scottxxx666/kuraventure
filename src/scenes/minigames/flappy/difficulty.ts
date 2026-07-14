/**
 * Flappy Flight difficulty ramp: unlike Pizza Run's 4 tiers, this is a
 * continuous ramp over the survival timer's elapsed fraction (0..1) —
 * faster scroll, denser gates, smaller gaps, and the moving-obstacle
 * variants (oscillating gates, floaters, diagonal sweepers) phase in.
 * Pure TS — unit-tested in tests/flappyDifficulty.test.ts.
 */

export interface Difficulty {
    /** Leftward obstacle scroll speed, px/s. */
    scrollSpeed: number;
    gateIntervalMs: number;
    /** Vertical gap between a gate's top and bottom columns, px. */
    gapSize: number;
    /** Chance a spawned gate oscillates up/down (0 until movers phase in). */
    moverChance: number;
    floaterActive: boolean;
    floaterIntervalMs: number;
    /** Chance a spawned floater sine-bobs vertically. */
    bobChance: number;
    sweeperActive: boolean;
    sweeperIntervalMs: number;
}

const MOVERS_FROM = 0.25;
const FLOATERS_FROM = 0.2;
const SWEEPERS_FROM = 0.4;

function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

export function difficultyFor(elapsedFraction: number): Difficulty {
    const t = Math.min(Math.max(elapsedFraction, 0), 1);
    return {
        scrollSpeed: lerp(220, 400, t),
        gateIntervalMs: lerp(2600, 2000, t),
        gapSize: lerp(352, 256, t),
        moverChance: t < MOVERS_FROM ? 0 : lerp(0.25, 0.5, (t - MOVERS_FROM) / (1 - MOVERS_FROM)),
        floaterActive: t >= FLOATERS_FROM,
        floaterIntervalMs: lerp(3400, 2600, t),
        bobChance: lerp(0.2, 0.5, t),
        sweeperActive: t >= SWEEPERS_FROM,
        sweeperIntervalMs: lerp(4200, 3000, t)
    };
}
