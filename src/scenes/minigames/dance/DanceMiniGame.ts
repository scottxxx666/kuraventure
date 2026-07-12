import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../config/dimensions';
import { inputService } from '../../../input/InputService';
import { i18nService } from '../../../services/I18nService';
import { createOverlayElement } from '../../../ui/domOverlay';
import { runFailFlow } from '../failFlow';
import { SceneKeys } from '../../keys';
import { MiniGameScene } from '../MiniGameScene';
import { generateBeatMap } from './beatmap';
import { GOOD_WINDOW_MS, SCORE, judge, winScore } from './judgment';
import type { Judgment } from './judgment';
import { LANES, LANE_ROTATION, directionToLane } from './lanes';
import type { Lane } from './lanes';

/**
 * Dance Beat — DDR-style rhythm run. Press A to start the music; arrow notes
 * fall from the top toward the receptor line near the bottom and the player
 * presses the matching direction (keyboard arrows/WASD or joystick flicks) as
 * each note crosses it. The whole song always plays (no mid-run failure); at
 * the end, score >= threshold wins, below runs the shared fail flow
 * (../failFlow.ts).
 * Note times come from the beat map (./beatmap.ts) and are judged/scored by
 * ./judgment.ts. Timing is driven by the music's own clock (seek), falling
 * back to the frame clock while no track exists — drop one at
 * public/assets/audio/dance.mp3 (see that folder's README.md).
 */

const RUN_MS = 60_000; // capped to the music's duration when shorter
const WIN_BEAT_MS = 300; // pause on the final score before completing
const END_TAIL_MS = 800; // judged-last-note → evaluation delay

const APPROACH_MS = 1800; // a note is visible this long before its beat
const HIT_Y = GAME_HEIGHT - 32; // receptor line
const SPAWN_Y = -8; // notes enter from just above the screen
const LANE_SPACING = 36;
const ARROW_SIZE = 16;
const FLASH_MS = 120;

const IDLE_TINT = 0x666666;
const FLASH_TINT: Record<Judgment, number> = { perfect: 0x7cfc7c, good: 0xf0d060 };
const MISS_TINT = 0xe05050;

const TEX_ARROW = 'dance-arrow';
const MUSIC_KEY = 'dance-music';
const ENDING_VIDEO_KEY = 'dance-ending';

type DanceState = 'ready' | 'running' | 'ended';

/** A beat-map note plus its runtime presentation; done = judged or missed. */
interface RuntimeNote {
    timeMs: number;
    lane: Lane;
    sprite: Phaser.GameObjects.Sprite | null;
    done: boolean;
}

export class DanceMiniGame extends MiniGameScene {
    private state: DanceState = 'ready';
    private songTimeMs = 0;
    private endMs = 0;
    private score = 0;
    private notes: RuntimeNote[] = [];
    private heldLane: Lane | null = null;
    private music: Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | null = null;
    private receptors!: Record<Lane, Phaser.GameObjects.Sprite>;
    private promptEl: HTMLElement | null = null;
    private scoreEl: HTMLElement | null = null;
    private failFlowCleanup: (() => void) | null = null;
    private offStart: (() => void) | null = null;

    constructor() {
        super(SceneKeys.Dance);
    }

    preload(): void {
        // The track is optional in the placeholder era — a missing file just
        // logs a loader error and cache.audio stays empty (silent fallback).
        if (!this.cache.audio.exists(MUSIC_KEY)) {
            this.load.audio(MUSIC_KEY, 'assets/audio/dance.mp3');
        }
        if (!this.cache.video.exists(ENDING_VIDEO_KEY)) {
            this.load.video(ENDING_VIDEO_KEY, 'assets/video/dance-ending.mp4');
        }
    }

    create(): void {
        // The same scene instance is reused across launches and restarts.
        this.state = 'ready';
        this.songTimeMs = 0;
        this.endMs = 0;
        this.score = 0;
        this.notes = [];
        this.heldLane = null;
        this.music = null;
        this.scoreEl = null;
        this.failFlowCleanup = null;

        this.cameras.main.setBackgroundColor('#2a1d3d');
        this.ensureArrowTexture();

        this.receptors = {} as Record<Lane, Phaser.GameObjects.Sprite>;
        for (const lane of LANES) {
            this.receptors[lane] = this.add
                .sprite(this.laneX(lane), HIT_Y, TEX_ARROW)
                .setRotation(LANE_ROTATION[lane])
                .setTint(IDLE_TINT);
        }

        this.promptEl = createOverlayElement('hud-prompt');
        this.promptEl.textContent = i18nService.t('minigame.dance.prompt');

        this.offStart = inputService.onPress('A', () => {
            if (this.state === 'ready') {
                this.startRun();
            }
        });

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.promptEl?.remove();
            this.scoreEl?.remove();
            this.offStart?.();
            this.failFlowCleanup?.();
            // Sounds are game-wide, not scene-owned — stop and drop this
            // run's instance or restarts would pile them up.
            this.music?.destroy();
        });
    }

    update(_time: number, delta: number): void {
        if (this.state !== 'running') {
            return;
        }
        this.advanceClock(delta);
        this.detectLanePress();
        this.driveNotes();

        if (this.songTimeMs >= this.endMs) {
            this.finishRun();
        }
    }

    private startRun(): void {
        this.state = 'running';
        this.promptEl?.remove();
        this.promptEl = null;

        // Score readout (text → DOM overlay, §3.8), digits only so no i18n.
        this.scoreEl = createOverlayElement('dance-score');
        this.scoreEl.textContent = '0';

        // The A press is a user gesture, so audio is allowed to start here.
        let runMs = RUN_MS;
        if (this.cache.audio.exists(MUSIC_KEY)) {
            this.music = this.sound.add(MUSIC_KEY) as
                | Phaser.Sound.WebAudioSound
                | Phaser.Sound.HTML5AudioSound;
            if (Number.isFinite(this.music.duration) && this.music.duration > 0) {
                runMs = Math.min(RUN_MS, this.music.duration * 1000);
            }
            this.music.play();
        }

        this.notes = generateBeatMap({ runMs, seed: Date.now() }).map((note) => ({
            ...note,
            sprite: null,
            done: false
        }));
        const last = this.notes[this.notes.length - 1];
        this.endMs = last ? last.timeMs + GOOD_WINDOW_MS + END_TAIL_MS : runMs;
    }

    /**
     * Song time comes from the music's own clock so notes can never drift
     * from what the player hears; forward-only, so the seek→0 snap when the
     * sound completes (or a stall) freezes time instead of rewinding it.
     * Without a track (or before an unlock-delayed play starts) the frame
     * clock carries it instead.
     */
    private advanceClock(delta: number): void {
        if (this.music?.isPlaying) {
            const seekMs = this.music.seek * 1000;
            if (Number.isFinite(seekMs) && seekMs > this.songTimeMs) {
                this.songTimeMs = seekMs;
            }
            return;
        }
        this.songTimeMs += delta;
    }

    /**
     * Turns the analog direction into press edges: a press is the quantized
     * lane changing (neutral→lane or lane→other lane) — see ./lanes.ts.
     */
    private detectLanePress(): void {
        const lane = directionToLane(inputService.direction());
        if (lane !== null && lane !== this.heldLane) {
            this.onLanePress(lane);
        }
        this.heldLane = lane;
    }

    private onLanePress(lane: Lane): void {
        let best: RuntimeNote | null = null;
        for (const note of this.notes) {
            if (note.done || note.lane !== lane) {
                continue;
            }
            const delta = Math.abs(note.timeMs - this.songTimeMs);
            if (delta <= GOOD_WINDOW_MS && (!best || delta < Math.abs(best.timeMs - this.songTimeMs))) {
                best = note;
            }
        }
        if (!best) {
            return; // stray press — no note in reach, no penalty
        }
        const judgment = judge(best.timeMs - this.songTimeMs);
        if (!judgment) {
            return;
        }
        best.done = true;
        best.sprite?.destroy();
        best.sprite = null;
        this.score += SCORE[judgment];
        if (this.scoreEl) {
            this.scoreEl.textContent = String(this.score);
        }
        this.flashReceptor(lane, FLASH_TINT[judgment]);
    }

    /** Spawns, positions (purely from songTimeMs) and miss-expires notes. */
    private driveNotes(): void {
        for (const note of this.notes) {
            if (note.done) {
                continue;
            }
            const untilBeat = note.timeMs - this.songTimeMs;
            if (untilBeat < -GOOD_WINDOW_MS) {
                note.done = true;
                this.flashReceptor(note.lane, MISS_TINT);
                if (note.sprite) {
                    const sprite = note.sprite;
                    note.sprite = null;
                    sprite.setTint(MISS_TINT);
                    this.tweens.add({
                        targets: sprite,
                        alpha: 0,
                        duration: 200,
                        onComplete: () => sprite.destroy()
                    });
                }
                continue;
            }
            if (untilBeat > APPROACH_MS) {
                break; // notes are time-sorted — nothing later is visible yet
            }
            if (!note.sprite) {
                note.sprite = this.add
                    .sprite(this.laneX(note.lane), SPAWN_Y, TEX_ARROW)
                    .setRotation(LANE_ROTATION[note.lane]);
            }
            note.sprite.setY(HIT_Y + (untilBeat / APPROACH_MS) * (SPAWN_Y - HIT_Y));
        }
    }

    private finishRun(): void {
        this.state = 'ended';
        this.music?.stop();

        if (this.score >= winScore(this.notes.length)) {
            this.time.delayedCall(WIN_BEAT_MS, () => this.completeActivity());
            return;
        }
        this.failFlowCleanup = runFailFlow({
            scene: this,
            videoKey: ENDING_VIDEO_KEY,
            failedTextKey: 'minigame.dance.failed',
            retryTextKey: 'minigame.dance.retry',
            quitTextKey: 'minigame.dance.quit',
            bannerClassName: 'dance-failed',
            onRetry: () => this.scene.restart({ activity: this.activity, flagId: this.flagId }),
            onQuit: () => this.abortActivity()
        });
    }

    private laneX(lane: Lane): number {
        return GAME_WIDTH / 2 + (lane - 1.5) * LANE_SPACING;
    }

    private flashReceptor(lane: Lane, tint: number): void {
        const receptor = this.receptors[lane];
        receptor.setTint(tint);
        this.time.delayedCall(FLASH_MS, () => receptor.setTint(IDLE_TINT));
    }

    /** Runtime-generated up-arrow (chevron + stem) — no image assets needed. */
    private ensureArrowTexture(): void {
        if (this.textures.exists(TEX_ARROW)) {
            return;
        }
        const g = this.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(0xffffff);
        g.fillTriangle(ARROW_SIZE / 2, 0, 0, ARROW_SIZE / 2, ARROW_SIZE, ARROW_SIZE / 2);
        g.fillRect(ARROW_SIZE / 2 - 3, ARROW_SIZE / 2, 6, ARROW_SIZE / 2);
        g.generateTexture(TEX_ARROW, ARROW_SIZE, ARROW_SIZE);
        g.destroy();
    }
}
