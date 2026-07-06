import { demoStage } from '../stages/demo/config';
import { demo2Stage } from '../stages/demo-2/config';
import { demoBranchStage } from '../stages/demo-branch/config';

/**
 * Stage/activity config types + the stage registry (PLAN.md §3.2).
 * Pure TS — no Phaser imports — so the registry is unit-testable.
 */

export type ActivityRef =
    | { type: 'minigame'; sceneKey: string }
    | {
          type: 'video';
          videoKey: string;
          videoUrl: string;
          subtitleTrackId?: string;
          skippable: boolean;
      };

export interface TriggerDef {
    /** Unique WITHIN the stage; the completion flag is `${stageId}/${id}`. */
    id: string;
    /** Named object in the stage's Tiled map (zone or NPC spawn). */
    at: { objectName: string };
    activity: ActivityRef;
    /** Counts toward stage completion. */
    required: boolean;
    /** If true, consumed (hidden) once completed. */
    once: boolean;
}

export interface StageDef {
    /** Unique, stable — used in completion flags. */
    id: string;
    /** i18n key shown in stage select. */
    titleKey: string;
    tilemapKey: string;
    tilemapUrl: string;
    /** Player spawn point object in the Tiled map. */
    spawn: { objectName: string };
    triggers: TriggerDef[];
    /** Default next stage (the "mostly linear" spine). */
    next?: string;
    /** Stage IDs that must be complete first (branch/optional stages). */
    unlockedBy?: string[];
}

export const STAGES: StageDef[] = [demoStage, demo2Stage, demoBranchStage];

export function getStageById(id: string): StageDef {
    const stage = STAGES.find((s) => s.id === id);
    if (!stage) {
        throw new Error(`Unknown stage id "${id}" — is it registered in config/stages.ts?`);
    }
    return stage;
}
