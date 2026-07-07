import Phaser from 'phaser';
import type { ActivityRef } from '../../config/stages';
import { eventBus } from '../../core/EventBus';
import { GameClock } from '../../subtitles/GameClock';
import { subtitleEngine } from '../../subtitles/SubtitleEngine';

/** Scene data FlowDirector passes when launching a mini-game. */
export interface MiniGameData {
    activity: ActivityRef;
    flagId: string;
}

/**
 * THE mini-game contract (PLAN.md §3.3). Subclasses are otherwise unconstrained
 * (own physics, tilemaps) but MUST read player input only through InputService
 * and MUST call completeActivity() exactly once when the player finishes.
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

    /**
     * Shows timed in-game dialogue (PLAN.md §3.3/§3.5): plays the subtitle
     * track against a GameClock fed by this scene's UPDATE deltas, so the
     * dialogue pauses with the scene. Resolves when the track finishes;
     * rejects if the track fails to load.
     */
    protected showDialogue(trackId: string): Promise<void> {
        const clock = new GameClock();
        const onUpdate = (_time: number, delta: number): void => {
            clock.advance(delta);
            subtitleEngine.update();
        };
        const onShutdown = (): void => subtitleEngine.stop();
        this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
        return subtitleEngine.play(trackId, clock).finally(() => {
            this.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
            this.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
        });
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
