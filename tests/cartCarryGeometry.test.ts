import { describe, expect, it } from 'vitest';
import { constrainSpan } from '../src/scenes/minigames/cart-carry/geometry';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
    Math.hypot(b.x - a.x, b.y - a.y);
const mid = (a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
});

describe('cart-carry constrainSpan', () => {
    it('is a no-op when the distance is inside the range', () => {
        const a = { x: 0, y: 0 };
        const b = { x: 400, y: 0 };
        const [na, nb] = constrainSpan(a, b, 352, 544);
        expect(na).toEqual(a);
        expect(nb).toEqual(b);
    });

    it('is a no-op exactly on the bounds', () => {
        const [na, nb] = constrainSpan({ x: 0, y: 0 }, { x: 544, y: 0 }, 352, 544);
        expect(dist(na, nb)).toBe(544);
        expect(na).toEqual({ x: 0, y: 0 });
    });

    it('pulls both points symmetrically onto maxD when stretched too far', () => {
        const a = { x: 0, y: 0 };
        const b = { x: 800, y: 0 };
        const [na, nb] = constrainSpan(a, b, 352, 544);
        expect(dist(na, nb)).toBeCloseTo(544);
        expect(mid(na, nb)).toEqual(mid(a, b));
        expect(na.x).toBeCloseTo(128);
        expect(nb.x).toBeCloseTo(672);
    });

    it('pushes both points symmetrically onto minD when squeezed too close', () => {
        const a = { x: 400, y: 400 };
        const b = { x: 560, y: 400 };
        const [na, nb] = constrainSpan(a, b, 352, 544);
        expect(dist(na, nb)).toBeCloseTo(352);
        expect(mid(na, nb)).toEqual(mid(a, b));
    });

    it('preserves the segment direction', () => {
        const a = { x: 0, y: 0 };
        const b = { x: 480, y: 640 }; // dist 800, direction 3-4-5
        const [na, nb] = constrainSpan(a, b, 352, 544);
        expect(dist(na, nb)).toBeCloseTo(544);
        expect((nb.y - na.y) / (nb.x - na.x)).toBeCloseTo(640 / 480);
    });

    it('separates coincident points horizontally to minD around the midpoint', () => {
        const [na, nb] = constrainSpan({ x: 200, y: 240 }, { x: 200, y: 240 }, 352, 544);
        expect(na).toEqual({ x: 200 - 176, y: 240 });
        expect(nb).toEqual({ x: 200 + 176, y: 240 });
        expect(dist(na, nb)).toBe(352);
    });

    it('never mutates its inputs and returns fresh objects', () => {
        const a = { x: 0, y: 0 };
        const b = { x: 800, y: 0 };
        const [na, nb] = constrainSpan(a, b, 352, 544);
        expect(a).toEqual({ x: 0, y: 0 });
        expect(b).toEqual({ x: 800, y: 0 });
        expect(na).not.toBe(a);
        expect(nb).not.toBe(b);
        const [ia, ib] = constrainSpan(a, { x: 400, y: 0 }, 352, 544);
        expect(ia).not.toBe(a);
        expect(ib).toBeDefined();
    });
});
