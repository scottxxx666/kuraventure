/**
 * THE input abstraction (PLAN.md §3.10). Gameplay code reads ONLY this —
 * never raw keyboard events, never pointer position.
 * Pure TS (no Phaser) so it is unit-testable.
 */

export type Vec2 = { x: number; y: number };
export type PadButton = 'A' | 'B';
/** Rhythm-lane index (DDR order ← ↓ ↑ →) — lane mode only (§3.10). */
export type PadLane = 0 | 1 | 2 | 3;

export interface GameInput {
    /** Movement vector, length clamped to 1 (keys give unit directions, joystick may be sub-unit). */
    direction(): Vec2;
    /** Second stick — zero unless twin-stick mode is on and a source publishes to it (§3.10). */
    direction2(): Vec2;
    isDown(button: PadButton): boolean;
    /** Fires on the down edge only. Returns an unsubscribe function. */
    onPress(button: PadButton, cb: () => void): () => void;
    /** Lane down edges — silent unless lane mode is on (§3.10). Returns an unsubscribe function. */
    onLanePress(cb: (lane: PadLane) => void): () => void;
}

/**
 * One direction channel: follows the most-recent source to report a
 * non-zero vector — including that source's later return to zero.
 */
class DirectionChannel {
    private readonly directions = new Map<string, Vec2>();
    private activeSource: string | null = null;

    set(source: string, x: number, y: number): void {
        const len = Math.hypot(x, y);
        const v = len > 1 ? { x: x / len, y: y / len } : { x, y };
        this.directions.set(source, v);
        if (v.x !== 0 || v.y !== 0) {
            this.activeSource = source;
        }
    }

    get(): Vec2 {
        const v = this.activeSource ? this.directions.get(this.activeSource) : undefined;
        return v ? { x: v.x, y: v.y } : { x: 0, y: 0 };
    }

    clear(): void {
        this.directions.clear();
        this.activeSource = null;
    }
}

/**
 * Merges multiple sources (keyboard, virtual pad) over two direction
 * channels plus buttons OR-ed across sources with edge-detected press
 * events. Channel 2 is only fed while twin-stick mode is on (the signed-off
 * exception for cart-carry): keyboard splits WASD/arrows and the virtual
 * pad swaps its A/B buttons for a second stick. Lane mode (the signed-off
 * exception for the dance mini-game) works the same way: keyboard turns
 * arrows/WASD into four discrete lane keys and the virtual pad swaps its
 * joystick + A/B for four tap zones, both feeding edge-detected lane presses.
 */
export class InputService implements GameInput {
    private readonly ch1 = new DirectionChannel();
    private readonly ch2 = new DirectionChannel();
    private twinStick = false;
    private laneMode = false;
    private readonly downButtons = new Map<string, Set<PadButton>>();
    private readonly downLanes = new Map<string, Set<PadLane>>();
    private readonly pressListeners: Record<PadButton, Set<() => void>> = {
        A: new Set(),
        B: new Set()
    };
    private readonly lanePressListeners = new Set<(lane: PadLane) => void>();

    /** Called by sources whenever their direction state changes. */
    setDirection(source: string, x: number, y: number): void {
        this.ch1.set(source, x, y);
    }

    /** Second-channel counterpart, fed only in twin-stick mode. */
    setDirection2(source: string, x: number, y: number): void {
        this.ch2.set(source, x, y);
    }

    /**
     * Toggles twin-stick mode and clears both channels — sources re-publish
     * on their next event, so a key held across the toggle stays dead until
     * re-pressed (accepted trade-off; scenes toggle at transitions).
     */
    setTwinStick(enabled: boolean): void {
        this.twinStick = enabled;
        this.ch1.clear();
        this.ch2.clear();
    }

    isTwinStick(): boolean {
        return this.twinStick;
    }

    /**
     * Toggles lane mode and clears held-lane state plus both direction
     * channels — same trade-off as setTwinStick: input held across the
     * toggle stays dead until re-pressed (scenes toggle at transitions).
     */
    setLaneMode(enabled: boolean): void {
        this.laneMode = enabled;
        this.downLanes.clear();
        this.ch1.clear();
        this.ch2.clear();
    }

    isLaneMode(): boolean {
        return this.laneMode;
    }

    /** Called by sources on lane down/up while lane mode is on. */
    setLaneDown(source: string, lane: PadLane, down: boolean): void {
        let set = this.downLanes.get(source);
        if (!set) {
            set = new Set();
            this.downLanes.set(source, set);
        }
        const wasDown = this.isLaneDown(lane);
        if (down) {
            set.add(lane);
        } else {
            set.delete(lane);
        }
        if (!wasDown && this.isLaneDown(lane)) {
            // Copy so a listener subscribing/unsubscribing mid-press doesn't hear this press.
            for (const cb of [...this.lanePressListeners]) {
                cb(lane);
            }
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
        return this.ch1.get();
    }

    direction2(): Vec2 {
        return this.ch2.get();
    }

    isDown(button: PadButton): boolean {
        for (const set of this.downButtons.values()) {
            if (set.has(button)) {
                return true;
            }
        }
        return false;
    }

    private isLaneDown(lane: PadLane): boolean {
        for (const set of this.downLanes.values()) {
            if (set.has(lane)) {
                return true;
            }
        }
        return false;
    }

    onPress(button: PadButton, cb: () => void): () => void {
        this.pressListeners[button].add(cb);
        return () => this.pressListeners[button].delete(cb);
    }

    onLanePress(cb: (lane: PadLane) => void): () => void {
        this.lanePressListeners.add(cb);
        return () => this.lanePressListeners.delete(cb);
    }
}

/** The game-wide instance; sources are attached in main.ts. */
export const inputService = new InputService();
