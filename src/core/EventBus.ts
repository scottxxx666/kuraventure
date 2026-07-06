import Phaser from 'phaser';
import type { TriggerDef } from '../config/stages';

/**
 * All cross-scene communication goes through this typed bus (PLAN.md §3).
 * Scenes never reach into each other's fields.
 */
export interface GameEvents {
    /** A WorldScene trigger fired; FlowDirector pauses the world and launches the activity. */
    'activity:start': { stageId: string; trigger: TriggerDef };
    /** The running activity finished; FlowDirector records the flag and resumes the world. */
    'activity:complete': { flagId: string; result?: unknown };
}

export type GameEventName = keyof GameEvents;

class EventBus {
    private readonly emitter = new Phaser.Events.EventEmitter();

    /** Returns an unsubscribe function. */
    on<K extends GameEventName>(event: K, cb: (payload: GameEvents[K]) => void): () => void {
        this.emitter.on(event, cb);
        return () => this.emitter.off(event, cb);
    }

    emit<K extends GameEventName>(event: K, payload: GameEvents[K]): void {
        this.emitter.emit(event, payload);
    }
}

export const eventBus = new EventBus();
