import { describe, expect, it } from 'vitest';
import {
    cycleTimings,
    initialDogState,
    stepDog
} from '../src/scenes/minigames/bone-heist/dogCycle';
import { NOISE_MAX } from '../src/scenes/minigames/bone-heist/noise';

const T = cycleTimings();

describe('bone-heist cycleTimings', () => {
    it('harder = shorter sleeps, longer awake spells, same telegraph', () => {
        const easy = cycleTimings(1);
        const hard = cycleTimings(1.5);
        expect(hard.sleepMs).toBeLessThan(easy.sleepMs);
        expect(hard.awakeMs).toBeGreaterThan(easy.awakeMs);
        expect(hard.stirMs).toBe(easy.stirMs);
    });

    it('caps the awake window at extreme hardness', () => {
        expect(cycleTimings(10).awakeMs).toBe(cycleTimings(100).awakeMs);
    });
});

describe('bone-heist stepDog', () => {
    it('starts asleep with the full sleep clock', () => {
        expect(initialDogState(T)).toEqual({ phase: 'sleep', remainingMs: T.sleepMs });
    });

    it('a silent player sees the phases in order at their real lengths', () => {
        let dog = initialDogState(T);
        dog = stepDog(dog, T.sleepMs - 1, 0, T);
        expect(dog.phase).toBe('sleep');
        dog = stepDog(dog, 1, 0, T);
        expect(dog.phase).toBe('stir');
        expect(dog.remainingMs).toBe(T.stirMs);
        dog = stepDog(dog, T.stirMs, 0, T);
        expect(dog.phase).toBe('awake');
        dog = stepDog(dog, T.awakeMs, 0, T);
        expect(dog.phase).toBe('sleep');
        expect(dog.remainingMs).toBe(T.sleepMs);
    });

    it('carries leftover delta across a boundary without skipping the stir', () => {
        const dog = stepDog(initialDogState(T), T.sleepMs + T.stirMs / 2, 0, T);
        expect(dog.phase).toBe('stir');
        expect(dog.remainingMs).toBeCloseTo(T.stirMs / 2);
    });

    it('full noise drains the sleep clock (1 + noiseAccel)× faster', () => {
        const dog = stepDog(initialDogState(T), 1000, NOISE_MAX, T);
        expect(dog.phase).toBe('sleep');
        expect(dog.remainingMs).toBeCloseTo(T.sleepMs - 1000 * (1 + T.noiseAccel));
    });

    it('half noise scales the sleep clock proportionally', () => {
        const dog = stepDog(initialDogState(T), 1000, NOISE_MAX / 2, T);
        expect(dog.remainingMs).toBeCloseTo(T.sleepMs - 1000 * (1 + T.noiseAccel / 2));
    });

    it('noise never touches the stir or awake clocks', () => {
        const stirring = { phase: 'stir' as const, remainingMs: T.stirMs };
        expect(stepDog(stirring, 400, NOISE_MAX, T).remainingMs).toBeCloseTo(T.stirMs - 400);
        const awake = { phase: 'awake' as const, remainingMs: T.awakeMs };
        expect(stepDog(awake, 400, NOISE_MAX, T).remainingMs).toBeCloseTo(T.awakeMs - 400);
    });

    it('a noisy boundary crossing spends only the real time the sleep needed', () => {
        // Sleep finishes in sleepMs / (1 + accel) real ms at full noise; the
        // rest of the step ticks the stir in real time.
        const speed = 1 + T.noiseAccel;
        const realToWake = T.sleepMs / speed;
        const dog = stepDog(initialDogState(T), realToWake + 100, NOISE_MAX, T);
        expect(dog.phase).toBe('stir');
        expect(dog.remainingMs).toBeCloseTo(T.stirMs - 100);
    });
});
