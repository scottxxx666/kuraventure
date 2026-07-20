import Phaser from 'phaser';
import { GAME_WIDTH } from '../../../config/dimensions';
import { inputService } from '../../../input/InputService';
import { setVirtualPadLaneMode } from '../../../input/VirtualPadSource';
import { i18nService } from '../../../services/I18nService';
import type { MessageKey } from '../../../services/I18nService';
import { createOverlayElement } from '../../../ui/domOverlay';
import { runFailFlow } from '../failFlow';
import { SceneKeys } from '../../keys';
import { MiniGameScene } from '../MiniGameScene';
import { SHINE_FEATURES } from './features';
import { CUTOFF_MS, SCORE, isScoring, judgePress, winScore } from './judgment';
import type { Feedback } from './judgment';
import { LANE_ROTATION } from './lanes';
import type { Lane } from './lanes';
import { BEAT_MS, SLOT_MS, generateChart } from './rounds';
import type { Chart, PoseNote, Round } from './rounds';
import { ShineSynth } from './sound';

/**
 * Time to Shine — call-and-response pose copying (DESIGN.md). Press A to
 * start; the spotlit host strikes direction poses on the beat (arrow glyph +
 * a pitch per lane), then the spotlight swaps to the player who repeats the
 * phrase on the following beats via lane input (§3.10 lane mode, dance-
 * style). Everything — host poses, the hand-over cue, note expiry — is
 * derived per frame from songTimeMs vs the chart (./rounds.ts), so there is
 * no demo/response state machine to desync. A press consumes the nearest
 * pending response note whatever the direction (./judgment.ts — mash-proof);
 * the whole run always plays and the score threshold decides at the end,
 * with the shared fail flow (../failFlow.ts) below it. Synthesized cues
 * (./sound.ts) carry the beat when no track exists — drop one at
 * public/assets/audio/time-to-shine.mp3 (see that folder's README.md).
 */

const RUN_TAIL_MS = 800; // last judged note → evaluation delay
const WIN_BEAT_MS = 300; // pause on the final score before completing
const ARROW_MS = 500; // a host pose glyph stays up this long (< a double's gap)
const SOUND_SLOP_MS = 150; // events older than this after a clock jump stay silent
const POPUP_MS = 600;

const HOST_X = GAME_WIDTH / 2;
const HOST_FEET_Y = 340;
const ARROW_Y = 205;
const DOTS_Y = 370;
const DOT_SPACING = 34;
const PLAYER_FEET_Y = 525;
/** Everything timing-critical stays above the touch lane zones (top 60% line, style.css). */

const HOST_TINT = 0xb08ae8;
const PLAYER_TINT = 0x7ac0f0;
const ARROW_TINT = 0xffe27a;
const DOT_IDLE = 0x555070;
const DOT_COLOR: Record<Feedback | 'miss', number> = {
    perfect: 0x7cfc7c,
    nice: 0xf0d060,
    early: 0xff9a5a,
    late: 0xff9a5a,
    wrong: 0xff5a5a,
    miss: 0xff5a5a
};

const JUDGE_TEXT_KEY: Record<Feedback | 'miss', MessageKey> = {
    perfect: 'minigame.timeToShine.judge.perfect',
    nice: 'minigame.timeToShine.judge.nice',
    early: 'minigame.timeToShine.judge.early',
    late: 'minigame.timeToShine.judge.late',
    wrong: 'minigame.timeToShine.judge.wrong',
    miss: 'minigame.timeToShine.judge.miss'
};

const TEX_ARROW = 'tts-arrow';
const TEX_DOT = 'tts-dot';
const TEX_FIGURE = 'tts-figure';
const ARROW_SIZE = 96;
const DOT_SIZE = 16;
const MUSIC_KEY = 'tts-music';
const ENDING_VIDEO_KEY = 'tts-ending';

const LIGHT_ON = 0.14;
const LIGHT_OFF = 0.03;

type ShineState = 'ready' | 'running' | 'ended';

/** A chart note plus its runtime flag; done = judged or missed. */
interface RuntimeNote {
    note: PoseNote;
    done: boolean;
}

export class TimeToShineMiniGame extends MiniGameScene {
    private state: ShineState = 'ready';
    private songTimeMs = 0;
    private endMs = 0;
    private score = 0;
    private chart: Chart | null = null;
    private responseNotes: RuntimeNote[] = [];
    private demoIdx = 0;
    private respIdx = 0;
    private nextBeatIdx = 0;
    private roundIdx = 0;
    private inResponse = false;
    /** Headbangers-style: the "your turn" cue fires once, then the run goes quiet. */
    private turnHinted = false;
    private arrowHideMs = 0;
    private music: Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | null = null;
    private synth: ShineSynth = new ShineSynth(null);
    private hostArrow!: Phaser.GameObjects.Sprite;
    private hostFigure!: Phaser.GameObjects.Sprite;
    private playerFigure!: Phaser.GameObjects.Sprite;
    private hostLight!: Phaser.GameObjects.Graphics;
    private playerLight!: Phaser.GameObjects.Graphics;
    private dots: Phaser.GameObjects.Sprite[] = [];
    private stageEl: HTMLElement | null = null;
    private cueEl: HTMLElement | null = null;
    private promptEl: HTMLElement | null = null;
    private scoreEl: HTMLElement | null = null;
    private failFlowCleanup: (() => void) | null = null;
    private offStart: (() => void) | null = null;
    private offLane: (() => void) | null = null;

    constructor() {
        super(SceneKeys.TimeToShine);
    }

    preload(): void {
        // Both optional in the placeholder era — a missing file just logs a
        // loader error and the caches stay empty (silent / straight-to-menu).
        if (!this.cache.audio.exists(MUSIC_KEY)) {
            this.load.audio(MUSIC_KEY, 'assets/audio/time-to-shine.mp3');
        }
        if (!this.cache.video.exists(ENDING_VIDEO_KEY)) {
            this.load.video(ENDING_VIDEO_KEY, 'assets/video/time-to-shine-ending.mp4');
        }
    }

    create(): void {
        // The same scene instance is reused across launches and restarts.
        this.state = 'ready';
        this.songTimeMs = 0;
        this.endMs = 0;
        this.score = 0;
        this.chart = null;
        this.responseNotes = [];
        this.demoIdx = 0;
        this.respIdx = 0;
        this.nextBeatIdx = 0;
        this.roundIdx = 0;
        this.inResponse = false;
        this.turnHinted = false;
        this.arrowHideMs = 0;
        this.music = null;
        this.dots = [];
        this.scoreEl = null;
        this.failFlowCleanup = null;
        this.disableLaneInput(); // defensive — a restart must never inherit lane mode

        const context = (this.sound as Partial<Phaser.Sound.WebAudioSoundManager>).context;
        this.synth = new ShineSynth(SHINE_FEATURES.laneTones && context instanceof AudioContext ? context : null);

        this.buildStage();

        this.promptEl = createOverlayElement('hud-prompt');
        this.promptEl.textContent = i18nService.t('minigame.timeToShine.prompt');

        this.offStart = inputService.onPress('A', () => {
            if (this.state === 'ready') {
                this.startRun();
            }
        });

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.promptEl?.remove();
            this.scoreEl?.remove();
            this.stageEl?.remove();
            this.offStart?.();
            this.disableLaneInput();
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
        this.driveRound();
        this.driveDemo();
        this.driveResponse();
        this.driveBeats();

        if (this.songTimeMs >= this.endMs) {
            this.finishRun();
        }
    }

    private startRun(): void {
        this.state = 'running';
        this.promptEl?.remove();
        this.promptEl = null;

        // Per-lane input for the run (§3.10 lane mode): arrows/WASD become
        // four discrete keys; the touch pad swaps for tap zones on the lanes.
        inputService.setLaneMode(true);
        setVirtualPadLaneMode(true);
        this.offLane = inputService.onLanePress((lane) => {
            if (this.state === 'running') {
                this.onLanePress(lane);
            }
        });

        // Score readout (text → DOM overlay, §3.8), digits only so no i18n.
        this.scoreEl = createOverlayElement('time-to-shine-score');
        this.scoreEl.textContent = '0';

        // The A press is a user gesture — audio may start, contexts may resume.
        this.synth.resume();
        if (this.cache.audio.exists(MUSIC_KEY)) {
            this.music = this.sound.add(MUSIC_KEY) as
                | Phaser.Sound.WebAudioSound
                | Phaser.Sound.HTML5AudioSound;
            this.music.play();
        }

        this.chart = generateChart({
            seed: Date.now(),
            rhythmPatterns: SHINE_FEATURES.rhythmPatterns,
            laneRamp: SHINE_FEATURES.laneRamp
        });
        this.responseNotes = this.chart.responseNotes.map((note) => ({ note, done: false }));
        const last = this.chart.responseNotes[this.chart.responseNotes.length - 1];
        this.endMs = (last ? last.timeMs + CUTOFF_MS : this.chart.endMs) + RUN_TAIL_MS;

        this.applyPhase();
        this.buildDots(this.chart.rounds[0]);
    }

    /**
     * Song time comes from the music's own clock so cues can never drift
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

    /** OFF on shutdown and BEFORE runFailFlow — the fail-video skip is an A-press. */
    private disableLaneInput(): void {
        this.offLane?.();
        this.offLane = null;
        inputService.setLaneMode(false);
        setVirtualPadLaneMode(false);
    }

    private currentRound(): Round | null {
        return this.chart?.rounds[this.roundIdx] ?? null;
    }

    /** Advances the round cursor and derives the watch/respond phase + visuals. */
    private driveRound(): void {
        const chart = this.chart;
        if (!chart) {
            return;
        }
        let round = chart.rounds[this.roundIdx];
        while (round && this.songTimeMs >= round.endMs && this.roundIdx < chart.rounds.length - 1) {
            this.roundIdx++;
            round = chart.rounds[this.roundIdx];
            this.buildDots(round);
        }
        const wasResponse = this.inResponse;
        this.inResponse = round ? this.songTimeMs >= round.demoEndMs : false;
        if (wasResponse !== this.inResponse) {
            this.applyPhase();
        }
    }

    private applyPhase(): void {
        this.hostLight.setAlpha(this.inResponse ? LIGHT_OFF : LIGHT_ON);
        this.playerLight.setAlpha(this.inResponse ? LIGHT_ON : LIGHT_OFF);
        if (!this.cueEl) {
            return;
        }
        // Onboarding only: "watch" then the first "your turn". Once the player
        // has handed over once, the cue stays silent — the beat/count-in and
        // memory carry every following turn (Headbangers "your turn" shows once).
        if (this.turnHinted) {
            this.cueEl.textContent = '';
            return;
        }
        this.cueEl.textContent = i18nService.t(
            this.inResponse ? 'minigame.timeToShine.yourTurn' : 'minigame.timeToShine.watch'
        );
        this.cueEl.dataset.phase = this.inResponse ? 'respond' : 'watch';
        if (this.inResponse) {
            this.turnHinted = true; // first hand-over shown — go quiet from here
        }
    }

    /** Shows/expires the host's pose glyph and plays its lane pitch. */
    private driveDemo(): void {
        const chart = this.chart;
        if (!chart) {
            return;
        }
        while (this.demoIdx < chart.demoNotes.length && chart.demoNotes[this.demoIdx].timeMs <= this.songTimeMs) {
            const note = chart.demoNotes[this.demoIdx];
            this.demoIdx++;
            if (this.songTimeMs - note.timeMs > SOUND_SLOP_MS) {
                continue; // clock jumped past it — do not burst stale poses
            }
            this.hostArrow.setRotation(LANE_ROTATION[note.lane]).setVisible(true);
            this.tweens.killTweensOf(this.hostArrow);
            this.hostArrow.setScale(1.35);
            this.tweens.add({ targets: this.hostArrow, scale: 1, duration: 180 });
            this.bounce(this.hostFigure);
            this.synth.laneTone(note.lane);
            this.arrowHideMs = note.timeMs + ARROW_MS;
        }
        if (this.hostArrow.visible && this.songTimeMs > this.arrowHideMs) {
            this.hostArrow.setVisible(false);
        }
    }

    /** Expires unhit response notes as misses. */
    private driveResponse(): void {
        while (this.respIdx < this.responseNotes.length) {
            const runtime = this.responseNotes[this.respIdx];
            if (runtime.done) {
                this.respIdx++;
                continue;
            }
            if (this.songTimeMs <= runtime.note.timeMs + CUTOFF_MS) {
                break; // still hittable — notes are time-sorted
            }
            runtime.done = true;
            this.respIdx++;
            this.paintDot(runtime.note, 'miss');
            this.showPopup('miss');
            this.synth.feedback('miss');
        }
    }

    /** Metronome + count-in, driven off the same beat grid as the chart. */
    private driveBeats(): void {
        const chart = this.chart;
        if (!chart) {
            return;
        }
        while (this.nextBeatIdx * BEAT_MS <= this.songTimeMs) {
            const beatMs = this.nextBeatIdx * BEAT_MS;
            this.nextBeatIdx++;
            // The music carries the beat itself; ticks would just fight it.
            if (this.music?.isPlaying || this.songTimeMs - beatMs > SOUND_SLOP_MS) {
                continue;
            }
            const countInStep = this.countInStep(beatMs);
            if (countInStep !== null) {
                this.synth.countIn(countInStep);
            } else {
                this.synth.tick(beatMs % SLOT_MS === 0);
            }
        }
    }

    /** The hand-over rest slot's two beats become the count-in, null elsewhere. */
    private countInStep(beatMs: number): 0 | 1 | null {
        const round = this.currentRound();
        if (round && beatMs >= round.demoEndMs && beatMs < round.responseStartMs) {
            return beatMs - round.demoEndMs < BEAT_MS ? 0 : 1;
        }
        return null;
    }

    private onLanePress(lane: Lane): void {
        // Bind to the nearest pending note within the cutoff; strict < keeps
        // the earlier note on a tie. Anything it binds to it consumes.
        let best: RuntimeNote | null = null;
        let bestAbs = Infinity;
        for (let i = this.respIdx; i < this.responseNotes.length; i++) {
            const runtime = this.responseNotes[i];
            if (runtime.done) {
                continue;
            }
            const delta = runtime.note.timeMs - this.songTimeMs;
            if (delta > CUTOFF_MS) {
                break;
            }
            const abs = Math.abs(delta);
            if (abs <= CUTOFF_MS && abs < bestAbs) {
                best = runtime;
                bestAbs = abs;
            }
        }
        if (!best) {
            return; // stray press — rest slot or demo phase, no penalty
        }
        const feedback = judgePress(best.note.timeMs - this.songTimeMs, lane === best.note.lane);
        best.done = true;
        if (isScoring(feedback)) {
            this.score += SCORE[feedback];
            if (this.scoreEl) {
                this.scoreEl.textContent = String(this.score);
            }
        }
        this.paintDot(best.note, feedback);
        this.showPopup(feedback);
        this.synth.laneTone(lane);
        this.synth.feedback(feedback);
        this.bounce(this.playerFigure);
    }

    private finishRun(): void {
        this.state = 'ended';
        this.music?.stop();
        this.disableLaneInput();

        if (this.chart && this.score >= winScore(this.chart.responseNotes.length)) {
            this.time.delayedCall(WIN_BEAT_MS, () => this.completeActivity());
            return;
        }
        this.failFlowCleanup = runFailFlow({
            scene: this,
            videoKey: ENDING_VIDEO_KEY,
            failedTextKey: 'minigame.timeToShine.failed',
            retryTextKey: 'minigame.timeToShine.retry',
            quitTextKey: 'minigame.timeToShine.quit',
            bannerClassName: 'time-to-shine-failed',
            onRetry: () => this.scene.restart({ activity: this.activity, flagId: this.flagId }),
            onQuit: () => this.abortActivity()
        });
    }

    // ---------------------------------------------------------------- visuals

    private buildStage(): void {
        this.cameras.main.setBackgroundColor('#141024');
        this.ensureTextures();

        this.add.rectangle(HOST_X, 45, GAME_WIDTH, 90, 0x241537); // back curtain
        this.add.ellipse(HOST_X, 540, 920, 80, 0x30244a); // stage floor

        // Spotlight cones; alpha-swapping them is the whose-turn cue.
        this.hostLight = this.spotlight(HOST_FEET_Y + 8, 150);
        this.playerLight = this.spotlight(PLAYER_FEET_Y + 8, 180);
        this.hostLight.setAlpha(LIGHT_ON);
        this.playerLight.setAlpha(LIGHT_OFF);

        this.hostFigure = this.add.sprite(HOST_X, HOST_FEET_Y, TEX_FIGURE).setOrigin(0.5, 1).setTint(HOST_TINT);
        this.playerFigure = this.add
            .sprite(HOST_X, PLAYER_FEET_Y, TEX_FIGURE)
            .setOrigin(0.5, 1)
            .setTint(PLAYER_TINT);
        this.hostArrow = this.add.sprite(HOST_X, ARROW_Y, TEX_ARROW).setTint(ARROW_TINT).setVisible(false);

        // Canvas-aligned DOM wrapper (the .vpad-lanes trick) for the phase cue
        // and judgment popups — screen-space text stays in the overlay (§3.8).
        this.stageEl = createOverlayElement('time-to-shine-stage');
        this.cueEl = document.createElement('div');
        this.cueEl.className = 'time-to-shine-cue';
        this.stageEl.appendChild(this.cueEl);
    }

    private spotlight(floorY: number, spread: number): Phaser.GameObjects.Graphics {
        const g = this.add.graphics();
        g.fillStyle(0xfff2b0, 1);
        g.fillPoints(
            [
                new Phaser.Geom.Point(HOST_X - 45, 0),
                new Phaser.Geom.Point(HOST_X + 45, 0),
                new Phaser.Geom.Point(HOST_X + spread, floorY),
                new Phaser.Geom.Point(HOST_X - spread, floorY)
            ],
            true
        );
        return g;
    }

    /** One grey dot per response note of the round — a preview of what's coming. */
    private buildDots(round: Round | undefined): void {
        for (const dot of this.dots) {
            dot.destroy();
        }
        this.dots = [];
        if (!round) {
            return;
        }
        const startX = HOST_X - ((round.noteCount - 1) * DOT_SPACING) / 2;
        for (let i = 0; i < round.noteCount; i++) {
            this.dots.push(this.add.sprite(startX + i * DOT_SPACING, DOTS_Y, TEX_DOT).setTint(DOT_IDLE));
        }
    }

    private paintDot(note: PoseNote, result: Feedback | 'miss'): void {
        if (note.roundIndex !== this.roundIdx) {
            return; // round already advanced (should not happen — guard only)
        }
        this.dots[note.noteIndex]?.setTint(DOT_COLOR[result]);
    }

    /** Transient DOM judgment popup; the CSS animation floats and fades it. */
    private showPopup(result: Feedback | 'miss'): void {
        if (!this.stageEl) {
            return;
        }
        const el = document.createElement('div');
        el.className = `time-to-shine-judgment is-${result}`;
        el.textContent = i18nService.t(JUDGE_TEXT_KEY[result]);
        this.stageEl.appendChild(el);
        this.time.delayedCall(POPUP_MS, () => el.remove());
    }

    private bounce(figure: Phaser.GameObjects.Sprite): void {
        this.tweens.killTweensOf(figure);
        figure.setScale(1);
        this.tweens.add({ targets: figure, scaleY: 0.88, duration: 70, yoyo: true });
    }

    /** Runtime-generated placeholder art — no image assets needed. */
    private ensureTextures(): void {
        if (!this.textures.exists(TEX_ARROW)) {
            const g = this.make.graphics({ x: 0, y: 0 }, false);
            g.fillStyle(0xffffff);
            g.fillTriangle(ARROW_SIZE / 2, 0, 0, ARROW_SIZE / 2, ARROW_SIZE, ARROW_SIZE / 2);
            g.fillRect(ARROW_SIZE / 2 - 18, ARROW_SIZE / 2, 36, ARROW_SIZE / 2);
            g.generateTexture(TEX_ARROW, ARROW_SIZE, ARROW_SIZE);
            g.destroy();
        }
        if (!this.textures.exists(TEX_DOT)) {
            const g = this.make.graphics({ x: 0, y: 0 }, false);
            g.fillStyle(0xffffff);
            g.fillCircle(DOT_SIZE / 2, DOT_SIZE / 2, DOT_SIZE / 2);
            g.generateTexture(TEX_DOT, DOT_SIZE, DOT_SIZE);
            g.destroy();
        }
        if (!this.textures.exists(TEX_FIGURE)) {
            const g = this.make.graphics({ x: 0, y: 0 }, false);
            g.fillStyle(0xffffff);
            g.fillCircle(32, 16, 15); // head
            g.fillRoundedRect(10, 34, 44, 60, 12); // body
            g.generateTexture(TEX_FIGURE, 64, 96);
            g.destroy();
        }
    }
}
