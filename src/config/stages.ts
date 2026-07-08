import type { MessageKey } from '../services/I18nService';
import type { ItemId } from './items';
import { demoStage } from '../stages/demo/config';
import { demo2Stage } from '../stages/demo-2/config';
import { demoBranchStage } from '../stages/demo-branch/config';

/**
 * Stage/activity config types + the stage registry (PLAN.md §3.2).
 * Pure TS — no Phaser imports — so the registry is unit-testable.
 */

/** In-world timed dialogue (§3.6): a subtitle track plus optional per-speaker
    portraits (cue.speaker → image URL under public/assets/images/...). */
export interface DialogueSpec {
    trackId: string;
    portraits?: Record<string, string>;
}

export type ActivityRef =
    | { type: 'minigame'; sceneKey: string }
    /** Sceneless map pickup: FlowDirector records the flag without pausing the world. */
    | { type: 'pickup' }
    /** Played by the generic DialogueScene over the paused world (§3.6). */
    | ({ type: 'dialogue' } & DialogueSpec)
    | {
          type: 'video';
          videoKey: string;
          videoUrl: string;
          subtitleTrackId?: string;
          skippable: boolean;
      }
    /** Interactive NPC conversation played by the generic TalkScene over the
        paused world (PLAN.md §3.11): an Ink graph (assets/dialogue/<graphId>.ink)
        with optional per-speaker portraits (cue.speaker → image URL). */
    | { type: 'talk'; graphId: string; portraits?: Record<string, string> };

export interface TriggerDef {
    /** Unique WITHIN the stage; the completion flag is `${stageId}/${id}`. */
    id: string;
    /** Named object in the stage's Tiled map (zone or NPC spawn). */
    at: { objectName: string };
    activity: ActivityRef;
    /** Trigger IDs of THIS stage that must be complete before this trigger fires. */
    requiredTriggers?: string[];
    /** Items the player must hold before this trigger fires. */
    requiredItems?: ItemId[];
    /** Played instead when the requirements above aren't met (the flag is NOT
        recorded — e.g. the NPC asking for the things it needs). Without it,
        a blocked trigger just shows a toast naming what's missing. */
    blockedDialogue?: DialogueSpec;
    /** Items granted when this trigger completes (never on abort). */
    grantsItems?: ItemId[];
    /** Counts toward stage completion. */
    required: boolean;
    /** If true, consumed (hidden) once completed. */
    once: boolean;
}

/** In-map gated door (§3.9): opens iff every condition it LISTS is met — an
    exit listing nothing is always open; walking in advances the flow. */
export interface ExitDef {
    /** Named object in the stage's Tiled map. */
    at: { objectName: string };
    /** Destination stage; omitted = this stage's `next` (none → stage select). */
    to?: string;
    /** Trigger IDs of THIS stage that must be complete. */
    requiredTriggers?: string[];
    /** Items the player must hold. */
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
