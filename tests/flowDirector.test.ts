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

function makePickupTrigger(overrides: Partial<TriggerDef> = {}): TriggerDef {
    return {
        id: 'key-pickup',
        at: { objectName: 'pickup-key' },
        activity: { type: 'pickup' },
        grantsItems: ['demo-key'],
        required: false,
        once: true,
        ...overrides
    };
}

function makeDialogueTrigger(overrides: Partial<TriggerDef> = {}): TriggerDef {
    return {
        id: 'npc-join',
        at: { objectName: 'npc-guide' },
        activity: { type: 'dialogue', trackId: 'npc-guide-join' },
        required: false,
        once: true,
        ...overrides
    };
}

function makeVideoTrigger(): TriggerDef {
    return {
        id: 'intro-video',
        at: { objectName: 'trigger-video' },
        activity: {
            type: 'video',
            videoKey: 'video-intro',
            videoUrl: 'assets/video/intro.mp4',
            subtitleTrackId: 'intro-video',
            skippable: true
        },
        required: false,
        once: false
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

    it('routes video activities into the generic VideoScene with { activity, flagId }', () => {
        const { bus, scenes } = makeDirector();
        const trigger = makeVideoTrigger();

        bus.emit('activity:start', { stageId: 'demo', trigger });

        expect(scenes.pause).toHaveBeenCalledWith(SceneKeys.World);
        expect(scenes.start).toHaveBeenCalledWith(SceneKeys.Video, {
            activity: trigger.activity,
            flagId: 'demo/intro-video'
        });
    });

    it('stops VideoScene (not the activity sceneKey) when a video completes', () => {
        const { bus, progress, scenes } = makeDirector();
        bus.emit('activity:start', { stageId: 'demo', trigger: makeVideoTrigger() });

        bus.emit('activity:complete', { flagId: 'demo/intro-video' });

        expect(scenes.stop).toHaveBeenCalledWith(SceneKeys.Video);
        expect(progress.isCompleted('demo/intro-video')).toBe(true);
        expect(scenes.resume).toHaveBeenCalledWith(SceneKeys.World);
    });
});

describe('FlowDirector dialogue dispatch', () => {
    it('routes dialogue activities into the generic DialogueScene with { activity, flagId }', () => {
        const { bus, scenes } = makeDirector();
        const trigger = makeDialogueTrigger();

        bus.emit('activity:start', { stageId: 'demo', trigger });

        expect(scenes.pause).toHaveBeenCalledWith(SceneKeys.World);
        expect(scenes.start).toHaveBeenCalledWith(SceneKeys.Dialogue, {
            activity: trigger.activity,
            flagId: 'demo/npc-join'
        });
    });

    it('a transient run completes without recording the flag, items, or stage', () => {
        const { bus, progress, scenes } = makeDirector();
        const onStageComplete = vi.fn();
        bus.on('stage:complete', onStageComplete);
        bus.emit('activity:start', {
            stageId: 'demo',
            trigger: makeDialogueTrigger({ grantsItems: ['demo-key'] }),
            transient: true
        });

        bus.emit('activity:complete', { flagId: 'demo/npc-join' });

        expect(scenes.stop).toHaveBeenCalledWith(SceneKeys.Dialogue);
        expect(scenes.resume).toHaveBeenCalledWith(SceneKeys.World);
        expect(progress.isCompleted('demo/npc-join')).toBe(false);
        expect(progress.hasItem('demo-key')).toBe(false);
        expect(onStageComplete).not.toHaveBeenCalled();
    });

    it('accepts a new activity after a transient run completes', () => {
        const { bus, scenes } = makeDirector();
        bus.emit('activity:start', { stageId: 'demo', trigger: makeDialogueTrigger(), transient: true });
        bus.emit('activity:complete', { flagId: 'demo/npc-join' });

        bus.emit('activity:start', { stageId: 'demo', trigger: makeMiniGameTrigger() });

        expect(scenes.pause).toHaveBeenCalledTimes(2);
        expect(scenes.start).toHaveBeenLastCalledWith(
            SceneKeys.TemplateMiniGame,
            expect.objectContaining({ flagId: 'demo/template-minigame' })
        );
    });
});

describe('FlowDirector pickup handling', () => {
    it('records the flag and grants items without pausing the world or starting a scene', () => {
        const { bus, progress, scenes } = makeDirector();

        bus.emit('activity:start', { stageId: 'demo', trigger: makePickupTrigger() });

        expect(progress.isCompleted('demo/key-pickup')).toBe(true);
        expect(progress.hasItem('demo-key')).toBe(true);
        expect(scenes.pause).not.toHaveBeenCalled();
        expect(scenes.start).not.toHaveBeenCalled();
    });

    it('a pickup that sets the last required flag completes the stage', () => {
        const { bus, progress } = makeDirector();
        const onStageComplete = vi.fn();
        bus.on('stage:complete', onStageComplete);

        // demo-2's single registered required trigger, collected as a pickup.
        bus.emit('activity:start', {
            stageId: 'demo-2',
            trigger: makePickupTrigger({ id: 'template-minigame', required: true })
        });

        expect(progress.isStageComplete('demo-2')).toBe(true);
        expect(onStageComplete).toHaveBeenCalledWith({ stageId: 'demo-2' });
    });

    it('leaves the director idle so the next activity dispatches normally', () => {
        const { bus, scenes } = makeDirector();
        bus.emit('activity:start', { stageId: 'demo', trigger: makePickupTrigger() });

        bus.emit('activity:start', { stageId: 'demo', trigger: makeMiniGameTrigger() });

        expect(scenes.pause).toHaveBeenCalledTimes(1);
        expect(scenes.start).toHaveBeenCalledTimes(1);
    });
});

describe('FlowDirector item grants', () => {
    it('grants the trigger items when its activity completes', () => {
        const { bus, progress } = makeDirector();
        bus.emit('activity:start', {
            stageId: 'demo',
            trigger: makeMiniGameTrigger({ grantsItems: ['demo-key'] })
        });

        bus.emit('activity:complete', { flagId: 'demo/template-minigame' });

        expect(progress.hasItem('demo-key')).toBe(true);
    });

    it('does not grant items on abort', () => {
        const { bus, progress } = makeDirector();
        bus.emit('activity:start', {
            stageId: 'demo',
            trigger: makeMiniGameTrigger({ grantsItems: ['demo-key'] })
        });

        bus.emit('activity:abort', { flagId: 'demo/template-minigame' });

        expect(progress.hasItem('demo-key')).toBe(false);
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

describe('FlowDirector abort handling', () => {
    it('stops the activity scene and resumes the world WITHOUT recording the flag', () => {
        const { bus, progress, scenes } = makeDirector();
        bus.emit('activity:start', { stageId: 'demo', trigger: makeMiniGameTrigger() });

        bus.emit('activity:abort', { flagId: 'demo/template-minigame' });

        expect(scenes.stop).toHaveBeenCalledWith(SceneKeys.TemplateMiniGame);
        expect(scenes.resume).toHaveBeenCalledWith(SceneKeys.World);
        expect(progress.isCompleted('demo/template-minigame')).toBe(false);
        expect(progress.isStageComplete('demo')).toBe(false);
    });

    it('does not emit stage:complete on abort', () => {
        const { bus } = makeDirector();
        const onStageComplete = vi.fn();
        bus.on('stage:complete', onStageComplete);
        bus.emit('activity:start', { stageId: 'demo', trigger: makeMiniGameTrigger() });

        bus.emit('activity:abort', { flagId: 'demo/template-minigame' });

        expect(onStageComplete).not.toHaveBeenCalled();
    });

    it('ignores activity:abort when no activity is running', () => {
        const { bus, scenes } = makeDirector();

        bus.emit('activity:abort', { flagId: 'demo/template-minigame' });

        expect(scenes.stop).not.toHaveBeenCalled();
        expect(scenes.resume).not.toHaveBeenCalled();
    });

    it('accepts a new activity after an abort (the trigger stays replayable)', () => {
        const { bus, scenes } = makeDirector();
        bus.emit('activity:start', { stageId: 'demo', trigger: makeMiniGameTrigger() });
        bus.emit('activity:abort', { flagId: 'demo/template-minigame' });

        bus.emit('activity:start', { stageId: 'demo', trigger: makeMiniGameTrigger() });

        expect(scenes.start).toHaveBeenCalledTimes(2);
        expect(scenes.pause).toHaveBeenCalledTimes(2);
    });
});

describe('FlowDirector stage completion', () => {
    /** Runs the stage's trigger through the activity lifecycle on the bus. */
    function completeTrigger(bus: EventBus, stageId: string, trigger: TriggerDef): void {
        bus.emit('activity:start', { stageId, trigger });
        bus.emit('activity:complete', { flagId: `${stageId}/${trigger.id}` });
    }

    /** The demo stage's required triggers (template-minigame + npc-join), in order. */
    function completeDemoStage(bus: EventBus): void {
        completeTrigger(bus, 'demo', makeMiniGameTrigger());
        completeTrigger(bus, 'demo', makeDialogueTrigger({ required: true }));
    }

    it('marks the stage complete and emits stage:complete when all required triggers finish', () => {
        const { bus, progress } = makeDirector();
        const onStageComplete = vi.fn();
        bus.on('stage:complete', onStageComplete);

        completeTrigger(bus, 'demo', makeMiniGameTrigger());
        expect(progress.isStageComplete('demo')).toBe(false); // npc-join still pending

        completeTrigger(bus, 'demo', makeDialogueTrigger({ required: true }));

        expect(progress.isStageComplete('demo')).toBe(true);
        expect(onStageComplete).toHaveBeenCalledWith({ stageId: 'demo' });
    });

    it('does not re-announce completion when replaying a completed stage', () => {
        const { bus } = makeDirector();
        const onStageComplete = vi.fn();
        bus.on('stage:complete', onStageComplete);

        completeDemoStage(bus);
        completeDemoStage(bus);

        expect(onStageComplete).toHaveBeenCalledTimes(1);
    });

    it('completing a stage unlocks its next and unlockedBy stages', () => {
        const { bus, progress } = makeDirector();

        completeDemoStage(bus);

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

    it('stage:advance with `to` (a branch exit) starts that stage instead of next', () => {
        const { bus, scenes } = makeDirector();

        bus.emit('stage:advance', { stageId: 'demo', to: 'demo-branch' });

        expect(scenes.start).toHaveBeenCalledWith(
            SceneKeys.World,
            expect.objectContaining({ stage: expect.objectContaining({ id: 'demo-branch' }) })
        );
    });
});
