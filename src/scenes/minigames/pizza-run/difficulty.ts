/**
 * Pizza Run difficulty ramp: the original game stepped difficulty by score
 * "stages"; here the progress-bar fraction (0..1) maps to 4 tiers.
 * Pure TS — unit-tested in tests/pizzaRunDifficulty.test.ts.
 */

export interface Difficulty {
    tier: number; // 0..3
    /** Falling speed range for spawned items, px/s. */
    fallSpeedMin: number;
    fallSpeedMax: number;
    /** Pizzas spawned per spawn tick. */
    pizzasPerTick: number;
    /** The boss enters (and starts deflecting pizzas) at the last tier. */
    bossActive: boolean;
}

const PIZZAS_PER_TICK = [1, 1, 2, 3] as const;

export function difficultyFor(barFraction: number): Difficulty {
    const clamped = Math.min(Math.max(barFraction, 0), 1);
    const tier = Math.min(3, Math.floor(clamped * 4));
    return {
        tier,
        fallSpeedMin: 40 + tier * 20,
        fallSpeedMax: 90 + tier * 25,
        pizzasPerTick: PIZZAS_PER_TICK[tier],
        bossActive: tier >= 3
    };
}
