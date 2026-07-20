import { describe, expect, it } from 'vitest';
import {
    BALL_STARTS,
    BASKET,
    BONE_STARTS,
    DANGER_RADIUS,
    DOG_POS,
    PLAY_BOUNDS,
    circlesOverlap,
    clampToPlayBounds,
    isCovered,
    isInBasket,
    isInDanger
} from '../src/scenes/minigames/bone-heist/layout';

describe('bone-heist circle checks', () => {
    it('circlesOverlap: touching edges do not count, closer does', () => {
        const a = { x: 0, y: 0, r: 10 };
        expect(circlesOverlap(a, { x: 20, y: 0, r: 10 })).toBe(false);
        expect(circlesOverlap(a, { x: 19.9, y: 0, r: 10 })).toBe(true);
        expect(circlesOverlap(a, { x: 0, y: 0, r: 1 })).toBe(true);
    });

    it('isCovered: any one bone in range covers; none in range does not', () => {
        const ball = { x: 400, y: 400 };
        expect(isCovered(ball, [{ x: 400, y: 460 }])).toBe(true);
        expect(isCovered(ball, [{ x: 400, y: 500 }])).toBe(false);
        expect(isCovered(ball, [{ x: 400, y: 500 }, { x: 440, y: 400 }])).toBe(true);
        expect(isCovered(ball, [])).toBe(false);
    });

    it('isInDanger: inside and on the edge count, outside does not', () => {
        expect(isInDanger(DOG_POS)).toBe(true);
        expect(isInDanger({ x: DOG_POS.x + DANGER_RADIUS, y: DOG_POS.y })).toBe(true);
        expect(isInDanger({ x: DOG_POS.x + DANGER_RADIUS + 1, y: DOG_POS.y })).toBe(false);
    });

    it('isInBasket: inside and on the edge count, outside does not', () => {
        expect(isInBasket({ x: BASKET.x, y: BASKET.y })).toBe(true);
        expect(isInBasket({ x: BASKET.x - BASKET.r, y: BASKET.y })).toBe(true);
        expect(isInBasket({ x: BASKET.x - BASKET.r - 1, y: BASKET.y })).toBe(false);
    });

    it('clampToPlayBounds clamps each axis independently', () => {
        expect(clampToPlayBounds({ x: 0, y: 400 })).toEqual({ x: PLAY_BOUNDS.minX, y: 400 });
        expect(clampToPlayBounds({ x: 2000, y: 100 })).toEqual({
            x: PLAY_BOUNDS.maxX,
            y: PLAY_BOUNDS.minY
        });
        expect(clampToPlayBounds({ x: 640, y: 400 })).toEqual({ x: 640, y: 400 });
    });
});

describe('bone-heist board invariants', () => {
    it('every ball starts covered by at least one bone', () => {
        for (const ball of BALL_STARTS) {
            expect(isCovered(ball, BONE_STARTS)).toBe(true);
        }
    });

    it('all loot starts inside the danger circle — the risk is real', () => {
        for (const p of [...BALL_STARTS, ...BONE_STARTS]) {
            expect(isInDanger(p)).toBe(true);
        }
    });

    it('all loot starts inside the drag bounds', () => {
        for (const p of [...BALL_STARTS, ...BONE_STARTS]) {
            expect(clampToPlayBounds(p)).toEqual(p);
        }
    });

    it('the basket sits outside the danger circle — delivering is always safe', () => {
        expect(isInDanger({ x: BASKET.x, y: BASKET.y })).toBe(false);
    });

    it('the basket is reachable inside the drag bounds', () => {
        expect(clampToPlayBounds({ x: BASKET.x, y: BASKET.y })).toEqual({ x: BASKET.x, y: BASKET.y });
    });
});
