import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import type { TriggerDef } from '../src/config/stages';
import { EventBus } from '../src/core/EventBus';
import { FlowDirector } from '../src/core/FlowDirector';
import { SceneKeys } from '../src/scenes/keys';
import { ProgressService } from '../src/services/ProgressService';

function makeDirector() {
    const scenes = {
        isActive: vi.fn((_key: string) => false),
        isPaused: vi.fn((_key: string) => false),
        isSleeping: vi.fn((_key: string) => false),
        start: vi.fn(),
        stop: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn()
    };
    const bus = new EventBus();
    const progress = new ProgressService();
    const director = new FlowDirector(bus, progress);
    director.init({ scene: scenes } as unknown as Phaser.Game);
    return { director, bus, progress, scenes };
}

function makeMiniGameTrigger(overrides: Partial<TriggerDef> = {}): TriggerDef {
    return {
        id: 'template-minigame',
        at: { objectName: 'trigger-template' },
        activity: { type: 'minigame', sceneKey: SceneKeys.TemplateMiniGame },
        required: true,
        once: true,
        ...overrides
    };
}

describe('FlowDirector.startStage', () => {
    it('stops the running flow scene and starts WorldScene with the StageDef', () => {
        const { director, scenes } = makeDirector();
        scenes.isActive.mockImplementation((key: string) => key === SceneKeys.MainMenu);

        director.startStage('demo');

        expect(scenes.stop).toHaveBeenCalledWith(SceneKeys.MainMenu);
        expect(scenes.start).toHaveBeenCalledWith(
            SceneKeys.World,
            expect.objectContaining({ stage: expect.objectContaining({ id: 'demo' }) })
        );
    });

    it('throws before init(game)', () => {
        const director = new FlowDirector(new EventBus(), new ProgressService());
        expect(() => director.startStage('demo')).toThrow(/init\(game\)/);
    });
});

describe('FlowDirector activity dispatch', () => {
    it('pauses the world and starts the mini-game scene with { activity, flagId }', () => {
        const { bus, scenes } = makeDirector();
        const trigger = makeMiniGameTrigger();

        bus.emit('activity:start', { stageId: 'demo', trigger });

        expect(scenes.pause).toHaveBeenCalledWith(SceneKeys.World);
        expect(scenes.start).toHaveBeenCalledWith(SceneKeys.TemplateMiniGame, {
            activity: trigger.activity,
            flagId: 'demo/template-minigame'
        });
    });

    it('ignores a second activity:start while an activity is running', () => {
        const { bus, scenes } = makeDirector();

        bus.emit('activity:start', { stageId: 'demo', trigger: makeMiniGameTrigger() });
        bus.emit('activity:start', { stageId: 'demo', trigger: makeMiniGameTrigger({ id: 'other' }) });

        expect(scenes.start).toHaveBeenCalledTimes(1);
        expect(scenes.pause).toHaveBeenCalledTimes(1);
    });

    it('rejects video activities until milestone 7', () => {
        const { bus } = makeDirector();
        const trigger = makeMiniGameTrigger({
            activity: { type: 'video', videoKey: 'v', videoUrl: 'assets/video/v.mp4', skippable: true }
        });

        expect(() => bus.emit('activity:start', { stageId: 'demo', trigger })).toThrow(/milestone 7/);
    });
});

describe('FlowDirector completion handling', () => {
    it('stops the activity scene, records the flag, and resumes the world', () => {
        const { bus, progress, scenes } = makeDirector();
        bus.emit('activity:start', { stageId: 'demo', trigger: makeMiniGameTrigger() });

        bus.emit('activity:complete', { flagId: 'demo/template-minigame' });

        expect(scenes.stop).toHaveBeenCalledWith(SceneKeys.TemplateMiniGame);
        expect(progress.isCompleted('demo/template-minigame')).toBe(true);
        expect(scenes.resume).toHaveBeenCalledWith(SceneKeys.World);
    });

    it('ignores activity:complete when no activity is running', () => {
        const { bus, progress, scenes } = makeDirector();

        bus.emit('activity:complete', { flagId: 'demo/template-minigame' });

        expect(scenes.stop).not.toHaveBeenCalled();
        expect(scenes.resume).not.toHaveBeenCalled();
        expect(progress.isCompleted('demo/template-minigame')).toBe(false);
    });

    it('accepts a new activity after the previous one completes', () => {
        const { bus, scenes } = makeDirector();
        bus.emit('activity:start', { stageId: 'demo', trigger: makeMiniGameTrigger() });
        bus.emit('activity:complete', { flagId: 'demo/template-minigame' });

        bus.emit('activity:start', { stageId: 'demo', trigger: makeMiniGameTrigger({ id: 'other' }) });

        expect(scenes.start).toHaveBeenCalledTimes(2);
        expect(scenes.start).toHaveBeenLastCalledWith(
            SceneKeys.TemplateMiniGame,
            expect.objectContaining({ flagId: 'demo/other' })
        );
    });

    it('stops a still-running activity when a stage is (re)started', () => {
        const { bus, director, scenes } = makeDirector();
        bus.emit('activity:start', { stageId: 'demo', trigger: makeMiniGameTrigger() });

        director.startStage('demo');

        expect(scenes.stop).toHaveBeenCalledWith(SceneKeys.TemplateMiniGame);
        // The director is idle again: new activities dispatch normally.
        bus.emit('activity:start', { stageId: 'demo', trigger: makeMiniGameTrigger() });
        expect(scenes.pause).toHaveBeenCalledTimes(2);
    });
});
