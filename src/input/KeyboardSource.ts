import type { InputService, PadButton, PadLane } from './InputService';

const SOURCE = 'keyboard';

type Axis = 'left' | 'right' | 'up' | 'down';

/** Lane mode (§3.10): each axis is a discrete lane key, DDR order ← ↓ ↑ →. */
const AXIS_LANE: Record<Axis, PadLane> = {
    left: 0,
    down: 1,
    up: 2,
    right: 3
};

// WASD and arrows are tracked separately so twin-stick mode (§3.10) can
// split them into the two channels; in normal mode their union feeds
// channel 1 exactly as before.
const WASD_KEYS: Record<string, Axis> = {
    KeyA: 'left',
    KeyD: 'right',
    KeyW: 'up',
    KeyS: 'down'
};

const ARROW_KEYS: Record<string, Axis> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down'
};

const BUTTON_KEYS: Record<string, PadButton> = {
    KeyZ: 'A',
    Space: 'A',
    KeyX: 'B',
    Enter: 'B'
};

function axisVector(axes: Set<Axis>): { x: number; y: number } {
    return {
        x: (axes.has('right') ? 1 : 0) - (axes.has('left') ? 1 : 0),
        y: (axes.has('down') ? 1 : 0) - (axes.has('up') ? 1 : 0)
    };
}

/**
 * Desktop source: arrows/WASD for direction, Z/Space → A, X/Enter → B.
 * In twin-stick mode WASD feeds channel 1 and arrows channel 2. In lane
 * mode arrows/WASD stop feeding direction and become four independent
 * lane keys (so chords work and rolling between keys can't misfire).
 * Listens on window (not a scene's keyboard plugin) so one instance
 * outlives scene transitions.
 */
export class KeyboardSource {
    private readonly heldWasd = new Set<Axis>();
    private readonly heldArrows = new Set<Axis>();
    private readonly onKeyDown = (e: KeyboardEvent): void => this.handleKey(e, true);
    private readonly onKeyUp = (e: KeyboardEvent): void => this.handleKey(e, false);

    constructor(private readonly input: InputService) {
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
    }

    destroy(): void {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
    }

    private handleKey(e: KeyboardEvent, down: boolean): void {
        const wasdAxis = WASD_KEYS[e.code];
        const arrowAxis = ARROW_KEYS[e.code];
        const axis = wasdAxis ?? arrowAxis;
        const button = BUTTON_KEYS[e.code];
        if (!axis && !button) {
            return;
        }
        e.preventDefault();
        if (e.repeat) {
            return;
        }
        if (button) {
            this.input.setButtonDown(SOURCE, button, down);
        }
        if (axis) {
            // Held sets are tracked even in lane mode so direction state is
            // accurate again the moment the mode toggles back off.
            const set = wasdAxis ? this.heldWasd : this.heldArrows;
            if (down) {
                set.add(axis);
            } else {
                set.delete(axis);
            }
            if (this.input.isLaneMode()) {
                this.input.setLaneDown(SOURCE, AXIS_LANE[axis], down);
            } else {
                this.publish();
            }
        }
    }

    private publish(): void {
        const wasd = axisVector(this.heldWasd);
        const arrows = axisVector(this.heldArrows);
        if (this.input.isTwinStick()) {
            // Publish BOTH channels on every event so state cleared by the
            // mode toggle revives on the next keystroke.
            this.input.setDirection(SOURCE, wasd.x, wasd.y);
            this.input.setDirection2(SOURCE, arrows.x, arrows.y);
        } else {
            this.input.setDirection(
                SOURCE,
                Math.max(-1, Math.min(1, wasd.x + arrows.x)),
                Math.max(-1, Math.min(1, wasd.y + arrows.y))
            );
        }
    }
}
