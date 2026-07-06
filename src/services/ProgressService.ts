import { STAGES } from '../config/stages';
import type { StageDef } from '../config/stages';

/**
 * Completion-flag persistence + unlock derivation (PLAN.md §3.4).
 * Trigger flags are `${stageId}/${triggerId}`; only flags are ever persisted —
 * map state and unlocking are derived from them.
 * Pure TS — no Phaser imports — unit-testable.
 */

const STORAGE_KEY = 'kuraventure.progress.v1';

/** The minimal localStorage surface we use; tests inject a fake. */
export interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

interface StoredProgress {
    completedTriggers: string[];
    completedStages: string[];
}

/** localStorage access can throw (private-browsing modes) — treat as absent. */
function defaultStorage(): KeyValueStorage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

export class ProgressService {
    private readonly completedTriggers = new Set<string>();
    private readonly completedStages = new Set<string>();

    /** Pass null for a purely in-memory store (also the fallback when storage fails). */
    constructor(private readonly storage: KeyValueStorage | null = defaultStorage()) {
        this.load();
    }

    markCompleted(flagId: string): void {
        if (this.completedTriggers.has(flagId)) {
            return;
        }
        this.completedTriggers.add(flagId);
        this.persist();
    }

    markStageCompleted(stageId: string): void {
        if (this.completedStages.has(stageId)) {
            return;
        }
        this.completedStages.add(stageId);
        this.persist();
    }

    isCompleted(flagId: string): boolean {
        return this.completedTriggers.has(flagId);
    }

    isStageComplete(stageId: string): boolean {
        return this.completedStages.has(stageId);
    }

    /**
     * Derived from the registry + completed flags. A stage is unlocked when:
     * - it has `unlockedBy` → every listed stage is complete (unknown IDs are
     *   dropped so a renamed/removed stage can't permanently lock it), or
     * - it is some stage's `next` → at least one such predecessor is complete, or
     * - neither → it is a spine head, always unlocked.
     * Flags naming stages that are no longer registered are simply ignored.
     */
    getUnlockedStages(stages: StageDef[] = STAGES): StageDef[] {
        const knownIds = new Set(stages.map((s) => s.id));
        return stages.filter((stage) => {
            if (stage.unlockedBy) {
                return stage.unlockedBy
                    .filter((id) => knownIds.has(id))
                    .every((id) => this.completedStages.has(id));
            }
            const predecessors = stages.filter((s) => s.next === stage.id);
            if (predecessors.length === 0) {
                return true;
            }
            return predecessors.some((s) => this.completedStages.has(s.id));
        });
    }

    private load(): void {
        if (!this.storage) {
            return;
        }
        try {
            const raw = this.storage.getItem(STORAGE_KEY);
            if (!raw) {
                return;
            }
            const data = JSON.parse(raw) as Partial<StoredProgress>;
            for (const flag of Array.isArray(data.completedTriggers) ? data.completedTriggers : []) {
                if (typeof flag === 'string') {
                    this.completedTriggers.add(flag);
                }
            }
            for (const id of Array.isArray(data.completedStages) ? data.completedStages : []) {
                if (typeof id === 'string') {
                    this.completedStages.add(id);
                }
            }
        } catch {
            // Corrupt or unreadable storage — start fresh in memory.
        }
    }

    private persist(): void {
        if (!this.storage) {
            return;
        }
        const data: StoredProgress = {
            completedTriggers: [...this.completedTriggers],
            completedStages: [...this.completedStages]
        };
        try {
            this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch {
            // Quota/private-mode failure — keep running on the in-memory sets.
        }
    }
}

export const progressService = new ProgressService();
