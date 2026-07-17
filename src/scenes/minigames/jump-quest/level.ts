import { CYCLE_MS } from './cycle';
import { MAX_GAP_X, MAX_RISE } from './physics';

/**
 * Hand-authored Jump Quest level + a pure validator. The validator proves the
 * layout is climbable against the movement budget in ./physics.ts (tests run
 * it over LEVEL), so difficulty tuning is a data-only edit that can't silently
 * break the route.
 */

export const PLATFORM_H = 32;

/** Horizontal back-and-forth of a center point, px/s. */
export interface PatrolDef {
    minX: number;
    maxX: number;
    speed: number;
}

export interface PlatformDef {
    /** Center x. */
    x: number;
    /** TOP surface y. */
    y: number;
    width: number;
    kind: 'static' | 'disappearing' | 'moving';
    /** Disappearing only: stagger into the shared solid/warn/gone cycle. */
    cycleOffsetMs?: number;
    /** Moving only: patrol of the platform's center. */
    patrol?: PatrolDef;
}

/** Walks on top of the referenced platform (static platforms only). */
export interface MonsterDef {
    platformIndex: number;
    patrol: PatrolDef;
}

/** Crosses the map horizontally at a fixed height, ping-ponging between the bounds. */
export interface FlyerDef {
    y: number;
    minX: number;
    maxX: number;
    speed: number;
    direction: 1 | -1;
}

export interface JumpQuestLevel {
    worldWidth: number;
    worldHeight: number;
    spawn: { x: number; y: number };
    /** Reaching this zone (center x/y) wins. */
    goal: { x: number; y: number; width: number; height: number };
    platforms: PlatformDef[];
    monsters: MonsterDef[];
    flyers: FlyerDef[];
}

/** [left, right] a platform can be stood on — moving platforms count their whole patrol envelope. */
function span(p: PlatformDef): [number, number] {
    if (p.kind === 'moving' && p.patrol) {
        return [p.patrol.minX - p.width / 2, p.patrol.maxX + p.width / 2];
    }
    return [p.x - p.width / 2, p.x + p.width / 2];
}

/** Horizontal edge-to-edge distance between two spans; 0 when they overlap. */
function gapX(a: [number, number], b: [number, number]): number {
    return Math.max(0, a[0] - b[1], b[0] - a[1]);
}

/**
 * Returns [] when the level is valid; human-readable problems otherwise.
 * Reachability rule: every platform except the lowest (the ground) needs at
 * least one platform below it within MAX_RISE vertically and MAX_GAP_X
 * horizontally — i.e. the prescribed jump fits the ./physics.ts budget.
 */
export function validateLevel(level: JumpQuestLevel): string[] {
    const errors: string[] = [];
    const { platforms, worldWidth, worldHeight } = level;

    if (platforms.length === 0) {
        return ['level has no platforms'];
    }

    platforms.forEach((p, i) => {
        const [left, right] = span(p);
        if (left < 0 || right > worldWidth || p.y <= 0 || p.y >= worldHeight) {
            errors.push(`platform ${i} leaves the world (span ${left}–${right}, y ${p.y})`);
        }
        if (p.kind === 'disappearing') {
            if (p.cycleOffsetMs === undefined || p.cycleOffsetMs < 0 || p.cycleOffsetMs >= CYCLE_MS) {
                errors.push(`platform ${i} is disappearing but cycleOffsetMs is missing or outside [0, ${CYCLE_MS})`);
            }
        } else if (p.cycleOffsetMs !== undefined) {
            errors.push(`platform ${i} is ${p.kind} but has cycleOffsetMs`);
        }
        if (p.kind === 'moving') {
            if (!p.patrol) {
                errors.push(`platform ${i} is moving but has no patrol`);
            } else if (p.patrol.minX >= p.patrol.maxX || p.patrol.speed <= 0) {
                errors.push(`platform ${i} has an invalid patrol`);
            }
        } else if (p.patrol) {
            errors.push(`platform ${i} is ${p.kind} but has a patrol`);
        }
    });

    const groundY = Math.max(...platforms.map((p) => p.y));
    platforms.forEach((p, i) => {
        if (p.y === groundY) {
            return; // the ground needs no support
        }
        const reachable = platforms.some(
            (q) => q !== p && q.y > p.y && q.y - p.y <= MAX_RISE && gapX(span(p), span(q)) <= MAX_GAP_X
        );
        if (!reachable) {
            errors.push(`platform ${i} is unreachable (no support within rise ${MAX_RISE} / gap ${MAX_GAP_X})`);
        }
    });

    const { spawn, goal } = level;
    if (
        !platforms.some((p) => {
            const [l, r] = span(p);
            return spawn.x >= l && spawn.x <= r && p.y > spawn.y;
        })
    ) {
        errors.push('spawn has no platform underneath it');
    }

    const goalSpan: [number, number] = [goal.x - goal.width / 2, goal.x + goal.width / 2];
    if (
        !platforms.some((p) => p.y > goal.y && p.y - goal.y <= MAX_RISE && gapX(goalSpan, span(p)) === 0)
    ) {
        errors.push(`goal is not reachable from any platform (needs one below within rise ${MAX_RISE}, overlapping)`);
    }

    level.monsters.forEach((m, i) => {
        const p = platforms[m.platformIndex];
        if (!p) {
            errors.push(`monster ${i} references missing platform ${m.platformIndex}`);
            return;
        }
        if (p.kind !== 'static') {
            errors.push(`monster ${i} stands on a ${p.kind} platform — only static platforms carry monsters`);
        }
        const [l, r] = span(p);
        if (m.patrol.minX >= m.patrol.maxX || m.patrol.speed <= 0) {
            errors.push(`monster ${i} has an invalid patrol`);
        } else if (m.patrol.minX < l || m.patrol.maxX > r) {
            errors.push(`monster ${i} patrols off its platform (${m.patrol.minX}–${m.patrol.maxX} vs ${l}–${r})`);
        }
    });

    level.flyers.forEach((f, i) => {
        if (f.minX >= f.maxX || f.minX < 0 || f.maxX > worldWidth || f.speed <= 0) {
            errors.push(`flyer ${i} has an invalid path`);
        }
        if (f.y <= 0 || f.y >= worldHeight) {
            errors.push(`flyer ${i} flies outside the world (y ${f.y})`);
        }
    });

    return errors;
}

/**
 * The shipped tower: 1280×2160 (3 screens), climbed bottom → top.
 * Bottom third teaches walking/jumping past patrol monsters, the middle is
 * disappearing platforms + flyer lanes, the top mixes moving platforms with
 * the fastest hazards. All rises are 138px, all gaps ≤ 160px (validator caps
 * 150/190). Tuning difficulty = editing numbers here only.
 */
export const LEVEL: JumpQuestLevel = {
    worldWidth: 1280,
    worldHeight: 2160,
    spawn: { x: 200, y: 2080 },
    goal: { x: 640, y: 130, width: 320, height: 130 },
    platforms: [
        // ground
        { x: 640, y: 2128, width: 1280, kind: 'static' },
        // bottom third — statics with patrol monsters
        { x: 320, y: 1990, width: 256, kind: 'static' },
        { x: 704, y: 1852, width: 224, kind: 'static' },
        { x: 1056, y: 1714, width: 256, kind: 'static' },
        { x: 640, y: 1576, width: 288, kind: 'static' },
        { x: 256, y: 1438, width: 224, kind: 'static' },
        // middle third — disappearing steps with a rest ledge
        { x: 560, y: 1300, width: 192, kind: 'disappearing', cycleOffsetMs: 0 },
        { x: 896, y: 1162, width: 192, kind: 'disappearing', cycleOffsetMs: 1300 },
        { x: 1152, y: 1024, width: 192, kind: 'static' },
        { x: 800, y: 886, width: 192, kind: 'disappearing', cycleOffsetMs: 2600 },
        { x: 448, y: 748, width: 192, kind: 'disappearing', cycleOffsetMs: 3900 },
        // top third — moving platforms
        { x: 500, y: 610, width: 192, kind: 'moving', patrol: { minX: 300, maxX: 700, speed: 100 } },
        { x: 1024, y: 472, width: 224, kind: 'static' },
        { x: 650, y: 334, width: 192, kind: 'moving', patrol: { minX: 400, maxX: 900, speed: 120 } },
        // summit
        { x: 640, y: 196, width: 320, kind: 'static' }
    ],
    monsters: [
        { platformIndex: 3, patrol: { minX: 940, maxX: 1170, speed: 90 } },
        { platformIndex: 4, patrol: { minX: 510, maxX: 770, speed: 110 } },
        { platformIndex: 12, patrol: { minX: 925, maxX: 1120, speed: 120 } }
    ],
    flyers: [
        { y: 1230, minX: 64, maxX: 1216, speed: 200, direction: 1 },
        { y: 810, minX: 64, maxX: 1216, speed: 240, direction: -1 },
        { y: 420, minX: 64, maxX: 1216, speed: 260, direction: 1 }
    ]
};
