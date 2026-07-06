/**
 * Completion-flag store (PLAN.md §3.4). Trigger flags are `${stageId}/${triggerId}`.
 * Milestone 3 keeps flags in memory only; localStorage persistence and unlock
 * derivation land in milestone 4.
 * Pure TS — no Phaser imports — unit-testable.
 */
export class ProgressService {
    private readonly completed = new Set<string>();

    markCompleted(flagId: string): void {
        this.completed.add(flagId);
    }

    isCompleted(flagId: string): boolean {
        return this.completed.has(flagId);
    }
}

export const progressService = new ProgressService();
