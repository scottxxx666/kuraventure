import { describe, expect, it, vi } from 'vitest';
import { InputService } from '../src/input/InputService';

describe('InputService direction merging', () => {
    it('defaults to zero before any source reports', () => {
        const input = new InputService();
        expect(input.direction()).toEqual({ x: 0, y: 0 });
    });

    it('passes through a single source', () => {
        const input = new InputService();
        input.setDirection('keyboard', 1, 0);
        expect(input.direction()).toEqual({ x: 1, y: 0 });
    });

    it('normalizes vectors longer than 1 (keyboard diagonal)', () => {
        const input = new InputService();
        input.setDirection('keyboard', 1, 1);
        const dir = input.direction();
        expect(dir.x).toBeCloseTo(Math.SQRT1_2);
        expect(dir.y).toBeCloseTo(Math.SQRT1_2);
    });

    it('keeps sub-unit magnitudes (analog joystick)', () => {
        const input = new InputService();
        input.setDirection('virtualpad', 0.5, 0);
        expect(input.direction()).toEqual({ x: 0.5, y: 0 });
    });

    it('most recent non-zero source wins', () => {
        const input = new InputService();
        input.setDirection('keyboard', 1, 0);
        input.setDirection('virtualpad', 0, 1);
        expect(input.direction()).toEqual({ x: 0, y: 1 });
        input.setDirection('keyboard', -1, 0);
        expect(input.direction()).toEqual({ x: -1, y: 0 });
    });

    it('follows the active source back to zero instead of falling back to a stale source', () => {
        const input = new InputService();
        input.setDirection('keyboard', 1, 0);
        input.setDirection('virtualpad', 0, 1);
        input.setDirection('virtualpad', 0, 0);
        expect(input.direction()).toEqual({ x: 0, y: 0 });
    });

    it('a zero report from an inactive source does not steal control', () => {
        const input = new InputService();
        input.setDirection('keyboard', 1, 0);
        input.setDirection('virtualpad', 0, 0);
        expect(input.direction()).toEqual({ x: 1, y: 0 });
    });
});

describe('InputService buttons', () => {
    it('isDown reflects any source holding the button', () => {
        const input = new InputService();
        expect(input.isDown('A')).toBe(false);
        input.setButtonDown('keyboard', 'A', true);
        input.setButtonDown('virtualpad', 'A', true);
        input.setButtonDown('keyboard', 'A', false);
        expect(input.isDown('A')).toBe(true);
        input.setButtonDown('virtualpad', 'A', false);
        expect(input.isDown('A')).toBe(false);
    });

    it('tracks buttons independently', () => {
        const input = new InputService();
        input.setButtonDown('keyboard', 'B', true);
        expect(input.isDown('A')).toBe(false);
        expect(input.isDown('B')).toBe(true);
    });

    it('onPress fires once per down edge', () => {
        const input = new InputService();
        const cb = vi.fn();
        input.onPress('A', cb);
        input.setButtonDown('keyboard', 'A', true);
        input.setButtonDown('keyboard', 'A', true); // held, no new edge
        expect(cb).toHaveBeenCalledTimes(1);
        input.setButtonDown('keyboard', 'A', false);
        input.setButtonDown('keyboard', 'A', true);
        expect(cb).toHaveBeenCalledTimes(2);
    });

    it('a second source pressing an already-held button is not a new edge', () => {
        const input = new InputService();
        const cb = vi.fn();
        input.onPress('A', cb);
        input.setButtonDown('keyboard', 'A', true);
        input.setButtonDown('virtualpad', 'A', true);
        expect(cb).toHaveBeenCalledTimes(1);
        // Releasing only one source keeps the button down — still no edge on re-press.
        input.setButtonDown('virtualpad', 'A', false);
        input.setButtonDown('virtualpad', 'A', true);
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it('does not fire for the other button', () => {
        const input = new InputService();
        const cb = vi.fn();
        input.onPress('B', cb);
        input.setButtonDown('keyboard', 'A', true);
        expect(cb).not.toHaveBeenCalled();
    });

    it('onPress unsubscribe stops further calls', () => {
        const input = new InputService();
        const cb = vi.fn();
        const off = input.onPress('A', cb);
        input.setButtonDown('keyboard', 'A', true);
        off();
        input.setButtonDown('keyboard', 'A', false);
        input.setButtonDown('keyboard', 'A', true);
        expect(cb).toHaveBeenCalledTimes(1);
    });
});
