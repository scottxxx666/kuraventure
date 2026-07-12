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
        const b = { x: 100, y: 0 };
        const [na, nb] = constrainSpan(a, b, 88, 136);
        expect(na).toEqual(a);
        expect(nb).toEqual(b);
    });

    it('is a no-op exactly on the bounds', () => {
        const [na, nb] = constrainSpan({ x: 0, y: 0 }, { x: 136, y: 0 }, 88, 136);
        expect(dist(na, nb)).toBe(136);
        expect(na).toEqual({ x: 0, y: 0 });
    });

    it('pulls both points symmetrically onto maxD when stretched too far', () => {
        const a = { x: 0, y: 0 };
        const b = { x: 200, y: 0 };
        const [na, nb] = constrainSpan(a, b, 88, 136);
        expect(dist(na, nb)).toBeCloseTo(136);
        expect(mid(na, nb)).toEqual(mid(a, b));
        expect(na.x).toBeCloseTo(32);
        expect(nb.x).toBeCloseTo(168);
    });

    it('pushes both points symmetrically onto minD when squeezed too close', () => {
        const a = { x: 100, y: 100 };
        const b = { x: 140, y: 100 };
        const [na, nb] = constrainSpan(a, b, 88, 136);
        expect(dist(na, nb)).toBeCloseTo(88);
        expect(mid(na, nb)).toEqual(mid(a, b));
    });

    it('preserves the segment direction', () => {
        const a = { x: 0, y: 0 };
        const b = { x: 120, y: 160 }; // dist 200, direction 3-4-5
        const [na, nb] = constrainSpan(a, b, 88, 136);
        expect(dist(na, nb)).toBeCloseTo(136);
        expect((nb.y - na.y) / (nb.x - na.x)).toBeCloseTo(160 / 120);
    });

    it('separates coincident points horizontally to minD around the midpoint', () => {
        const [na, nb] = constrainSpan({ x: 50, y: 60 }, { x: 50, y: 60 }, 88, 136);
        expect(na).toEqual({ x: 50 - 44, y: 60 });
        expect(nb).toEqual({ x: 50 + 44, y: 60 });
        expect(dist(na, nb)).toBe(88);
    });

    it('never mutates its inputs and returns fresh objects', () => {
        const a = { x: 0, y: 0 };
        const b = { x: 200, y: 0 };
        const [na, nb] = constrainSpan(a, b, 88, 136);
        expect(a).toEqual({ x: 0, y: 0 });
        expect(b).toEqual({ x: 200, y: 0 });
        expect(na).not.toBe(a);
        expect(nb).not.toBe(b);
        const [ia, ib] = constrainSpan(a, { x: 100, y: 0 }, 88, 136);
        expect(ia).not.toBe(a);
        expect(ib).toBeDefined();
    });
});
