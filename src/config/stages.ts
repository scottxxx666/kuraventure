import type { MessageKey } from '../services/I18nService';
import type { ItemId } from './items';
import { demoStage } from '../stages/demo/config';
import { demo2Stage } from '../stages/demo-2/config';
import { demoBranchStage } from '../stages/demo-branch/config';

/**
 * Stage/activity config types + the stage registry (PLAN.md §3.2).
 * Pure TS — no Phaser imports — so the registry is unit-testable.
 */

export type ActivityRef =
    | { type: 'minigame'; sceneKey: string }
    /** Sceneless map pickup: FlowDirector records the flag without pausing the world. */
    | { type: 'pickup' }
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
    /** Items granted when this trigger completes (never on abort). */
    grantsItems?: ItemId[];
    /** Counts toward stage completion. */
    required: boolean;
    /** If true, consumed (hidden) once completed. */
    once: boolean;
}

/** In-map gated door (§3.9): opens when the stage's required triggers are all
    complete AND `requiredItems` are held; walking in advances the flow. */
export interface ExitDef {
    /** Named object in the stage's Tiled map. */
    at: { objectName: string };
    /** Destination stage; omitted = this stage's `next` (none → stage select). */
    to?: string;
    /** Items the player must hold, on top of the stage being complete. */
    requiredItems?: ItemId[];
}

export interface StageDef {
    /** Unique, stable — used in completion flags. */
    id: string;
    /** i18n key shown in stage select; typed so an unknown key is a compile error. */
    titleKey: MessageKey;
    tilemapKey: string;
    tilemapUrl: string;
    /** Player spawn point object in the Tiled map. */
    spawn: { objectName: string };
    triggers: TriggerDef[];
    /** Gated doors; when present they replace the press-A advance prompt. */
    exits?: ExitDef[];
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
