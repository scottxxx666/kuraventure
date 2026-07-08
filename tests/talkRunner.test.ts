import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import { TalkRunner } from '../src/dialogue/TalkRunner';
import { I18nService } from '../src/services/I18nService';
import { ProgressService } from '../src/services/ProgressService';

/** Plain line, no speaker/choices: exercises trimming + id/speaker tag parsing. */
const BASIC_SRC = `
Hello there. # id:g.hello # speaker:guide
Second line. # id:g.second
-> DONE
`;

/** A choice with a tagged response that grants an item and completes — also the
    vehicle for the empty-line-skip test (real ink emits a genuine "" Continue()
    step after a choice's side-effect-only lines, right before the run ends). */
const GIFT_SRC = `
EXTERNAL hasItem(itemId)
EXTERNAL hasFlag(flagId)
EXTERNAL grantItem(itemId)
EXTERNAL complete()

Would you like a gift? # id:g.ask # speaker:guide
*   [Yes please # id:c.yes]
    Great choice! # id:g.yes
    ~ grantItem("demo-key")
    ~ complete()
    -> DONE
*   [No thanks # id:c.no]
    Maybe next time. # id:g.no
    -> DONE
`;

const HAS_ITEM_SRC = `
EXTERNAL hasItem(itemId)
EXTERNAL hasFlag(flagId)
EXTERNAL grantItem(itemId)
EXTERNAL complete()

{ hasItem("demo-key"):
    You already have the key. # id:g.haskey
- else:
    You need to find a key. # id:g.nokey
}
-> DONE
`;

const HAS_FLAG_SRC = `
EXTERNAL hasItem(itemId)
EXTERNAL hasFlag(flagId)
EXTERNAL grantItem(itemId)
EXTERNAL complete()

{ hasFlag("demo/npc-join"):
    Welcome back! # id:g.back
- else:
    Nice to meet you. # id:g.new
}
-> DONE
`;

/** Declares an EXTERNAL the runner never binds. inkjs's glue lookahead touches
    every reachable external while resolving the very first line, so this
    throws out of start()'s initial pull rather than a later advance(). */
const RUNTIME_ERROR_SRC = `
EXTERNAL notBound()
Hello # id:g.hi
~ notBound()
-> DONE
`;

const MALFORMED_SRC = '* [unterminated choice\n';

/** Lets an async onLocaleChanged()/start() chain settle. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function makeRunner(
    sources: Record<string, string> = {},
    tables: Record<string, Record<string, string>> = {},
    deps: { progress?: ProgressService; i18n?: I18nService; bus?: EventBus } = {}
) {
    const bus = deps.bus ?? new EventBus();
    const i18n = deps.i18n ?? new I18nService(null, bus);
    const progress = deps.progress ?? new ProgressService(null);
    const fetchText = vi.fn(async (url: string): Promise<string> => {
        const m = /^assets\/dialogue\/(.+)\.ink$/.exec(url);
        const graphId = m?.[1];
        const src = graphId ? sources[graphId] : undefined;
        if (src === undefined) {
            throw new Error(`no fixture source for ${url}`);
        }
        return src;
    });
    const fetchJson = vi.fn(async (url: string): Promise<Record<string, string>> => {
        const m = /^assets\/dialogue\/(.+)\.json$/.exec(url);
        const key = m?.[1];
        const table = key ? tables[key] : undefined;
        if (!table) {
            throw new Error(`no fixture table for ${url}`);
        }
        return table;
    });
    const runner = new TalkRunner(progress, i18n, bus, fetchText, fetchJson);
    return { runner, bus, i18n, progress, fetchText, fetchJson };
}

describe('TalkRunner line iteration', () => {
    it('exposes the first line after start(), trims trailing newlines, and parses id/speaker tags', async () => {
        const { runner } = makeRunner({ demo: BASIC_SRC });
        await runner.start('demo');
        expect(runner.currentLine()).toEqual({ text: 'Hello there.', id: 'g.hello', speaker: 'guide' });
        expect(runner.currentChoices()).toEqual([]);
        expect(runner.isFinished()).toBe(false);
    });

    it('advance() moves to the next line and a line with no speaker tag omits it', async () => {
        const { runner } = makeRunner({ demo: BASIC_SRC });
        await runner.start('demo');
        runner.advance();
        expect(runner.currentLine()).toEqual({ text: 'Second line.', id: 'g.second', speaker: undefined });
        expect(runner.isFinished()).toBe(false);
    });

    it('finishes (no line, no choices) once the story runs out', async () => {
        const { runner } = makeRunner({ demo: BASIC_SRC });
        await runner.start('demo');
        runner.advance();
        runner.advance();
        expect(runner.isFinished()).toBe(true);
        expect(runner.currentLine()).toBeNull();
        expect(runner.currentChoices()).toEqual([]);
    });

    it('advance() is a no-op once finished', async () => {
        const { runner } = makeRunner({ demo: BASIC_SRC });
        await runner.start('demo');
        runner.advance();
        runner.advance();
        expect(() => runner.advance()).not.toThrow();
        expect(runner.isFinished()).toBe(true);
    });
});

describe('TalkRunner choice flow', () => {
    it('presents tagged choices once the line before them is read, and choose() picks one', async () => {
        const { runner } = makeRunner({ gift: GIFT_SRC });
        await runner.start('gift');
        expect(runner.currentLine()?.text).toBe('Would you like a gift?');
        expect(runner.currentChoices()).toEqual([]);

        runner.advance();
        expect(runner.currentLine()).toBeNull();
        expect(runner.currentChoices()).toEqual([
            { text: 'Yes please', id: 'c.yes' },
            { text: 'No thanks', id: 'c.no' }
        ]);

        runner.choose(0);
        expect(runner.currentLine()?.text).toBe('Great choice!');
        expect(runner.currentChoices()).toEqual([]);
    });

    it('grantItem/complete fire as external side effects, but only once the story continues past the response line', async () => {
        const { runner, progress } = makeRunner({ gift: GIFT_SRC });
        await runner.start('gift');
        runner.advance();
        runner.choose(0);
        // The response line is current; ink hasn't executed the ~ lines after it yet.
        expect(progress.hasItem('demo-key')).toBe(false);
        expect(runner.wasCompleted()).toBe(false);
        expect(runner.isFinished()).toBe(false);

        // This advance() internally skips the genuine empty Continue() step ink emits
        // right before -> DONE, executing the ~ grantItem/~ complete lines along the way.
        runner.advance();
        expect(progress.hasItem('demo-key')).toBe(true);
        expect(runner.wasCompleted()).toBe(true);
        expect(runner.isFinished()).toBe(true);
        expect(runner.currentLine()).toBeNull();
    });

    it('choosing the other branch never completes the run', async () => {
        const { runner, progress } = makeRunner({ gift: GIFT_SRC });
        await runner.start('gift');
        runner.advance();
        runner.choose(1);
        expect(runner.currentLine()?.text).toBe('Maybe next time.');
        runner.advance();
        expect(runner.isFinished()).toBe(true);
        expect(runner.wasCompleted()).toBe(false);
        expect(progress.hasItem('demo-key')).toBe(false);
    });

    it('choose() is a no-op when no choices are pending', async () => {
        const { runner } = makeRunner({ demo: BASIC_SRC });
        await runner.start('demo');
        expect(() => runner.choose(0)).not.toThrow();
        expect(runner.currentLine()?.text).toBe('Hello there.'); // unaffected
    });
});

describe('TalkRunner external functions', () => {
    it('hasItem() reflects ProgressService state', async () => {
        const withKey = makeRunner({ check: HAS_ITEM_SRC });
        withKey.progress.grantItem('demo-key');
        await withKey.runner.start('check');
        expect(withKey.runner.currentLine()?.text).toBe('You already have the key.');

        const withoutKey = makeRunner({ check: HAS_ITEM_SRC });
        await withoutKey.runner.start('check');
        expect(withoutKey.runner.currentLine()?.text).toBe('You need to find a key.');
    });

    it('hasFlag() reflects ProgressService.isCompleted for the full stageId/triggerId flag', async () => {
        const returning = makeRunner({ check: HAS_FLAG_SRC });
        returning.progress.markCompleted('demo/npc-join');
        await returning.runner.start('check');
        expect(returning.runner.currentLine()?.text).toBe('Welcome back!');

        const first = makeRunner({ check: HAS_FLAG_SRC });
        await first.runner.start('check');
        expect(first.runner.currentLine()?.text).toBe('Nice to meet you.');
    });
});

describe('TalkRunner localization', () => {
    it('resolves an id via the active locale table, falling back to English for ids the table lacks', async () => {
        const { runner, i18n } = makeRunner(
            { demo: BASIC_SRC },
            { 'demo.ja': { 'g.hello': 'こんにちは' } } // g.second intentionally absent
        );
        i18n.setLocale('ja');
        await runner.start('demo');
        expect(runner.currentLine()?.text).toBe('こんにちは');
        runner.advance();
        expect(runner.currentLine()?.text).toBe('Second line.');
    });

    it('warns once and falls back to English when the string table is missing, caching the fallback', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { runner, fetchJson, i18n } = makeRunner({ demo: BASIC_SRC }, {});
        i18n.setLocale('ja');

        await runner.start('demo');
        expect(runner.currentLine()?.text).toBe('Hello there.');
        expect(warn).toHaveBeenCalledTimes(1);

        await runner.start('demo'); // same graphId+locale — cached fallback, no re-fetch/re-warn
        expect(warn).toHaveBeenCalledTimes(1);
        expect(fetchJson).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('re-resolves the current line/choices and notifies onRelocalized after a mid-conversation locale change', async () => {
        const { runner, i18n } = makeRunner({ demo: BASIC_SRC }, { 'demo.ja': { 'g.hello': 'こんにちは' } });
        await runner.start('demo');
        expect(runner.currentLine()?.text).toBe('Hello there.');

        const onRelocalized = vi.fn();
        runner.onRelocalized(onRelocalized);
        i18n.setLocale('ja');
        await flush();

        expect(onRelocalized).toHaveBeenCalledTimes(1);
        expect(runner.currentLine()?.text).toBe('こんにちは');
    });

    it('a locale change while idle (no active run) loads nothing', async () => {
        const { runner, fetchJson, i18n } = makeRunner();
        i18n.setLocale('ja');
        await flush();
        expect(fetchJson).not.toHaveBeenCalled();
    });
});

describe('TalkRunner graph cache', () => {
    it('compiles each graphId once per session, reusing the cache across runs', async () => {
        const { runner, fetchText } = makeRunner({ demo: BASIC_SRC });
        await runner.start('demo');
        runner.advance();
        runner.advance();
        expect(runner.isFinished()).toBe(true);

        await runner.start('demo'); // second conversation with the same graph
        expect(runner.currentLine()?.text).toBe('Hello there.');
        expect(fetchText).toHaveBeenCalledTimes(1);
    });

    it('a second start() supersedes one still loading, and dedupes the graph fetch', async () => {
        const { runner, fetchText } = makeRunner({ demo: BASIC_SRC });
        const first = runner.start('demo');
        const second = runner.start('demo');
        await Promise.all([first, second]);
        expect(fetchText).toHaveBeenCalledTimes(1);
        expect(runner.currentLine()?.text).toBe('Hello there.');
    });
});

describe('TalkRunner error handling', () => {
    it('start() rejects when the graph fails to compile, leaving the runner in a finished/incomplete state', async () => {
        const { runner } = makeRunner({ broken: MALFORMED_SRC });
        await expect(runner.start('broken')).rejects.toThrow();
        expect(runner.isFinished()).toBe(true);
        expect(runner.wasCompleted()).toBe(false);
    });

    it('start() rejects on a runtime Continue() failure (e.g. an unbound EXTERNAL) and leaves the run finished/incomplete', async () => {
        const { runner } = makeRunner({ bad: RUNTIME_ERROR_SRC });
        await expect(runner.start('bad')).rejects.toThrow();
        expect(runner.isFinished()).toBe(true);
        expect(runner.wasCompleted()).toBe(false);
        expect(runner.currentLine()).toBeNull();
    });

    it('advance()/choose() are no-ops (not throws) once a run has ended via error', async () => {
        const { runner } = makeRunner({ bad: RUNTIME_ERROR_SRC });
        await expect(runner.start('bad')).rejects.toThrow();
        expect(() => runner.advance()).not.toThrow();
        expect(() => runner.choose(0)).not.toThrow();
    });
});
