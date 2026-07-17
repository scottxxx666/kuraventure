/**
 * Knockback rules for Jump Quest — pure and timestamp-driven so the scene
 * stays thin and everything here is unit-testable. There is no HP and no
 * fail: a hit just throws the player (usually off the platform), classic
 * Forest-of-Patience style.
 */

export const KNOCKBACK_VX = 520; // px/s away from the hazard
export const KNOCKBACK_VY = -420; // px/s small upward pop so the throw clears edges
export const CONTROL_LOCK_MS = 300; // walk input ignored so the knock actually lands
export const INVULN_MS = 1000; // no second hit while flickering
export const FLICKER_INTERVAL_MS = 100;

export interface Knockback {
    vx: number;
    vy: number;
}

/** Direction is away from the hazard; a dead-center hit pushes toward the roomier side. */
export function computeKnockback(playerX: number, hazardX: number, worldWidth: number): Knockback {
    let dir = Math.sign(playerX - hazardX);
    if (dir === 0) {
        dir = playerX < worldWidth / 2 ? 1 : -1;
    }
    return { vx: dir * KNOCKBACK_VX, vy: KNOCKBACK_VY };
}

/** Tracks the last hit; all queries take the current time, no internal timers. */
export class HitState {
    private hitAtMs = Number.NEGATIVE_INFINITY;

    /** Records a hit; ignored (returns false) while still invulnerable. */
    hit(nowMs: number): boolean {
        if (!this.canBeHit(nowMs)) {
            return false;
        }
        this.hitAtMs = nowMs;
        return true;
    }

    canBeHit(nowMs: number): boolean {
        return nowMs - this.hitAtMs >= INVULN_MS;
    }

    controlLocked(nowMs: number): boolean {
        return nowMs - this.hitAtMs < CONTROL_LOCK_MS;
    }

    /** 100ms square wave while invulnerable; steady visible otherwise. */
    flickerVisible(nowMs: number): boolean {
        if (this.canBeHit(nowMs)) {
            return true;
        }
        return Math.floor((nowMs - this.hitAtMs) / FLICKER_INTERVAL_MS) % 2 === 0;
    }

    reset(): void {
        this.hitAtMs = Number.NEGATIVE_INFINITY;
    }
}
