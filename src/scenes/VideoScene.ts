import Phaser from 'phaser';
import type { ActivityRef } from '../config/stages';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/dimensions';
import { eventBus } from '../core/EventBus';
import { setVirtualPadVisible } from '../input/VirtualPadSource';
import { i18nService } from '../services/I18nService';
import { subtitleEngine } from '../subtitles/SubtitleEngine';
import { VideoClock } from '../subtitles/VideoClock';
import { getOverlayRoot } from '../ui/domOverlay';
import { SceneKeys } from './keys';
import { applyPixelCamera, makeVideoSmooth } from './pixelCamera';

type VideoActivity = Extract<ActivityRef, { type: 'video' }>;

/** Scene data FlowDirector passes when launching a video activity. */
export interface VideoSceneData {
    activity: ActivityRef;
    flagId: string;
}

/**
 * THE generic cutscene player (PLAN.md §3.6): one scene serves every video
 * activity, parameterized by its ActivityRef. Launched by FlowDirector over
 * the paused world like any other activity; emits activity:complete when the
 * video ends or is skipped. Subtitles run on the video's own clock
 * (VideoClock), so they stay in sync with pauses/stalls for free.
 */
export class VideoScene extends Phaser.Scene {
    private activity!: VideoActivity;
    private flagId!: string;
    private completed = false;

    constructor() {
        super(SceneKeys.Video);
    }

    init(data: VideoSceneData): void {
        if (data?.activity?.type !== 'video' || !data.flagId) {
            throw new Error(
                `${SceneKeys.Video} needs a video ActivityRef — videos are launched by FlowDirector via a stage trigger`
            );
        }
        this.activity = data.activity;
        this.flagId = data.flagId;
        this.completed = false; // the same scene instance is reused across launches
    }

    preload(): void {
        if (!this.cache.video.exists(this.activity.videoKey)) {
            this.load.video(this.activity.videoKey, this.activity.videoUrl);
        }
    }

    create(): void {
        applyPixelCamera(this);
        this.cameras.main.setBackgroundColor('#000');

        // Playing with audio is allowed because activities always start from a
        // user gesture (PLAN.md §3.6); if a browser still blocks it, fall back
        // to muted + "tap to enable sound" (verify on first real cutscene).
        const video = this.add.video(GAME_WIDTH / 2, GAME_HEIGHT / 2, this.activity.videoKey);
        makeVideoSmooth(this, video);
        // Dimensions arrive with the metadata; fit() now covers cached videos.
        const fit = (): void => {
            if (video.width > 0 && video.height > 0) {
                const scale = Math.min(GAME_WIDTH / video.width, GAME_HEIGHT / video.height);
                video.setDisplaySize(video.width * scale, video.height * scale);
            }
        };
        video.on(Phaser.GameObjects.Events.VIDEO_METADATA, fit);
        fit();
        video.once(Phaser.GameObjects.Events.VIDEO_COMPLETE, () => this.completeActivity());
        video.play();

        if (this.activity.subtitleTrackId) {
            subtitleEngine
                .play(this.activity.subtitleTrackId, new VideoClock(video))
                .catch((err: unknown) => console.warn(err));
        }

        const skip = this.activity.skippable ? this.createSkipButton() : null;

        // The virtual pad hides while a video is active (PLAN.md §3.10).
        setVirtualPadVisible(false);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            video.stop();
            subtitleEngine.stop();
            skip?.destroy();
            // Videos only launch over the world, which resumes underneath.
            setVirtualPadVisible(true);
        });
    }

    update(): void {
        subtitleEngine.update();
    }

    /**
     * Localized Skip button (DOM per PLAN.md §3.8), hidden until any
     * key/pointer reveals it; clicking it skips the video (§3.6).
     */
    private createSkipButton(): { destroy(): void } {
        const button = document.createElement('button');
        button.className = 'menu-button video-skip';
        button.hidden = true;
        button.addEventListener('click', () => this.completeActivity());
        getOverlayRoot().appendChild(button);

        const renderText = (): void => {
            button.textContent = i18nService.t('video.skip');
        };
        renderText();
        const offLocale = eventBus.on('locale:changed', renderText);

        const reveal = (): void => {
            button.hidden = false;
        };
        // Scene input listeners are removed automatically on scene shutdown.
        this.input.keyboard?.once('keydown', reveal);
        this.input.once('pointerdown', reveal);

        return {
            destroy: (): void => {
                offLocale();
                button.remove();
            }
        };
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
