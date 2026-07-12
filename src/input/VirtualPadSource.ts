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
 * Twin-stick mode (cart-carry's signed-off exception) swaps the A/B buttons
 * for a second joystick bottom-right feeding channel 2.
 */
export class VirtualPadSource {
    private readonly root: HTMLDivElement;
    private readonly stickReleases: (() => void)[] = [];
    private readonly buttonReleases: (() => void)[] = [];

    constructor(private readonly input: InputService) {
        this.root = document.createElement('div');
        this.root.className = 'vpad';
        this.root.hidden = true;

        const left = this.makeStick('', (x, y) => this.input.setDirection(SOURCE, x, y));
        const right = this.makeStick('vpad-stick-right', (x, y) => this.input.setDirection2(SOURCE, x, y));

        const buttons = document.createElement('div');
        buttons.className = 'vpad-buttons';
        buttons.appendChild(this.makeButton('B'));
        buttons.appendChild(this.makeButton('A'));

        this.root.appendChild(left);
        this.root.appendChild(right);
        this.root.appendChild(buttons);
        getOverlayRoot().appendChild(this.root);
    }

    setVisible(visible: boolean): void {
        this.root.hidden = !visible;
        if (!visible) {
            this.releaseAll();
        }
    }

    /**
     * Swap the A/B buttons for the second stick (and back). Force-releases
     * everything: a pointer captured on an element that goes display:none
     * may never get its pointerup, which would leave a stick deflected or a
     * button stuck down (breaking the fail flow's A-press skip edge).
     */
    setTwinStick(enabled: boolean): void {
        this.root.classList.toggle('vpad--twin', enabled);
        this.releaseAll();
    }

    destroy(): void {
        this.releaseAll();
        this.root.remove();
    }

    private releaseAll(): void {
        for (const release of [...this.stickReleases, ...this.buttonReleases]) {
            release();
        }
    }

    private makeStick(extraClass: string, publish: (x: number, y: number) => void): HTMLDivElement {
        const stick = document.createElement('div');
        stick.className = extraClass ? `vpad-stick ${extraClass}` : 'vpad-stick';
        const knob = document.createElement('div');
        knob.className = 'vpad-knob';
        stick.appendChild(knob);

        let pointerId: number | null = null;

        const update = (e: PointerEvent): void => {
            const rect = stick.getBoundingClientRect();
            const radius = rect.width / 2;
            let x = (e.clientX - (rect.left + radius)) / radius;
            let y = (e.clientY - (rect.top + radius)) / radius;
            const len = Math.hypot(x, y);
            if (len > 1) {
                x /= len;
                y /= len;
            }
            knob.style.transform = `translate(${x * radius * KNOB_TRAVEL}px, ${y * radius * KNOB_TRAVEL}px)`;
            publish(x, y);
        };
        const release = (): void => {
            pointerId = null;
            knob.style.transform = '';
            publish(0, 0);
        };
        this.stickReleases.push(release);

        stick.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            pointerId = e.pointerId;
            stick.setPointerCapture(e.pointerId);
            update(e);
        });
        stick.addEventListener('pointermove', (e) => {
            if (e.pointerId === pointerId) {
                update(e);
            }
        });
        const end = (e: PointerEvent): void => {
            if (e.pointerId === pointerId) {
                release();
            }
        };
        stick.addEventListener('pointerup', end);
        stick.addEventListener('pointercancel', end);
        return stick;
    }

    private makeButton(button: PadButton): HTMLDivElement {
        const el = document.createElement('div');
        el.className = 'vpad-button';
        el.textContent = button;
        const release = (): void => {
            delete el.dataset.down;
            this.input.setButtonDown(SOURCE, button, false);
        };
        this.buttonReleases.push(release);
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            el.setPointerCapture(e.pointerId);
            el.dataset.down = 'true';
            this.input.setButtonDown(SOURCE, button, true);
        });
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

/** No-op on non-touch devices. Twin-stick scenes enable on create, disable on shutdown/fail. */
export function setVirtualPadTwinStick(enabled: boolean): void {
    pad?.setTwinStick(enabled);
}
