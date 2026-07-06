import Phaser from 'phaser';
import { getStageById } from '../config/stages';
import { SceneKeys } from '../scenes/keys';

/**
 * Control layer (PLAN.md §3.2): starts stages and — from milestone 3 —
 * pauses the world, runs activities, and advances the flow.
 * Scenes call this; they never start/stop each other directly.
 */
class FlowDirector {
    private game: Phaser.Game | null = null;

    /** Called once from main.ts after the Phaser.Game is created. */
    init(game: Phaser.Game): void {
        this.game = game;
    }

    /** Starts (or restarts) a stage in the reusable WorldScene. */
    startStage(stageId: string): void {
        if (!this.game) {
            throw new Error('FlowDirector.init(game) must be called before startStage');
        }
        const stage = getStageById(stageId);
        const scenes = this.game.scene;
        // Stop whichever flow scene is currently running (menu, or a previous stage).
        for (const key of [SceneKeys.MainMenu, SceneKeys.World]) {
            if (scenes.isActive(key) || scenes.isPaused(key) || scenes.isSleeping(key)) {
                scenes.stop(key);
            }
        }
        scenes.start(SceneKeys.World, { stage });
    }
}

export const flowDirector = new FlowDirector();
