import Phaser from 'phaser';
import type { ActivityRef } from '../config/stages';
import { eventBus } from '../core/EventBus';
import { setVirtualPadVisible } from '../input/VirtualPadSource';
import { GameClock } from '../subtitles/GameClock';
import { subtitleEngine } from '../subtitles/SubtitleEngine';
import { getOverlayRoot } from '../ui/domOverlay';
import { SceneKeys } from './keys';

type DialogueActivity = Extract<ActivityRef, { type: 'dialogue' }>;

/** Scene data FlowDirector passes when launching a dialogue activity. */
export interface DialogueSceneData {
    activity: ActivityRef;
    flagId: string;
}

/**
 * THE generic in-world dialogue player (PLAN.md §3.6): one scene serves every
 * dialogue activity, launched by FlowDirector over the paused world (which
 * keeps rendering underneath). Plays the subtitle track on a GameClock fed by
 * this scene's update deltas and shows the active cue's speaker portrait
 * (DOM overlay, §3.8). Emits activity:complete when the track ends.
 */
export class DialogueScene extends Phaser.Scene {
    private activity!: DialogueActivity;
    private flagId!: string;
    private completed = false;
    private clock!: GameClock;
    private portraitEl: HTMLImageElement | null = null;
    private portraitSrc: string | null = null;

    constructor() {
        super(SceneKeys.Dialogue);
    }

    init(data: DialogueSceneData): void {
        if (data?.activity?.type !== 'dialogue' || !data.flagId) {
            throw new Error(
                `${SceneKeys.Dialogue} needs a dialogue ActivityRef — dialogues are launched by FlowDirector via a stage trigger`
            );
        }
        this.activity = data.activity;
        this.flagId = data.flagId;
        // The same scene instance is reused across launches.
        this.completed = false;
        this.clock = new GameClock();
        this.portraitSrc = null;
    }

    create(): void {
        subtitleEngine
            .play(this.activity.trackId, this.clock)
            .then(() => this.completeActivity())
            .catch((err: unknown) => {
                // A missing track must not soft-lock the game behind a paused world.
                console.warn(err);
                this.completeActivity();
            });

        // No input during dialogue, so the virtual pad hides (PLAN.md §3.10).
        setVirtualPadVisible(false);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            subtitleEngine.stop();
            this.portraitEl?.remove();
            this.portraitEl = null;
            // Dialogues only launch over the world, which resumes underneath.
            setVirtualPadVisible(true);
        });
    }

    update(_time: number, delta: number): void {
        this.clock.advance(delta);
        subtitleEngine.update();
        this.syncPortrait();
    }

    /** Shows the portrait mapped to the active cue's speaker; none → hidden. */
    private syncPortrait(): void {
        const speaker = subtitleEngine.getActiveCue()?.speaker;
        const src = (speaker && this.activity.portraits?.[speaker]) || null;
        if (src === this.portraitSrc) {
            return;
        }
        this.portraitSrc = src;
        if (!src) {
            if (this.portraitEl) {
                this.portraitEl.hidden = true;
            }
            return;
        }
        if (!this.portraitEl) {
            this.portraitEl = document.createElement('img');
            this.portraitEl.className = 'dialogue-portrait';
            this.portraitEl.alt = '';
            getOverlayRoot().appendChild(this.portraitEl);
        }
        this.portraitEl.src = src;
        this.portraitEl.hidden = false;
    }

    /** Emits activity:complete once; FlowDirector stops this scene and resumes the world. */
    private completeActivity(): void {
        if (this.completed) {
            return;
        }
        this.completed = true;
        eventBus.emit('activity:complete', { flagId: this.flagId });
    }
}
