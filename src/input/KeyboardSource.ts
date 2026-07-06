import type { InputService, PadButton } from './InputService';

const SOURCE = 'keyboard';

type Axis = 'left' | 'right' | 'up' | 'down';

const DIRECTION_KEYS: Record<string, Axis> = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down'
};

const BUTTON_KEYS: Record<string, PadButton> = {
    KeyZ: 'A',
    Space: 'A',
    KeyX: 'B',
    Enter: 'B'
};

/**
 * Desktop source: arrows/WASD for direction, Z/Space → A, X/Enter → B.
 * Listens on window (not a scene's keyboard plugin) so one instance
 * outlives scene transitions.
 */
export class KeyboardSource {
    private readonly heldAxes = new Set<Axis>();
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
        const axis = DIRECTION_KEYS[e.code];
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
            if (down) {
                this.heldAxes.add(axis);
            } else {
                this.heldAxes.delete(axis);
            }
            const x = (this.heldAxes.has('right') ? 1 : 0) - (this.heldAxes.has('left') ? 1 : 0);
            const y = (this.heldAxes.has('down') ? 1 : 0) - (this.heldAxes.has('up') ? 1 : 0);
            this.input.setDirection(SOURCE, x, y);
        }
    }
}
