import { describe, expect, it } from 'vitest';
import {
    CONTROL_LOCK_MS,
    FLICKER_INTERVAL_MS,
    HitState,
    INVULN_MS,
    KNOCKBACK_VX,
    KNOCKBACK_VY,
    computeKnockback
} from '../src/scenes/minigames/jump-quest/knockback';

const WORLD_W = 1280;

describe('jump-quest computeKnockback', () => {
    it('pushes away from a hazard on the left', () => {
        const kb = computeKnockback(700, 650, WORLD_W);
        expect(kb.vx).toBe(KNOCKBACK_VX);
        expect(kb.vy).toBe(KNOCKBACK_VY);
    });

    it('pushes away from a hazard on the right', () => {
        const kb = computeKnockback(600, 650, WORLD_W);
        expect(kb.vx).toBe(-KNOCKBACK_VX);
    });

    it('always pops upward', () => {
        expect(computeKnockback(0, 100, WORLD_W).vy).toBeLessThan(0);
        expect(computeKnockback(100, 0, WORLD_W).vy).toBeLessThan(0);
    });

    it('a dead-center hit pushes toward the roomier side of the world', () => {
        expect(computeKnockback(200, 200, WORLD_W).vx).toBe(KNOCKBACK_VX); // left half → pushed right
        expect(computeKnockback(1100, 1100, WORLD_W).vx).toBe(-KNOCKBACK_VX); // right half → pushed left
    });
});

describe('jump-quest HitState', () => {
    it('starts hittable and not control-locked', () => {
        const s = new HitState();
        expect(s.canBeHit(0)).toBe(true);
        expect(s.controlLocked(0)).toBe(false);
        expect(s.flickerVisible(0)).toBe(true);
    });

    it('is invulnerable for exactly INVULN_MS after a hit', () => {
        const s = new HitState();
        expect(s.hit(1000)).toBe(true);
        expect(s.canBeHit(1000)).toBe(false);
        expect(s.canBeHit(1000 + INVULN_MS - 1)).toBe(false);
        expect(s.canBeHit(1000 + INVULN_MS)).toBe(true);
    });

    it('locks controls for exactly CONTROL_LOCK_MS', () => {
        const s = new HitState();
        s.hit(1000);
        expect(s.controlLocked(1000)).toBe(true);
        expect(s.controlLocked(1000 + CONTROL_LOCK_MS - 1)).toBe(true);
        expect(s.controlLocked(1000 + CONTROL_LOCK_MS)).toBe(false);
    });

    it('ignores a second hit during i-frames', () => {
        const s = new HitState();
        expect(s.hit(1000)).toBe(true);
        expect(s.hit(1500)).toBe(false);
        // the original schedule stands: still invulnerable relative to the FIRST hit
        expect(s.canBeHit(1000 + INVULN_MS)).toBe(true);
    });

    it('accepts a new hit once the i-frames end', () => {
        const s = new HitState();
        s.hit(1000);
        expect(s.hit(1000 + INVULN_MS)).toBe(true);
        expect(s.canBeHit(1000 + INVULN_MS + 1)).toBe(false);
    });

    it('flickers on the interval grid while invulnerable, steady otherwise', () => {
        const s = new HitState();
        s.hit(1000);
        expect(s.flickerVisible(1000)).toBe(true);
        expect(s.flickerVisible(1000 + FLICKER_INTERVAL_MS)).toBe(false);
        expect(s.flickerVisible(1000 + 2 * FLICKER_INTERVAL_MS)).toBe(true);
        expect(s.flickerVisible(1000 + 3 * FLICKER_INTERVAL_MS)).toBe(false);
        expect(s.flickerVisible(1000 + INVULN_MS)).toBe(true);
        expect(s.flickerVisible(1000 + INVULN_MS + 5 * FLICKER_INTERVAL_MS)).toBe(true);
    });

    it('reset() clears everything (scene reuse)', () => {
        const s = new HitState();
        s.hit(1000);
        s.reset();
        expect(s.canBeHit(1001)).toBe(true);
        expect(s.controlLocked(1001)).toBe(false);
        expect(s.flickerVisible(1050)).toBe(true);
    });
});
