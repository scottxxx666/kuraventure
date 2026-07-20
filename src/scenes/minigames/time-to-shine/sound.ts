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

    /**
     * A referee-style whistle blown once per beat — the constant tempo keeper
     * (Super Mario Party's Time to Shine: timing is the whistle + the
     * spotlight). Bright and loud so it carries over everything; a fast pitch
     * warble gives it the trilled "wheet" of a real whistle rather than a beep.
     * Muted by the caller while a music track plays.
     */
    whistle(): void {
        const ctx = this.ctx;
        if (!ctx || ctx.state !== 'running') {
            return;
        }
        const now = ctx.currentTime;
        const dur = 0.14;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2100, now);
        // Trill: an LFO warbles the pitch ±140 Hz ~18×/s — the whistle "roll".
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.setValueAtTime(18, now);
        lfoGain.gain.setValueAtTime(140, now);
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + dur);
        lfo.start(now);
        lfo.stop(now + dur);
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
