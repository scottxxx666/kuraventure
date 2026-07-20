/**
 * Feature toggles for Time to Shine (see DESIGN.md). Each switch is
 * independent so the base call-and-response game can be tuned or debugged
 * with any enhancement off. The scene reads this object; generateChart
 * receives the chart-shaping flags as parameters so tests cover both states.
 */
export const SHINE_FEATURES = {
    /** Synthesized audio cues: lane pitches, metronome + count-in, judgment blips. */
    laneTones: true,
    /** Later rounds draw slots from rhythm cells (single/double/rest). */
    rhythmPatterns: true,
    /** Rounds 1–2 use only ←/→ before opening up all four directions. */
    laneRamp: true
} as const;
