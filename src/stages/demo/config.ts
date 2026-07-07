import type { StageDef } from '../../config/stages';
import { SceneKeys } from '../../scenes/keys';

/** Placeholder spine head: completing it unlocks demo-2 (next) and demo-branch (unlockedBy).
    Exercises the gated-exit flow: the door needs the stage complete + the demo key. */
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
        },
        {
            // Optional + repeatable (like intro-video) so it's freely replayable.
            id: 'pizza-run',
            at: { objectName: 'trigger-pizza' },
            activity: { type: 'minigame', sceneKey: SceneKeys.PizzaRun },
            required: false,
            once: false
        },
        {
            // Optional + repeatable so the video/skip/locales can be re-tested freely.
            id: 'intro-video',
            at: { objectName: 'trigger-video' },
            activity: {
                type: 'video',
                videoKey: 'video-intro',
                videoUrl: 'assets/video/intro.mp4',
                subtitleTrackId: 'intro-video',
                skippable: true
            },
            required: false,
            once: false
        },
        {
            // Sceneless pickup (§3.2): grants the key the exit door requires.
            id: 'key-pickup',
            at: { objectName: 'pickup-key' },
            activity: { type: 'pickup' },
            grantsItems: ['demo-key'],
            required: false,
            once: true
        }
    ],
    exits: [{ at: { objectName: 'exit-door' }, requiredItems: ['demo-key'] }],
    next: 'demo-2'
};
