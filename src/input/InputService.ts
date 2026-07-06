/**
 * THE input abstraction (PLAN.md §3.10). Gameplay code reads ONLY this —
 * never raw keyboard events, never pointer position.
 * Pure TS (no Phaser) so it is unit-testable.
 */

export type Vec2 = { x: number; y: number };
export type PadButton = 'A' | 'B';

export interface GameInput {
    /** Movement vector, length clamped to 1 (keys give unit directions, joystick may be sub-unit). */
    direction(): Vec2;
    isDown(button: PadButton): boolean;
    /** Fires on the down edge only. Returns an unsubscribe function. */
    onPress(button: PadButton, cb: () => void): () => void;
}

/**
 * Merges multiple sources (keyboard, virtual pad). Direction follows the
 * most-recent source to report a non-zero vector — including that source's
 * later return to zero. Buttons are OR-ed across sources with edge-detected
 * press events.
 */
export class InputService implements GameInput {
    private readonly directions = new Map<string, Vec2>();
    private activeSource: string | null = null;
    private readonly downButtons = new Map<string, Set<PadButton>>();
    private readonly pressListeners: Record<PadButton, Set<() => void>> = {
        A: new Set(),
        B: new Set()
    };

    /** Called by sources whenever their direction state changes. */
    setDirection(source: string, x: number, y: number): void {
        const len = Math.hypot(x, y);
        const v = len > 1 ? { x: x / len, y: y / len } : { x, y };
        this.directions.set(source, v);
        if (v.x !== 0 || v.y !== 0) {
            this.activeSource = source;
        }
    }

    /** Called by sources on button down/up. */
    setButtonDown(source: string, button: PadButton, down: boolean): void {
        let set = this.downButtons.get(source);
        if (!set) {
            set = new Set();
            this.downButtons.set(source, set);
        }
        const wasDown = this.isDown(button);
        if (down) {
            set.add(button);
        } else {
            set.delete(button);
        }
        if (!wasDown && this.isDown(button)) {
            // Copy so a listener subscribing/unsubscribing mid-press doesn't hear this press.
            for (const cb of [...this.pressListeners[button]]) {
                cb();
            }
        }
    }

    direction(): Vec2 {
        const v = this.activeSource ? this.directions.get(this.activeSource) : undefined;
        return v ? { x: v.x, y: v.y } : { x: 0, y: 0 };
    }

    isDown(button: PadButton): boolean {
        for (const set of this.downButtons.values()) {
            if (set.has(button)) {
                return true;
            }
        }
        return false;
    }

    onPress(button: PadButton, cb: () => void): () => void {
        this.pressListeners[button].add(cb);
        return () => this.pressListeners[button].delete(cb);
    }
}

/** The game-wide instance; sources are attached in main.ts. */
export const inputService = new InputService();
