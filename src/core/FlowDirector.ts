import type Phaser from 'phaser';
import { getStageById } from '../config/stages';
import type { TriggerDef } from '../config/stages';
import { SceneKeys } from '../scenes/keys';
import { ProgressService, progressService } from '../services/ProgressService';
import { EventBus, eventBus } from './EventBus';

/** Scenes that own the screen one at a time; starting one stops the others. */
const FLOW_SCENES = [SceneKeys.MainMenu, SceneKeys.StageSelect, SceneKeys.World] as const;

/**
 * Control layer (PLAN.md §3.2): starts stages, and on trigger events pauses the
 * world, runs the activity scene, records the completion flag, and resumes.
 * When a stage's required triggers are all complete it marks the stage complete
 * (which unlocks `next`/branches) and, on the player's confirmation
 * (stage:advance), starts `next` or returns to stage select.
 * Scenes call this / emit bus events; they never start/stop each other directly.
 * Phaser is a type-only import so this stays unit-testable (tests inject a stub game).
 */
export class FlowDirector {
    private game: Phaser.Game | null = null;
    private activeActivity: { sceneKey: string; flagId: string; stageId: string } | null = null;

    constructor(
        private readonly bus: EventBus = eventBus,
        private readonly progress: ProgressService = progressService
    ) {
        bus.on('activity:start', (payload) => this.onActivityStart(payload));
        bus.on('activity:complete', (payload) => this.onActivityComplete(payload));
        bus.on('stage:advance', ({ stageId }) => this.onStageAdvance(stageId));
    }

    /** Called once from main.ts after the Phaser.Game is created. */
    init(game: Phaser.Game): void {
        this.game = game;
    }

    /** Starts (or restarts) a stage in the reusable WorldScene. */
    startStage(stageId: string): void {
        const scenes = this.requireScenes();
        const stage = getStageById(stageId);
        this.stopFlowScenes(scenes);
        scenes.start(SceneKeys.World, { stage });
    }

    /** Shows the stage-select screen (from the menu, or after the final spine stage). */
    openStageSelect(): void {
        const scenes = this.requireScenes();
        this.stopFlowScenes(scenes);
        scenes.start(SceneKeys.StageSelect);
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
        this.activeActivity = { sceneKey: activity.sceneKey, flagId, stageId };
        scenes.pause(SceneKeys.World);
        scenes.start(activity.sceneKey, { activity, flagId });
    }

    private onActivityComplete({ flagId }: { flagId: string }): void {
        if (!this.activeActivity) {
            return; // stale/duplicate completion; nothing to resume
        }
        const scenes = this.requireScenes();
        const { sceneKey, stageId } = this.activeActivity;
        scenes.stop(sceneKey);
        this.activeActivity = null;
        this.progress.markCompleted(flagId);
        // WorldScene refreshes trigger state (once-triggers disappear) on its RESUME event.
        scenes.resume(SceneKeys.World);
        this.checkStageCompletion(stageId);
    }

    private checkStageCompletion(stageId: string): void {
        if (this.progress.isStageComplete(stageId)) {
            return; // replaying a completed stage — flags stay, no re-announcement
        }
        const stage = getStageById(stageId);
        const complete = stage.triggers
            .filter((t) => t.required)
            .every((t) => this.progress.isCompleted(`${stageId}/${t.id}`));
        if (!complete) {
            return;
        }
        this.progress.markStageCompleted(stageId);
        this.bus.emit('stage:complete', { stageId });
    }

    private onStageAdvance(stageId: string): void {
        const next = getStageById(stageId).next;
        if (next) {
            this.startStage(next);
        } else {
            this.openStageSelect();
        }
    }

    private stopFlowScenes(scenes: Phaser.Scenes.SceneManager): void {
        if (this.activeActivity) {
            scenes.stop(this.activeActivity.sceneKey);
            this.activeActivity = null;
        }
        for (const key of FLOW_SCENES) {
            if (scenes.isActive(key) || scenes.isPaused(key) || scenes.isSleeping(key)) {
                scenes.stop(key);
            }
        }
    }

    private requireScenes(): Phaser.Scenes.SceneManager {
        if (!this.game) {
            throw new Error('FlowDirector.init(game) must be called first');
        }
        return this.game.scene;
    }
}

export const flowDirector = new FlowDirector();
