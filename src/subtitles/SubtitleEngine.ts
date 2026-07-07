import { EventBus, eventBus } from '../core/EventBus';
import { I18nService, i18nService } from '../services/I18nService';
import type { Locale } from '../services/I18nService';
import { SubtitleOverlay } from './SubtitleOverlay';
import type { ClockSource, SubtitleCue, SubtitleRenderer, SubtitleTrack } from './types';

/** Fetches public/assets/subtitles/<trackId>.<locale>.json (path per PLAN.md §3.5). */
async function fetchTrack(trackId: string, locale: Locale): Promise<SubtitleTrack> {
    const url = `assets/subtitles/${trackId}.${locale}.json`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Subtitle track ${url} failed to load (${res.status})`);
    }
    return (await res.json()) as SubtitleTrack;
}

function trackEndMs(cues: SubtitleCue[]): number {
    return cues.reduce((end, cue) => Math.max(end, cue.end), 0);
}

interface Playback {
    trackId: string;
    clock: ClockSource;
    cues: SubtitleCue[];
    /** Clock time after the last cue — playback finishes when reached. */
    endMs: number;
    activeCue: SubtitleCue | null;
    resolve: () => void;
}

/**
 * Cue scheduling against a ClockSource (PLAN.md §3.5), shared by in-game
 * dialogue and (milestone 7) video. The host calls update() every Phaser
 * update tick — no setInterval — so a paused host freezes subtitles with it.
 * On locale:changed the playing track reloads in the new locale and re-syncs
 * against the same clock. Pure TS apart from the default renderer/loader —
 * tests inject fakes for both.
 */
export class SubtitleEngine {
    /** Promises, not tracks, so concurrent loads of the same file dedupe. */
    private readonly cache = new Map<string, Promise<SubtitleTrack>>();
    private playback: Playback | null = null;
    /** Invalidates a play() whose track was still loading when stop()/play() intervened. */
    private generation = 0;

    constructor(
        private readonly i18n: I18nService = i18nService,
        private readonly renderer: SubtitleRenderer = new SubtitleOverlay(),
        bus: EventBus = eventBus,
        private readonly loadTrackFile: (
            trackId: string,
            locale: Locale
        ) => Promise<SubtitleTrack> = fetchTrack
    ) {
        bus.on('locale:changed', ({ locale }) => void this.onLocaleChanged(locale));
    }

    /** Fetches one track file, cached per session; failures are not cached. */
    loadTrack(trackId: string, locale: Locale): Promise<SubtitleTrack> {
        const key = `${trackId}.${locale}`;
        let track = this.cache.get(key);
        if (!track) {
            track = this.loadTrackFile(trackId, locale).catch((err: unknown) => {
                this.cache.delete(key);
                throw err;
            });
            this.cache.set(key, track);
        }
        return track;
    }

    /**
     * Loads the track in the active locale and plays it against the clock.
     * Resolves when the clock passes the last cue's end, or on stop().
     * At most one playback runs at a time; starting a new one ends the previous.
     */
    async play(trackId: string, clock: ClockSource): Promise<void> {
        this.stop();
        const generation = ++this.generation;
        const track = await this.loadTrack(trackId, this.i18n.getLocale());
        if (generation !== this.generation) {
            return; // superseded by another play()/stop() while the track loaded
        }
        return new Promise((resolve) => {
            this.playback = {
                trackId,
                clock,
                cues: track.cues,
                endMs: trackEndMs(track.cues),
                activeCue: null,
                resolve
            };
            this.update(); // render immediately (an empty track finishes here)
        });
    }

    /** Polls the clock; the hosting scene calls this every update tick. */
    update(): void {
        const playback = this.playback;
        if (!playback) {
            return;
        }
        const now = playback.clock.nowMs();
        if (now >= playback.endMs) {
            this.stop();
            return;
        }
        const cue = playback.cues.find((c) => now >= c.start && now < c.end) ?? null;
        if (cue !== playback.activeCue) {
            playback.activeCue = cue;
            this.renderer.setText(cue?.text ?? null);
        }
    }

    /** Hides the subtitle and resolves the pending play() promise, if any. */
    stop(): void {
        this.generation++;
        const playback = this.playback;
        if (!playback) {
            return;
        }
        this.playback = null;
        this.renderer.setText(null);
        playback.resolve();
    }

    /** Reloads the playing track in the new locale and re-syncs (PLAN.md §3.5). */
    private async onLocaleChanged(locale: Locale): Promise<void> {
        const playback = this.playback;
        if (!playback) {
            return;
        }
        try {
            const track = await this.loadTrack(playback.trackId, locale);
            if (this.playback !== playback) {
                return; // playback ended/replaced while the track loaded
            }
            playback.cues = track.cues;
            playback.endMs = trackEndMs(track.cues);
            // Hide then re-run: the new track may have no cue at the current
            // time, and cue identity changed so the same slot must re-render.
            playback.activeCue = null;
            this.renderer.setText(null);
            this.update();
        } catch (err) {
            // Keep showing the previous locale rather than dropping subtitles.
            console.warn(`Subtitle track "${playback.trackId}" missing for locale ${locale}`, err);
        }
    }
}

export const subtitleEngine = new SubtitleEngine();
