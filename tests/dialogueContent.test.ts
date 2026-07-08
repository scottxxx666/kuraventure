import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Localization completeness check for Ink talk graphs (PLAN.md §3.11): every
 * `# id:` tag on a line/choice in the .ink source must have a translation in
 * every locale's string table, and every table entry must correspond to a
 * real id in the graph (no orphaned/stale translations). Dependency-light —
 * ids are extracted with a regex over the raw .ink text rather than compiling
 * it, mirroring the locale-completeness test in tests/i18nService.test.ts.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const dialogueDir = path.resolve(here, '../public/assets/dialogue');
const LOCALES = ['zh-TW', 'ja', 'ko'] as const;

async function extractIds(graphId: string): Promise<Set<string>> {
    const source = await readFile(path.join(dialogueDir, `${graphId}.ink`), 'utf-8');
    const ids = new Set<string>();
    for (const match of source.matchAll(/#\s*id:([^\s\]]+)/g)) {
        ids.add(match[1]);
    }
    return ids;
}

async function loadTable(graphId: string, locale: string): Promise<Record<string, string>> {
    const raw = await readFile(path.join(dialogueDir, `${graphId}.${locale}.json`), 'utf-8');
    return JSON.parse(raw) as Record<string, string>;
}

describe('npc-villager talk graph localization', () => {
    it('the graph tags at least one line/choice with an id', async () => {
        const ids = await extractIds('npc-villager');
        expect(ids.size).toBeGreaterThan(0);
    });

    it.each(LOCALES)('%s string table has exactly the ids the graph tags — no missing, no orphaned', async (locale) => {
        const ids = await extractIds('npc-villager');
        const table = await loadTable('npc-villager', locale);
        const tableIds = new Set(Object.keys(table));

        const missing = [...ids].filter((id) => !tableIds.has(id));
        const orphaned = [...tableIds].filter((id) => !ids.has(id));

        expect(missing, `${locale} is missing translations for: ${missing.join(', ')}`).toEqual([]);
        expect(orphaned, `${locale} has orphaned ids not present in the graph: ${orphaned.join(', ')}`).toEqual([]);
    });

    it.each(LOCALES)('%s has no empty translations', async (locale) => {
        const table = await loadTable('npc-villager', locale);
        for (const [id, text] of Object.entries(table)) {
            expect(text.trim(), `${locale}: "${id}" is empty`).not.toBe('');
        }
    });
});
