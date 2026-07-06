import { getOverlayRoot } from '../ui/domOverlay';
import type { InputService, PadButton } from './InputService';

const SOURCE = 'virtualpad';
/** Knob travel as a fraction of the stick base radius. */
const KNOB_TRAVEL = 0.5;

export function isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Touch source (PLAN.md §3.10): on-screen joystick bottom-left, A/B buttons
 * bottom-right, rendered on the DOM overlay. Hidden by default — WorldScene
 * (and later mini-games) show it; menus and videos keep it hidden.
 */
export class VirtualPadSource {
    private readonly root: HTMLDivElement;
    private readonly knob: HTMLDivElement;
    private stickPointerId: number | null = null;

    constructor(private readonly input: InputService) {
        this.root = document.createElement('div');
        this.root.className = 'vpad';
        this.root.hidden = true;

        const stick = document.createElement('div');
        stick.className = 'vpad-stick';
        this.knob = document.createElement('div');
        this.knob.className = 'vpad-knob';
        stick.appendChild(this.knob);
        this.attachStickHandlers(stick);

        const buttons = document.createElement('div');
        buttons.className = 'vpad-buttons';
        buttons.appendChild(this.makeButton('B'));
        buttons.appendChild(this.makeButton('A'));

        this.root.appendChild(stick);
        this.root.appendChild(buttons);
        getOverlayRoot().appendChild(this.root);
    }

    setVisible(visible: boolean): void {
        this.root.hidden = !visible;
        if (!visible) {
            this.releaseStick();
        }
    }

    destroy(): void {
        this.releaseStick();
        this.root.remove();
    }

    private attachStickHandlers(stick: HTMLDivElement): void {
        stick.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.stickPointerId = e.pointerId;
            stick.setPointerCapture(e.pointerId);
            this.updateStick(stick, e);
        });
        stick.addEventListener('pointermove', (e) => {
            if (e.pointerId === this.stickPointerId) {
                this.updateStick(stick, e);
            }
        });
        const end = (e: PointerEvent): void => {
            if (e.pointerId === this.stickPointerId) {
                this.releaseStick();
            }
        };
        stick.addEventListener('pointerup', end);
        stick.addEventListener('pointercancel', end);
    }

    private updateStick(stick: HTMLDivElement, e: PointerEvent): void {
        const rect = stick.getBoundingClientRect();
        const radius = rect.width / 2;
        let x = (e.clientX - (rect.left + radius)) / radius;
        let y = (e.clientY - (rect.top + radius)) / radius;
        const len = Math.hypot(x, y);
        if (len > 1) {
            x /= len;
            y /= len;
        }
        this.knob.style.transform = `translate(${x * radius * KNOB_TRAVEL}px, ${y * radius * KNOB_TRAVEL}px)`;
        this.input.setDirection(SOURCE, x, y);
    }

    private releaseStick(): void {
        this.stickPointerId = null;
        this.knob.style.transform = '';
        this.input.setDirection(SOURCE, 0, 0);
    }

    private makeButton(button: PadButton): HTMLDivElement {
        const el = document.createElement('div');
        el.className = 'vpad-button';
        el.textContent = button;
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            el.setPointerCapture(e.pointerId);
            el.dataset.down = 'true';
            this.input.setButtonDown(SOURCE, button, true);
        });
        const release = (): void => {
            delete el.dataset.down;
            this.input.setButtonDown(SOURCE, button, false);
        };
        el.addEventListener('pointerup', release);
        el.addEventListener('pointercancel', release);
        return el;
    }
}

let pad: VirtualPadSource | null = null;

/** Called once from main.ts; creates the pad only on touch devices. */
export function createVirtualPadIfTouch(input: InputService): void {
    if (!pad && isTouchDevice()) {
        pad = new VirtualPadSource(input);
    }
}

/** No-op on non-touch devices. Gameplay scenes show it; menus hide it. */
export function setVirtualPadVisible(visible: boolean): void {
    pad?.setVisible(visible);
}
