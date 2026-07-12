import type { StageDef } from '../../config/stages';
import { SceneKeys } from '../../scenes/keys';

/** Both dialogues share the same speakers, so one portrait map serves both. */
const GUIDE_PORTRAITS = {
    guide: 'assets/images/demo/npc-guide.png',
    player: 'assets/images/demo/player.png'
};

/** No dedicated villager art yet — reuses the guide's placeholder portrait
    under the `villager` speaker key (§3.11 demo NPC). */
const VILLAGER_PORTRAITS = {
    villager: 'assets/images/demo/npc-guide.png',
    player: 'assets/images/demo/player.png'
};

/** Placeholder spine head: completing it unlocks demo-2 (next) and demo-branch (unlockedBy).
    Exercises the full gating flow: recruit the guide NPC (who asks for the finished
    training + the demo key) and the exit door opens. */
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
            // Optional + repeatable, like pizza-run.
            id: 'flappy',
            at: { objectName: 'trigger-flappy' },
            activity: { type: 'minigame', sceneKey: SceneKeys.Flappy },
            required: false,
            once: false
        },
        {
            // Optional + repeatable, like pizza-run.
            id: 'cart-carry',
            at: { objectName: 'trigger-cart' },
            activity: { type: 'minigame', sceneKey: SceneKeys.CartCarry },
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
            // Sceneless pickup (§3.2): grants the key the guide NPC asks for.
            id: 'key-pickup',
            at: { objectName: 'pickup-key' },
            activity: { type: 'pickup' },
            grantsItems: ['demo-key'],
            required: false,
            once: true
        },
        {
            // The recruit-the-guide quest (§3.9): while blocked the NPC asks for the
            // training + the key; once met, the join dialogue plays and the trigger's
            // flag opens the exit. `once` — the guide leaves the map when they join.
            id: 'npc-join',
            at: { objectName: 'npc-guide' },
            activity: { type: 'dialogue', trackId: 'npc-guide-join', portraits: GUIDE_PORTRAITS },
            requiredTriggers: ['template-minigame'],
            requiredItems: ['demo-key'],
            blockedDialogue: { trackId: 'npc-guide-ask', portraits: GUIDE_PORTRAITS },
            required: true,
            once: true
        },
        {
            // Talk-system demo (PLAN.md §3.11): small charming flavor chat with the
            // village NPC, replayable. Exercises hasItem() branching, two speakers,
            // and a choice where only one branch calls ~complete() (the other just
            // ends — nothing recorded either way since this trigger is optional).
            id: 'npc-villager',
            at: { objectName: 'npc-villager' },
            activity: { type: 'talk', graphId: 'npc-villager', portraits: VILLAGER_PORTRAITS },
            required: false,
            once: false
        }
    ],
    exits: [{ at: { objectName: 'exit-door' }, requiredTriggers: ['npc-join'] }],
    next: 'demo-2'
};
