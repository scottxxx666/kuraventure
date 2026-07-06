import type { TriggerDef } from '../config/stages';

/**
 * All cross-scene communication goes through this typed bus (PLAN.md §3).
 * Scenes never reach into each other's fields.
 * Pure TS — no Phaser imports — so FlowDirector stays unit-testable.
 */
export interface GameEvents {
    /** A WorldScene trigger fired; FlowDirector pauses the world and launches the activity. */
    'activity:start': { stageId: string; trigger: TriggerDef };
    /** The running activity finished; FlowDirector records the flag and resumes the world. */
    'activity:complete': { flagId: string; result?: unknown };
}

export type GameEventName = keyof GameEvents;

type Listener = (payload: never) => void;

export class EventBus {
    private readonly listeners = new Map<GameEventName, Set<Listener>>();

    /** Returns an unsubscribe function. */
    on<K extends GameEventName>(event: K, cb: (payload: GameEvents[K]) => void): () => void {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(cb as Listener);
        return () => set.delete(cb as Listener);
    }

    emit<K extends GameEventName>(event: K, payload: GameEvents[K]): void {
        const set = this.listeners.get(event);
        if (!set) {
            return;
        }
        // Copy so a listener unsubscribing mid-emit doesn't skip others.
        for (const cb of [...set]) {
            (cb as (payload: GameEvents[K]) => void)(payload);
        }
    }
}

export const eventBus = new EventBus();
