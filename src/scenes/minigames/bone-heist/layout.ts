/**
 * Bone Heist board layout and zone checks, shared by the scene and its tests
 * (which assert the layout invariants: every ball starts covered, all loot
 * inside the danger circle, the basket safely outside). Pure TS.
 */

import type { Vec2 } from '../../../input/InputService';

export interface Circle {
    x: number;
    y: number;
    r: number;
}

/** The dog sits top-center so a dragging finger never covers its wake cues. */
export const DOG_POS: Vec2 = { x: 640, y: 130 };
/** Drop zone, tucked in a corner away from the loot pile. */
export const BASKET: Circle = { x: 1150, y: 620, r: 110 };

/** Logic circles (grab hit areas are larger, scene-side — touch fairness). */
export const BALL_RADIUS = 34;
export const BONE_RADIUS = 60;

/** Drag clamp: keeps loot on screen and away from the very top edge. */
export const PLAY_BOUNDS = { minX: 48, minY: 220, maxX: 1232, maxY: 672 };

/** Hand-placed board: every ball starts overlapped by at least one bone. */
export const BALL_STARTS: Vec2[] = [
    { x: 450, y: 380 },
    { x: 640, y: 460 },
    { x: 830, y: 380 }
];
export const BONE_STARTS: Vec2[] = [
    { x: 480, y: 330 },
    { x: 600, y: 410 },
    { x: 790, y: 330 },
    { x: 560, y: 290 },
    { x: 720, y: 500 }
];

export function circlesOverlap(a: Circle, b: Circle): boolean {
    return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;
}

/** A ball counts as covered while ANY bone circle overlaps its circle. */
export function isCovered(ball: Vec2, bones: Vec2[]): boolean {
    return bones.some((bone) =>
        circlesOverlap({ ...ball, r: BALL_RADIUS }, { ...bone, r: BONE_RADIUS })
    );
}

export function isInBasket(p: Vec2): boolean {
    return Math.hypot(p.x - BASKET.x, p.y - BASKET.y) <= BASKET.r;
}

export function clampToPlayBounds(p: Vec2): Vec2 {
    return {
        x: Math.min(Math.max(p.x, PLAY_BOUNDS.minX), PLAY_BOUNDS.maxX),
        y: Math.min(Math.max(p.y, PLAY_BOUNDS.minY), PLAY_BOUNDS.maxY)
    };
}
