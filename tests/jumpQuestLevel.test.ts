import { describe, expect, it } from 'vitest';
import { CYCLE_MS } from '../src/scenes/minigames/jump-quest/cycle';
import { LEVEL, validateLevel } from '../src/scenes/minigames/jump-quest/level';
import type { JumpQuestLevel } from '../src/scenes/minigames/jump-quest/level';
import { MAX_GAP_X, MAX_RISE } from '../src/scenes/minigames/jump-quest/physics';

/** Minimal valid tower: ground + one platform, goal right above it. */
const base = (): JumpQuestLevel => ({
    worldWidth: 1280,
    worldHeight: 1000,
    spawn: { x: 640, y: 900 },
    goal: { x: 640, y: 700, width: 200, height: 100 },
    platforms: [
        { x: 640, y: 950, width: 1280, kind: 'static' },
        { x: 640, y: 820, width: 300, kind: 'static' }
    ],
    monsters: [],
    flyers: []
});

describe('jump-quest validateLevel', () => {
    it('accepts the minimal valid level', () => {
        expect(validateLevel(base())).toEqual([]);
    });

    it('rejects a platform with too big a rise', () => {
        const level = base();
        level.platforms[1].y = 950 - (MAX_RISE + 1);
        expect(validateLevel(level).join()).toContain('unreachable');
    });

    it('rejects a platform with too wide a horizontal gap', () => {
        const level = base();
        // Narrow ground on the far left; platform 1 far right → edge gap > MAX_GAP_X.
        level.platforms[0] = { x: 100, y: 950, width: 200, kind: 'static' };
        level.spawn = { x: 100, y: 900 };
        level.platforms[1] = { x: 200 + MAX_GAP_X + 1 + 150, y: 820, width: 300, kind: 'static' };
        level.goal.x = level.platforms[1].x;
        expect(validateLevel(level).join()).toContain('unreachable');
    });

    it('accepts a rise/gap exactly on the budget', () => {
        const level = base();
        level.platforms[1] = { x: 200 + MAX_GAP_X + 150, y: 950 - MAX_RISE, width: 300, kind: 'static' };
        level.platforms[0] = { x: 100, y: 950, width: 200, kind: 'static' };
        level.spawn = { x: 100, y: 900 };
        level.goal = { x: level.platforms[1].x, y: level.platforms[1].y - 100, width: 200, height: 100 };
        expect(validateLevel(level)).toEqual([]);
    });

    it("counts a moving platform's full patrol envelope toward reachability", () => {
        const level = base();
        // At rest (x=200) the mover's span misses platform 2; its patrol reaches it.
        level.platforms[1] = {
            x: 200,
            y: 820,
            width: 200,
            kind: 'moving',
            patrol: { minX: 200, maxX: 900, speed: 100 }
        };
        level.platforms.push({ x: 1150, y: 690, width: 200, kind: 'static' });
        level.goal = { x: 1150, y: 570, width: 200, height: 100 };
        expect(validateLevel(level)).toEqual([]);
        // Without the patrol reach, the same platform is unreachable.
        level.platforms[1].patrol = { minX: 150, maxX: 250, speed: 100 };
        expect(validateLevel(level).join()).toContain('unreachable');
    });

    it('rejects a goal with no platform underneath', () => {
        const level = base();
        level.goal = { x: 100, y: 700, width: 100, height: 100 }; // no horizontal overlap
        expect(validateLevel(level).join()).toContain('goal');
        const tooHigh = base();
        tooHigh.goal.y = tooHigh.platforms[1].y - (MAX_RISE + 1);
        expect(validateLevel(tooHigh).join()).toContain('goal');
    });

    it('rejects a spawn with no platform underneath', () => {
        const level = base();
        level.platforms[0] = { x: 200, y: 950, width: 300, kind: 'static' };
        level.spawn = { x: 640, y: 900 }; // over the void
        // keep platform 1 reachable from the narrowed ground
        level.platforms[1] = { x: 400, y: 820, width: 300, kind: 'static' };
        level.goal.x = 400;
        expect(validateLevel(level).join()).toContain('spawn');
    });

    it('rejects kind/field mismatches', () => {
        const missingOffset = base();
        missingOffset.platforms[1] = { x: 640, y: 820, width: 300, kind: 'disappearing' };
        expect(validateLevel(missingOffset).join()).toContain('cycleOffsetMs');

        const offsetTooBig = base();
        offsetTooBig.platforms[1] = {
            x: 640,
            y: 820,
            width: 300,
            kind: 'disappearing',
            cycleOffsetMs: CYCLE_MS
        };
        expect(validateLevel(offsetTooBig).join()).toContain('cycleOffsetMs');

        const strayOffset = base();
        strayOffset.platforms[1] = { x: 640, y: 820, width: 300, kind: 'static', cycleOffsetMs: 0 };
        expect(validateLevel(strayOffset).join()).toContain('cycleOffsetMs');

        const missingPatrol = base();
        missingPatrol.platforms[1] = { x: 640, y: 820, width: 300, kind: 'moving' };
        expect(validateLevel(missingPatrol).join()).toContain('patrol');

        const strayPatrol = base();
        strayPatrol.platforms[1] = {
            x: 640,
            y: 820,
            width: 300,
            kind: 'static',
            patrol: { minX: 500, maxX: 700, speed: 100 }
        };
        expect(validateLevel(strayPatrol).join()).toContain('patrol');
    });

    it('rejects a platform that leaves the world', () => {
        const level = base();
        level.platforms[1] = { x: 1200, y: 820, width: 300, kind: 'static' }; // right edge 1350 > 1280
        expect(validateLevel(level).join()).toContain('leaves the world');
    });

    it('rejects monsters on missing, non-static, or overhanging patrols', () => {
        const missing = base();
        missing.monsters = [{ platformIndex: 9, patrol: { minX: 0, maxX: 100, speed: 90 } }];
        expect(validateLevel(missing).join()).toContain('missing platform');

        const offEdge = base();
        offEdge.monsters = [{ platformIndex: 1, patrol: { minX: 400, maxX: 900, speed: 90 } }];
        expect(validateLevel(offEdge).join()).toContain('patrols off its platform');

        const onMover = base();
        onMover.platforms.push({
            x: 640,
            y: 690,
            width: 200,
            kind: 'moving',
            patrol: { minX: 500, maxX: 800, speed: 100 }
        });
        onMover.monsters = [{ platformIndex: 2, patrol: { minX: 600, maxX: 700, speed: 90 } }];
        expect(validateLevel(onMover).join()).toContain('only static platforms');
    });

    it('rejects flyers outside the world or with inverted bounds', () => {
        const level = base();
        level.flyers = [
            { y: -10, minX: 0, maxX: 100, speed: 200, direction: 1 },
            { y: 500, minX: 900, maxX: 100, speed: 200, direction: -1 }
        ];
        const errors = validateLevel(level);
        expect(errors.join()).toContain('flyer 0');
        expect(errors.join()).toContain('flyer 1');
    });

    it('the shipped LEVEL is provably climbable', () => {
        expect(validateLevel(LEVEL)).toEqual([]);
    });
});
