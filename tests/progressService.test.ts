import { describe, expect, it } from 'vitest';
import type { StageDef } from '../src/config/stages';
import { ProgressService } from '../src/services/ProgressService';
import type { KeyValueStorage } from '../src/services/ProgressService';

const STORAGE_KEY = 'kuraventure.progress.v1';

function makeStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
    const data = new Map(Object.entries(initial));
    return {
        data,
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => {
            data.set(key, value);
        }
    };
}

function stage(id: string, extra: Partial<StageDef> = {}): StageDef {
    return {
        id,
        titleKey: `stage.${id}.title`,
        tilemapKey: `map-${id}`,
        tilemapUrl: `assets/maps/${id}.json`,
        spawn: { objectName: 'spawn' },
        triggers: [],
        ...extra
    };
}

// head → middle → tail spine, with a branch off head and one gated by two stages.
const head = stage('head', { next: 'middle' });
const middle = stage('middle', { next: 'tail' });
const tail = stage('tail');
const branch = stage('branch', { unlockedBy: ['head'] });
const lateBranch = stage('late-branch', { unlockedBy: ['head', 'middle'] });
const fixture = [head, middle, tail, branch, lateBranch];

function unlockedIds(progress: ProgressService, stages: StageDef[] = fixture): string[] {
    return progress.getUnlockedStages(stages).map((s) => s.id);
}

describe('ProgressService persistence', () => {
    it('persists trigger and stage flags across instances sharing a storage', () => {
        const storage = makeStorage();
        const first = new ProgressService(storage);
        first.markCompleted('head/door');
        first.markStageCompleted('head');

        const second = new ProgressService(storage);
        expect(second.isCompleted('head/door')).toBe(true);
        expect(second.isStageComplete('head')).toBe(true);
        expect(second.isCompleted('head/other')).toBe(false);
    });

    it('writes the documented shape under the versioned key', () => {
        const storage = makeStorage();
        const progress = new ProgressService(storage);
        progress.markCompleted('head/door');
        progress.markCompleted('head/chest');
        progress.markStageCompleted('head');

        expect(JSON.parse(storage.data.get(STORAGE_KEY)!)).toEqual({
            completedTriggers: ['head/door', 'head/chest'],
            completedStages: ['head']
        });
    });

    it('re-marking an already-set flag does not rewrite storage', () => {
        const storage = makeStorage();
        const progress = new ProgressService(storage);
        progress.markCompleted('head/door');
        storage.data.clear();

        progress.markCompleted('head/door');
        expect(storage.data.has(STORAGE_KEY)).toBe(false);
    });

    it('starts fresh on corrupt stored JSON', () => {
        const storage = makeStorage({ [STORAGE_KEY]: 'not json{' });
        const progress = new ProgressService(storage);
        expect(progress.isCompleted('head/door')).toBe(false);
    });

    it('ignores malformed fields in stored data', () => {
        const storage = makeStorage({
            [STORAGE_KEY]: JSON.stringify({ completedTriggers: 'oops', completedStages: ['head', 42] })
        });
        const progress = new ProgressService(storage);
        expect(progress.isStageComplete('head')).toBe(true);
        expect(progress.isCompleted('oops')).toBe(false);
    });
});

describe('ProgressService storage-failure fallback', () => {
    const throwingStorage: KeyValueStorage = {
        getItem: () => {
            throw new Error('denied');
        },
        setItem: () => {
            throw new Error('quota');
        }
    };

    it('falls back to in-memory flags when storage throws', () => {
        const progress = new ProgressService(throwingStorage);
        progress.markCompleted('head/door');
        progress.markStageCompleted('head');

        expect(progress.isCompleted('head/door')).toBe(true);
        expect(unlockedIds(progress)).toContain('middle');
    });

    it('works fully in memory with no storage at all', () => {
        const progress = new ProgressService(null);
        progress.markStageCompleted('head');
        expect(progress.isStageComplete('head')).toBe(true);
    });
});

describe('ProgressService unlock derivation', () => {
    it('unlocks only the spine head initially', () => {
        expect(unlockedIds(new ProgressService(null))).toEqual(['head']);
    });

    it('completing a spine stage unlocks its next stage and its branches', () => {
        const progress = new ProgressService(null);
        progress.markStageCompleted('head');
        expect(unlockedIds(progress)).toEqual(['head', 'middle', 'branch']);
    });

    it('keeps completed stages unlocked for replay', () => {
        const progress = new ProgressService(null);
        progress.markStageCompleted('head');
        progress.markStageCompleted('middle');
        expect(unlockedIds(progress)).toEqual(['head', 'middle', 'tail', 'branch', 'late-branch']);
    });

    it('a multi-prerequisite branch needs every listed stage complete', () => {
        const progress = new ProgressService(null);
        progress.markStageCompleted('head');
        expect(unlockedIds(progress)).not.toContain('late-branch');
        progress.markStageCompleted('middle');
        expect(unlockedIds(progress)).toContain('late-branch');
    });

    it('drops unknown IDs from unlockedBy so config changes cannot lock a stage forever', () => {
        const ghostGated = stage('ghost-gated', { unlockedBy: ['head', 'removed-stage'] });
        const progress = new ProgressService(null);
        progress.markStageCompleted('head');
        expect(unlockedIds(progress, [head, ghostGated])).toContain('ghost-gated');
    });

    it('ignores completed flags for stages no longer in the registry', () => {
        const storage = makeStorage({
            [STORAGE_KEY]: JSON.stringify({
                completedTriggers: ['removed-stage/door'],
                completedStages: ['removed-stage']
            })
        });
        expect(unlockedIds(new ProgressService(storage))).toEqual(['head']);
    });

    it('defaults to the real stage registry', () => {
        const unlocked = new ProgressService(null).getUnlockedStages();
        expect(unlocked.map((s) => s.id)).toEqual(['demo']);
    });
});
