import type { Feedback } from './judgment';
import type { Lane } from './lanes';

/**
 * Time to Shine synthesized cues (feature A, DESIGN.md): every sound is an
 * oscillator blip — no audio assets. Each lane owns a pitch so the phrase
 * can be memorized by ear (Rhythm Tengoku style); a metronome carries the
 * beat while no music track plays, with a two-note count-in before each
 * response phase, and judgments get a confirmation blip. Constructed with
 * the sound manager's AudioContext when WebAudio is active; with null (the
 * HTML5Audio fallback) every call degrades to silence.
 */

/** ← ↓ ↑ → = C5 E5 G5 C6. */
const LANE_FREQ: Readonly<Record<Lane, number>> = { 0: 523.25, 1: 659.25, 2: 783.99, 3: 1046.5 };

export class ShineSynth {
    constructor(private readonly ctx: AudioContext | null) {}

    /** Call from the A-press user gesture so a suspended context can start. */
    resume(): void {
        if (this.ctx && this.ctx.state === 'suspended') {
            void this.ctx.resume();
        }
    }

    /** The pose's pitch — played for host demo poses and player presses alike. */
    laneTone(lane: Lane): void {
        this.blip(LANE_FREQ[lane], 0.14, 'square', 0.09);
    }

    /** Beat tick; slot starts are accented. Muted by the caller while music plays. */
    tick(accent: boolean): void {
        this.blip(accent ? 1500 : 1100, 0.03, 'sine', accent ? 0.1 : 0.06);
    }

    /** Two rising notes on the hand-over rest slot: "your turn" in audio. */
    countIn(step: 0 | 1): void {
        this.blip(step === 0 ? 880 : 1174.66, 0.09, 'triangle', 0.12);
    }

    /** Bright blip for scoring hits, dull thud for everything else. */
    feedback(result: Feedback | 'miss'): void {
        if (result === 'perfect') {
            this.blip(1568, 0.09, 'sine', 0.12);
        } else if (result === 'nice') {
            this.blip(1046.5, 0.09, 'sine', 0.1);
        } else {
            this.blip(220, 0.12, 'square', 0.08);
        }
    }

    private blip(freq: number, durationS: number, type: OscillatorType, peak: number): void {
        const ctx = this.ctx;
        if (!ctx || ctx.state !== 'running') {
            return;
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const now = ctx.currentTime;
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(peak, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + durationS);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + durationS);
    }
}
