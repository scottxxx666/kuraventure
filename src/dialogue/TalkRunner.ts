// The bare 'inkjs' entry point is runtime-only (Story, for precompiled JSON);
// Compiler only exists in the 'full' bundle (verified: 'inkjs' resolves to
// dist/ink.mjs under ESM, which omits Compiler — dist/ink-full.mjs has both).
import { Compiler, Story } from 'inkjs/full';
import { EventBus, eventBus } from '../core/EventBus';
import { I18nService, i18nService } from '../services/I18nService';
import type { Locale } from '../services/I18nService';
import { ProgressService, progressService } from '../services/ProgressService';
import type { TalkChoice, TalkLine } from './types';

/** Fetches public/assets/dialogue/<graphId>.ink (path per PLAN.md §3.11). */
async function fetchText(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch ${url} (${res.status})`);
    }
    return res.text();
}

async function fetchJson(url: string): Promise<Record<string, string>> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch ${url} (${res.status})`);
    }
    return (await res.json()) as Record<string, string>;
}

/** Splits a tag on its first `:` — `id:guide.hello` -> ['id', 'guide.hello']. */
function parseTag(tag: string): [key: string, value: string] | null {
    const i = tag.indexOf(':');
    if (i === -1) {
        return null;
    }
    return [tag.slice(0, i).trim(), tag.slice(i + 1).trim()];
}

function parseTags(tags: string[] | null | undefined): { id?: string; speaker?: string } {
    const result: { id?: string; speaker?: string } = {};
    for (const tag of tags ?? []) {
        const parsed = parseTag(tag);
        if (!parsed) {
            continue;
        }
        const [key, value] = parsed;
        if (key === 'id') {
            result.id = value;
        } else if (key === 'speaker') {
            result.speaker = value;
        }
    }
    return result;
}

/** Un-localized line/choice text as read off the story, plus its `id` for translation lookup. */
interface RawLine {
    text: string;
    speaker?: string;
    id?: string;
}
interface RawChoice {
    text: string;
    id?: string;
}

interface Run {
    graphId: string;
    story: Story;
    /** Locale + string table the run was last (re)localized against. */
    locale: Locale;
    table: Record<string, string>;
    rawLine: RawLine | null;
    rawChoices: RawChoice[];
    finished: boolean;
    /** Set by the ink `complete()` external — "record this trigger's flag". */
    completed: boolean;
}

/**
 * Ink-backed NPC conversation runner (PLAN.md §3.11). Modeled on SubtitleEngine
 * (§3.5): a promise-cache per graphId so concurrent loads dedupe, constructor-
 * injected fetchers for zero-network tests, and a single active run — starting
 * a new one supersedes whatever was loading.
 *
 * Graph files are `assets/dialogue/<graphId>.ink`; the source language is
 * English and lives in the graph. Non-English locales are flat string tables
 * `assets/dialogue/<graphId>.<locale>.json` (`{ [id]: string }`) keyed by the
 * `id:` tag on the line/choice — a missing table warns once and falls back to
 * the ink text, never throws.
 *
 * Localization design: `currentLine()`/`currentChoices()` re-resolve against
 * the run's *active* table on every call rather than baking the translation in
 * at read time — so on `locale:changed` the runner only needs to (async) load
 * the new table and swap it in; the scene re-renders by calling them again
 * (see `onRelocalized`) with no need to re-walk the story.
 *
 * One active conversation at a time: `advance()`/`choose()` only affect the
 * run started by the most recent `start()`. Entry points that hit a malformed
 * graph (Compile/Continue can throw) leave the run in a safe `finished` state
 * before rethrowing, so a caller that catches, logs, and asks
 * `isFinished()`/`wasCompleted()` to end the conversation never soft-locks.
 */
export class TalkRunner {
    private readonly graphCache = new Map<string, Promise<string>>();
    private readonly tableCache = new Map<string, Promise<Record<string, string>>>();
    private readonly relocalizedListeners = new Set<() => void>();
    private run: Run | null = null;
    /** Invalidates a start() whose graph was still loading when stop()/start() intervened. */
    private generation = 0;

    constructor(
        private readonly progress: ProgressService = progressService,
        private readonly i18n: I18nService = i18nService,
        bus: EventBus = eventBus,
        private readonly fetchGraphText: (url: string) => Promise<string> = fetchText,
        private readonly fetchTableJson: (url: string) => Promise<Record<string, string>> = fetchJson
    ) {
        bus.on('locale:changed', ({ locale }) => void this.onLocaleChanged(locale));
    }

    /**
     * Loads (or reuses the cached compile of) `graphId`, starts a fresh Story,
     * and pulls the first line/choices. Throws if the graph fails to load or
     * compile, or if the very first Continue() fails — callers must catch.
     */
    async start(graphId: string): Promise<void> {
        this.run = null; // supersede whatever was running/loading
        const generation = ++this.generation;
        const json = await this.loadGraph(graphId);
        if (generation !== this.generation) {
            return; // superseded by another start()/stop() while the graph loaded
        }
        const story = new Story(json);
        const run: Run = {
            graphId,
            story,
            locale: this.i18n.getLocale(),
            table: {},
            rawLine: null,
            rawChoices: [],
            finished: false,
            completed: false
        };
        this.bindExternals(run);
        this.run = run;
        const table = await this.loadTable(graphId, run.locale);
        if (this.run !== run) {
            return; // superseded by another start()/stop() while the table loaded
        }
        run.table = table;
        this.continueStory(run);
    }

    /** Ends the active run (if any) without emitting anything — for scene shutdown. */
    stop(): void {
        this.generation++;
        this.run = null;
    }

    /** The line to show, localized against the active table; null when choices
        are pending or the conversation is finished. */
    currentLine(): TalkLine | null {
        const run = this.run;
        if (!run?.rawLine) {
            return null;
        }
        return { ...run.rawLine, text: this.localize(run, run.rawLine.id, run.rawLine.text) };
    }

    /** Non-empty only when the story is waiting on a choice. */
    currentChoices(): TalkChoice[] {
        const run = this.run;
        if (!run) {
            return [];
        }
        return run.rawChoices.map((c) => ({ ...c, text: this.localize(run, c.id, c.text) }));
    }

    /** Continues to the next line. No-op while choices are pending or finished. */
    advance(): void {
        const run = this.run;
        if (!run || run.finished || run.rawChoices.length > 0) {
            return;
        }
        this.continueStory(run);
    }

    /** Picks choice `index` and continues. No-op when no choices are pending. */
    choose(index: number): void {
        const run = this.run;
        if (!run || run.rawChoices.length === 0) {
            return;
        }
        this.continueStory(run, () => run.story.ChooseChoiceIndex(index));
    }

    isFinished(): boolean {
        return this.run?.finished ?? true;
    }

    /** True iff the ink script called `~ complete()` at some point this run. */
    wasCompleted(): boolean {
        return this.run?.completed ?? false;
    }

    /** Fires after a locale change finishes re-loading the active run's table,
        so the scene can re-render currentLine()/currentChoices(). */
    onRelocalized(cb: () => void): () => void {
        this.relocalizedListeners.add(cb);
        return () => this.relocalizedListeners.delete(cb);
    }

    private bindExternals(run: Run): void {
        // Lookahead-safe reads: inkjs may call these speculatively while glue-scanning.
        run.story.BindExternalFunction('hasItem', (itemId: string) => this.progress.hasItem(itemId), true);
        run.story.BindExternalFunction('hasFlag', (flagId: string) => this.progress.isCompleted(flagId), true);
        // NOT lookahead-safe: side effects must fire exactly once.
        run.story.BindExternalFunction(
            'grantItem',
            (itemId: string) => {
                this.progress.grantItem(itemId);
            },
            false
        );
        run.story.BindExternalFunction(
            'complete',
            () => {
                run.completed = true;
            },
            false
        );
    }

    /** Runs `step` (default: none — used by the initial pull) then walks the
        story to the next non-empty line, the next choice set, or the end.
        On error, leaves the run finished (but keeps `completed` as-is) before
        rethrowing, so isFinished()/wasCompleted() stay safe to call from a
        catch block. */
    private continueStory(run: Run, step?: () => void): void {
        try {
            step?.();
            this.pullNext(run);
        } catch (err) {
            run.rawLine = null;
            run.rawChoices = [];
            run.finished = true;
            throw err;
        }
    }

    private pullNext(run: Run): void {
        while (run.story.canContinue) {
            const text = (run.story.Continue() ?? '').trim();
            if (text.length === 0) {
                continue; // skip empty/whitespace-only lines
            }
            const { id, speaker } = parseTags(run.story.currentTags);
            run.rawLine = { text, id, speaker };
            run.rawChoices = [];
            return;
        }
        const choices = run.story.currentChoices;
        if (choices.length > 0) {
            run.rawLine = null;
            run.rawChoices = choices.map((c) => ({ text: c.text.trim(), id: parseTags(c.tags).id }));
            return;
        }
        run.rawLine = null;
        run.rawChoices = [];
        run.finished = true;
    }

    private localize(run: Run, id: string | undefined, fallback: string): string {
        if (!id || run.locale === 'en') {
            return fallback;
        }
        return run.table[id] ?? fallback;
    }

    /** Fetches + compiles the graph once per graphId; the compiled JSON is
        cached (promise-cache so concurrent loads dedupe) — failures are not
        cached, so the next start() retries. */
    private loadGraph(graphId: string): Promise<string> {
        let json = this.graphCache.get(graphId);
        if (!json) {
            json = this.compileGraph(graphId).catch((err: unknown) => {
                this.graphCache.delete(graphId);
                throw err;
            });
            this.graphCache.set(graphId, json);
        }
        return json;
    }

    private async compileGraph(graphId: string): Promise<string> {
        const source = await this.fetchGraphText(`assets/dialogue/${graphId}.ink`);
        const story = new Compiler(source).Compile();
        return story.ToJson() as string;
    }

    /** Fetches the graph's string table for one locale, cached per graphId+locale.
        'en' never has a table (the graph text IS English). A missing/failed
        table warns once — the fallback {} is itself cached — and callers fall
        back to the ink text via localize(). */
    private loadTable(graphId: string, locale: Locale): Promise<Record<string, string>> {
        if (locale === 'en') {
            return Promise.resolve({});
        }
        const key = `${graphId}.${locale}`;
        let table = this.tableCache.get(key);
        if (!table) {
            table = this.fetchTableJson(`assets/dialogue/${graphId}.${locale}.json`).catch((err: unknown) => {
                console.warn(
                    `Talk string table missing for "${graphId}" (${locale}) — falling back to English`,
                    err
                );
                return {};
            });
            this.tableCache.set(key, table);
        }
        return table;
    }

    /** Reloads the active run's table in the new locale and notifies listeners
        so the scene can re-render (PLAN.md §3.11). */
    private async onLocaleChanged(locale: Locale): Promise<void> {
        const run = this.run;
        if (!run) {
            return;
        }
        const table = await this.loadTable(run.graphId, locale);
        if (this.run !== run) {
            return; // run ended/replaced while the table loaded
        }
        run.locale = locale;
        run.table = table;
        for (const cb of [...this.relocalizedListeners]) {
            cb();
        }
    }
}

export const talkRunner = new TalkRunner();
