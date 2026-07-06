import type { StageDef } from '../../config/stages';
import { SceneKeys } from '../../scenes/keys';

/** Optional branch off the spine, proving `unlockedBy` (PLAN.md §3.2). */
export const demoBranchStage: StageDef = {
    id: 'demo-branch',
    titleKey: 'stage.demo-branch.title',
    tilemapKey: 'map-demo-branch',
    tilemapUrl: 'assets/maps/demo-branch.json',
    spawn: { objectName: 'spawn' },
    triggers: [
        {
            id: 'template-minigame',
            at: { objectName: 'trigger-template' },
            activity: { type: 'minigame', sceneKey: SceneKeys.TemplateMiniGame },
            required: true,
            // Stays on the map after completion — replayable on every visit.
            once: false
        }
    ],
    unlockedBy: ['demo']
};
