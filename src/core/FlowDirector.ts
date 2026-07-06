import type Phaser from 'phaser';
import { getStageById } from '../config/stages';
import type { TriggerDef } from '../config/stages';
import { SceneKeys } from '../scenes/keys';
import { ProgressService, progressService } from '../services/ProgressService';
import { EventBus, eventBus } from './EventBus';

/**
 * Control layer (PLAN.md §3.2): starts stages, and on trigger events pauses the
 * world, runs the activity scene, records the completion flag, and resumes.
 * Scenes call this / emit bus events; they never start/stop each other directly.
 * Phaser is a type-only import so this stays unit-testable (tests inject a stub game).
 */
export class FlowDirector {
    private game: Phaser.Game | null = null;
    private activeActivity: { sceneKey: string; flagId: string } | null = null;

    constructor(
        bus: EventBus = eventBus,
        private readonly progress: ProgressService = progressService
    ) {
        bus.on('activity:start', (payload) => this.onActivityStart(payload));
        bus.on('activity:complete', (payload) => this.onActivityComplete(payload));
    }

    /** Called once from main.ts after the Phaser.Game is created. */
    init(game: Phaser.Game): void {
        this.game = game;
    }

    /** Starts (or restarts) a stage in the reusable WorldScene. */
    startStage(stageId: string): void {
        const scenes = this.requireScenes();
        const stage = getStageById(stageId);
        if (this.activeActivity) {
            scenes.stop(this.activeActivity.sceneKey);
            this.activeActivity = null;
        }
        // Stop whichever flow scene is currently running (menu, or a previous stage).
        for (const key of [SceneKeys.MainMenu, SceneKeys.World]) {
            if (scenes.isActive(key) || scenes.isPaused(key) || scenes.isSleeping(key)) {
                scenes.stop(key);
            }
        }
        scenes.start(SceneKeys.World, { stage });
    }

    private onActivityStart({ stageId, trigger }: { stageId: string; trigger: TriggerDef }): void {
        if (this.activeActivity) {
            return; // an activity is already running; ignore re-entrant triggers
        }
        const scenes = this.requireScenes();
        const { activity } = trigger;
        if (activity.type === 'video') {
            throw new Error('Video activities arrive in milestone 7 (PLAN.md §4)');
        }
        const flagId = `${stageId}/${trigger.id}`;
        this.activeActivity = { sceneKey: activity.sceneKey, flagId };
        scenes.pause(SceneKeys.World);
        scenes.start(activity.sceneKey, { activity, flagId });
    }

    private onActivityComplete({ flagId }: { flagId: string }): void {
        if (!this.activeActivity) {
            return; // stale/duplicate completion; nothing to resume
        }
        const scenes = this.requireScenes();
        scenes.stop(this.activeActivity.sceneKey);
        this.activeActivity = null;
        this.progress.markCompleted(flagId);
        // WorldScene refreshes trigger state (once-triggers disappear) on its RESUME event.
        scenes.resume(SceneKeys.World);
    }

    private requireScenes(): Phaser.Scenes.SceneManager {
        if (!this.game) {
            throw new Error('FlowDirector.init(game) must be called first');
        }
        return this.game.scene;
    }
}

export const flowDirector = new FlowDirector();
