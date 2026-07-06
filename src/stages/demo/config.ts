import type { StageDef } from '../../config/stages';
import { SceneKeys } from '../../scenes/keys';

/** Placeholder stage exercising the milestone-3 activity flow. */
export const demoStage: StageDef = {
    id: 'demo',
    titleKey: 'stage.demo.title',
    tilemapKey: 'map-demo',
    tilemapUrl: 'assets/maps/demo.json',
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
