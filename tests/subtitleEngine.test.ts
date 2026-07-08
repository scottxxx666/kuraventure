import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import { I18nService } from '../src/services/I18nService';
import type { Locale } from '../src/services/I18nService';
import { GameClock } from '../src/subtitles/GameClock';
import { SubtitleEngine } from '../src/subtitles/SubtitleEngine';
import type { ClockSource, SubtitleRenderer, SubtitleTrack } from '../src/subtitles/types';

class FakeClock implements ClockSource {
    now = 0;

    nowMs(): number {
        return this.now;
    }
}

class FakeRenderer implements SubtitleRenderer {
    calls: (string | null)[] = [];

    setText(text: string | null): void {
        this.calls.push(text);
    }

    get current(): string | null {
        return this.calls[this.calls.length - 1] ?? null;
    }
}

const EN_TRACK: SubtitleTrack = {
    cues: [
        { start: 1000, end: 2000, text: 'first', speaker: 'guide' },
        { start: 3000, end: 4000, text: 'second' }
    ]
};

const JA_TRACK: SubtitleTrack = {
    cues: [
        { start: 1000, end: 2000, text: 'ja-first' },
        { start: 3000, end: 4000, text: 'ja-second' }
    ]
};

function makeEngine(tracks: Record<string, SubtitleTrack> = { 'talk.en': EN_TRACK }) {
    const bus = new EventBus();
    const i18n = new I18nService(null, bus);
    const renderer = new FakeRenderer();
    const loader = vi.fn(async (trackId: string, locale: Locale): Promise<SubtitleTrack> => {
        const track = tracks[`${trackId}.${locale}`];
        if (!track) {
            throw new Error(`no track ${trackId}.${locale}`);
        }
        return track;
    });
    const engine = new SubtitleEngine(i18n, renderer, bus, loader);
    return { engine, bus, i18n, renderer, loader };
}

/** Lets play()'s internal track load settle. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Starts playback and reports resolution via the returned flag object. */
async function startPlaying(engine: SubtitleEngine, clock: ClockSource) {
    const state = { resolved: false };
    void engine.play('talk', clock).then(() => {
        state.resolved = true;
    });
    await flush();
    return state;
}

describe('GameClock', () => {
    it('starts at 0 and accumulates advance() deltas', () => {
        const clock = new GameClock();
        expect(clock.nowMs()).toBe(0);
        clock.advance(16);
        clock.advance(17);
        expect(clock.nowMs()).toBe(33);
    });
});

describe('SubtitleEngine cue selection', () => {
    it('shows nothing before the first cue', async () => {
        const { engine, renderer } = makeEngine();
        await startPlaying(engine, new FakeClock());
        engine.update();
        expect(renderer.calls).toEqual([]);
    });

    it('shows a cue exactly at its start (inclusive)', async () => {
        const { engine, renderer } = makeEngine();
        const clock = new FakeClock();
        await startPlaying(engine, clock);
        clock.now = 999;
        engine.update();
        expect(renderer.current).toBeNull();
        clock.now = 1000;
        engine.update();
        expect(renderer.current).toBe('first');
    });

    it('hides a cue exactly at its end (exclusive)', async () => {
        const { engine, renderer } = makeEngine();
        const clock = new FakeClock();
        await startPlaying(engine, clock);
        clock.now = 1999;
        engine.update();
        expect(renderer.current).toBe('first');
        clock.now = 2000;
        engine.update();
        expect(renderer.current).toBeNull();
    });

    it('getActiveCue exposes the on-screen cue (and its speaker) or null', async () => {
        const { engine } = makeEngine();
        const clock = new FakeClock();
        await startPlaying(engine, clock);
        expect(engine.getActiveCue()).toBeNull();
        clock.now = 1500;
        engine.update();
        expect(engine.getActiveCue()?.speaker).toBe('guide');
        clock.now = 3500;
        engine.update();
        expect(engine.getActiveCue()?.text).toBe('second');
        expect(engine.getActiveCue()?.speaker).toBeUndefined();
        clock.now = 4000;
        engine.update(); // playback finished
        expect(engine.getActiveCue()).toBeNull();
    });

    it('is hidden in the gap between cues, then shows the next cue', async () => {
        const { engine, renderer } = makeEngine();
        const clock = new FakeClock();
        await startPlaying(engine, clock);
        clock.now = 2500;
        engine.update();
        expect(renderer.current).toBeNull();
        clock.now = 3000;
        engine.update();
        expect(renderer.current).toBe('second');
    });

    it('only re-renders when the active cue changes', async () => {
        const { engine, renderer } = makeEngine();
        const clock = new FakeClock();
        await startPlaying(engine, clock);
        clock.now = 1200;
        engine.update();
        clock.now = 1400;
        engine.update();
        clock.now = 1600;
        engine.update();
        expect(renderer.calls).toEqual(['first']);
    });

    it('resolves and hides when the clock passes the last cue end', async () => {
        const { engine, renderer } = makeEngine();
        const clock = new FakeClock();
        const state = await startPlaying(engine, clock);
        clock.now = 3500;
        engine.update();
        expect(state.resolved).toBe(false);
        clock.now = 4000;
        engine.update();
        await flush();
        expect(state.resolved).toBe(true);
        expect(renderer.current).toBeNull();
    });

    it('resolves an empty track immediately', async () => {
        const { engine } = makeEngine({ 'talk.en': { cues: [] } });
        let resolved = false;
        void engine.play('talk', new FakeClock()).then(() => {
            resolved = true;
        });
        await flush();
        expect(resolved).toBe(true);
    });
});

describe('SubtitleEngine pause behavior', () => {
    it('a frozen clock keeps the cue on screen and never finishes', async () => {
        const { engine, renderer } = makeEngine();
        const clock = new FakeClock();
        const state = await startPlaying(engine, clock);
        clock.now = 1500;
        engine.update();
        // Scene paused: the clock stops advancing but update() may still run.
        engine.update();
        engine.update();
        await flush();
        expect(renderer.calls).toEqual(['first']);
        expect(state.resolved).toBe(false);
    });

    it('a paused GameClock (no advance calls) does not move', () => {
        const clock = new GameClock();
        clock.advance(500);
        expect(clock.nowMs()).toBe(500);
        expect(clock.nowMs()).toBe(500);
    });
});

describe('SubtitleEngine stop & supersede', () => {
    it('stop() hides the subtitle and resolves the play() promise', async () => {
        const { engine, renderer } = makeEngine();
        const clock = new FakeClock();
        const state = await startPlaying(engine, clock);
        clock.now = 1500;
        engine.update();
        engine.stop();
        await flush();
        expect(state.resolved).toBe(true);
        expect(renderer.current).toBeNull();
    });

    it('stop() before the track finishes loading cancels that playback', async () => {
        const { engine, renderer } = makeEngine();
        let resolved = false;
        void engine.play('talk', new FakeClock()).then(() => {
            resolved = true;
        });
        engine.stop();
        await flush();
        expect(resolved).toBe(true);
        const clock = new FakeClock();
        clock.now = 1500;
        engine.update();
        expect(renderer.calls).toEqual([]);
    });

    it('a second play() supersedes one still loading', async () => {
        const { engine, renderer, loader } = makeEngine();
        let firstResolved = false;
        void engine.play('talk', new FakeClock()).then(() => {
            firstResolved = true;
        });
        const clock = new FakeClock();
        void engine.play('talk', clock);
        await flush();
        expect(firstResolved).toBe(true);
        clock.now = 1500;
        engine.update();
        expect(renderer.current).toBe('first');
        expect(loader).toHaveBeenCalledTimes(1); // second load hit the cache
    });
});

describe('SubtitleEngine locale reload', () => {
    it('reloads the playing track in the new locale and re-syncs at the same time', async () => {
        const { engine, i18n, renderer } = makeEngine({ 'talk.en': EN_TRACK, 'talk.ja': JA_TRACK });
        const clock = new FakeClock();
        await startPlaying(engine, clock);
        clock.now = 1500;
        engine.update();
        expect(renderer.current).toBe('first');
        i18n.setLocale('ja');
        await flush();
        expect(renderer.current).toBe('ja-first');
    });

    it('hides text when the new locale has no cue at the current time', async () => {
        const { engine, i18n, renderer } = makeEngine({
            'talk.en': EN_TRACK,
            'talk.ja': { cues: [{ start: 5000, end: 6000, text: 'ja-late' }] }
        });
        const clock = new FakeClock();
        await startPlaying(engine, clock);
        clock.now = 1500;
        engine.update();
        i18n.setLocale('ja');
        await flush();
        expect(renderer.current).toBeNull();
    });

    it('keeps the current cues when the new locale track fails to load', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { engine, i18n, renderer } = makeEngine({ 'talk.en': EN_TRACK });
        const clock = new FakeClock();
        await startPlaying(engine, clock);
        clock.now = 1500;
        engine.update();
        i18n.setLocale('ja');
        await flush();
        expect(renderer.current).toBe('first');
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('a locale change while idle loads nothing', async () => {
        const { i18n, loader } = makeEngine();
        i18n.setLocale('ja');
        await flush();
        expect(loader).not.toHaveBeenCalled();
    });
});

describe('SubtitleEngine track cache', () => {
    it('fetches each track+locale once per session', async () => {
        const { engine, loader } = makeEngine();
        await engine.loadTrack('talk', 'en');
        await engine.loadTrack('talk', 'en');
        expect(loader).toHaveBeenCalledTimes(1);
    });

    it('caches per locale, not per track only', async () => {
        const { engine, loader } = makeEngine({ 'talk.en': EN_TRACK, 'talk.ja': JA_TRACK });
        await engine.loadTrack('talk', 'en');
        await engine.loadTrack('talk', 'ja');
        expect(loader).toHaveBeenCalledTimes(2);
    });
});
