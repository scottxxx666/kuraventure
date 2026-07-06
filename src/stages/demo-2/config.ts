import type { StageDef } from '../../config/stages';
import { SceneKeys } from '../../scenes/keys';

/** Second spine stage; no `next` — completing it ends the spine (back to stage select). */
export const demo2Stage: StageDef = {
    id: 'demo-2',
    titleKey: 'stage.demo-2.title',
    tilemapKey: 'map-demo-2',
    tilemapUrl: 'assets/maps/demo-2.json',
    spawn: { objectName: 'spawn' },
    triggers: [
        {
            id: 'template-minigame',
            at: { objectName: 'trigger-template' },
            activity: { type: 'minigame', sceneKey: SceneKeys.TemplateMiniGame },
            required: true,
            once: true
        }
    ]
};
