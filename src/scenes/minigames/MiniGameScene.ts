import Phaser from 'phaser';
import type { ActivityRef } from '../../config/stages';
import { eventBus } from '../../core/EventBus';

/** Scene data FlowDirector passes when launching a mini-game. */
export interface MiniGameData {
    activity: ActivityRef;
    flagId: string;
}

/**
 * THE mini-game contract (PLAN.md §3.3). Subclasses are otherwise unconstrained
 * (own physics, tilemaps) but MUST read player input only through InputService
 * and MUST call completeActivity() exactly once when the player finishes.
 * showDialogue() arrives in milestone 6 with the subtitle engine.
 */
export abstract class MiniGameScene extends Phaser.Scene {
    protected activity!: ActivityRef;
    protected flagId!: string;
    private completed = false;

    init(data: MiniGameData): void {
        if (!data?.activity || !data.flagId) {
            throw new Error(
                `${this.scene.key} needs { activity, flagId } — mini-games are launched by FlowDirector via a stage trigger`
            );
        }
        this.activity = data.activity;
        this.flagId = data.flagId;
        this.completed = false; // the same scene instance is reused across launches
    }

    /** Emits activity:complete; FlowDirector stops this scene and resumes the world. */
    protected completeActivity(result?: unknown): void {
        if (this.completed) {
            return;
        }
        this.completed = true;
        eventBus.emit('activity:complete', { flagId: this.flagId, result });
    }
}
