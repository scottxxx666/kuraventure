import { describe, expect, it } from 'vitest';
import type { StageDef } from '../src/config/stages';
import { ProgressService } from '../src/services/ProgressService';
import type { KeyValueStorage } from '../src/services/storage';

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
        // Fixture stages are fake, so their title keys are not real MessageKeys.
        titleKey: `stage.${id}.title` as StageDef['titleKey'],
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
            completedStages: ['head'],
            items: []
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

describe('ProgressService item inventory', () => {
    it('grants and persists items across instances sharing a storage', () => {
        const storage = makeStorage();
        const first = new ProgressService(storage);
        first.grantItem('demo-key');

        const second = new ProgressService(storage);
        expect(second.hasItem('demo-key')).toBe(true);
        expect(second.hasItem('other-key')).toBe(false);
    });

    it('loads pre-inventory saves (no items field) with an empty inventory', () => {
        const storage = makeStorage({
            [STORAGE_KEY]: JSON.stringify({
                completedTriggers: ['head/door'],
                completedStages: ['head']
            })
        });
        const progress = new ProgressService(storage);
        expect(progress.isCompleted('head/door')).toBe(true);
        expect(progress.hasItem('demo-key')).toBe(false);
    });

    it('re-granting an already-held item does not rewrite storage', () => {
        const storage = makeStorage();
        const progress = new ProgressService(storage);
        progress.grantItem('demo-key');
        storage.data.clear();

        progress.grantItem('demo-key');
        expect(storage.data.has(STORAGE_KEY)).toBe(false);
    });

    it('ignores a malformed items field', () => {
        const storage = makeStorage({
            [STORAGE_KEY]: JSON.stringify({
                completedTriggers: [],
                completedStages: [],
                items: 'oops'
            })
        });
        expect(new ProgressService(storage).hasItem('oops')).toBe(false);
    });
});

describe('ProgressService.areRequiredTriggersComplete', () => {
    const trigger = (id: string, required: boolean): StageDef['triggers'][number] => ({
        id,
        at: { objectName: id },
        activity: { type: 'pickup' },
        required,
        once: true
    });
    const gated = stage('gated', { triggers: [trigger('boss', true), trigger('bonus', false)] });

    it('is true only when every required trigger flag is set', () => {
        const progress = new ProgressService(null);
        expect(progress.areRequiredTriggersComplete(gated)).toBe(false);
        progress.markCompleted('gated/boss');
        expect(progress.areRequiredTriggersComplete(gated)).toBe(true);
    });

    it('ignores optional triggers', () => {
        const progress = new ProgressService(null);
        progress.markCompleted('gated/bonus');
        expect(progress.areRequiredTriggersComplete(gated)).toBe(false);
    });

    it('is vacuously true for a stage with no required triggers', () => {
        const progress = new ProgressService(null);
        expect(progress.areRequiredTriggersComplete(stage('empty'))).toBe(true);
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
        progress.grantItem('demo-key');

        expect(progress.isCompleted('head/door')).toBe(true);
        expect(progress.hasItem('demo-key')).toBe(true);
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
