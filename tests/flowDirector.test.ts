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
    const progress = new ProgressService(null);
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
        const director = new FlowDirector(new EventBus(), new ProgressService(null));
        expect(() => director.startStage('demo')).toThrow(/init\(game\)/);
    });
});

describe('FlowDirector.openStageSelect', () => {
    it('stops the running flow scene and starts StageSelect', () => {
        const { director, scenes } = makeDirector();
        scenes.isActive.mockImplementation((key: string) => key === SceneKeys.MainMenu);

        director.openStageSelect();

        expect(scenes.stop).toHaveBeenCalledWith(SceneKeys.MainMenu);
        expect(scenes.start).toHaveBeenCalledWith(SceneKeys.StageSelect);
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

describe('FlowDirector stage completion', () => {
    /** Runs the stage's trigger through the activity lifecycle on the bus. */
    function completeTrigger(bus: EventBus, stageId: string, trigger: TriggerDef): void {
        bus.emit('activity:start', { stageId, trigger });
        bus.emit('activity:complete', { flagId: `${stageId}/${trigger.id}` });
    }

    it('marks the stage complete and emits stage:complete when all required triggers finish', () => {
        const { bus, progress } = makeDirector();
        const onStageComplete = vi.fn();
        bus.on('stage:complete', onStageComplete);

        completeTrigger(bus, 'demo', makeMiniGameTrigger());

        expect(progress.isStageComplete('demo')).toBe(true);
        expect(onStageComplete).toHaveBeenCalledWith({ stageId: 'demo' });
    });

    it('does not re-announce completion when replaying a completed stage', () => {
        const { bus } = makeDirector();
        const onStageComplete = vi.fn();
        bus.on('stage:complete', onStageComplete);

        completeTrigger(bus, 'demo', makeMiniGameTrigger());
        completeTrigger(bus, 'demo', makeMiniGameTrigger());

        expect(onStageComplete).toHaveBeenCalledTimes(1);
    });

    it('completing a stage unlocks its next and unlockedBy stages', () => {
        const { bus, progress } = makeDirector();

        completeTrigger(bus, 'demo', makeMiniGameTrigger());

        const unlocked = progress.getUnlockedStages().map((s) => s.id);
        expect(unlocked).toEqual(['demo', 'demo-2', 'demo-branch']);
    });

    it('stage:advance starts the next spine stage', () => {
        const { bus, scenes } = makeDirector();

        bus.emit('stage:advance', { stageId: 'demo' });

        expect(scenes.start).toHaveBeenCalledWith(
            SceneKeys.World,
            expect.objectContaining({ stage: expect.objectContaining({ id: 'demo-2' }) })
        );
    });

    it('stage:advance returns to stage select when there is no next stage', () => {
        const { bus, scenes } = makeDirector();

        bus.emit('stage:advance', { stageId: 'demo-2' });

        expect(scenes.start).toHaveBeenCalledWith(SceneKeys.StageSelect);
    });
});
