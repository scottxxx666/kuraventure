import Phaser from 'phaser';
import { GAME_WIDTH } from '../../../config/dimensions';
import { inputService } from '../../../input/InputService';
import { i18nService } from '../../../services/I18nService';
import { createOverlayElement, getOverlayRoot } from '../../../ui/domOverlay';
import { runFailFlow } from '../failFlow';
import { SceneKeys } from '../../keys';
import { MiniGameScene } from '../MiniGameScene';
import {
    AIR_MS,
    BOTTOM_PHASE,
    ENTRY_PERIOD_MS,
    TARGET_JUMPS,
    advancePhase,
    enterGaugeFrac,
    isJumpWindow,
    isSafeEnterPhase,
    jumpGaugeFrac,
    periodForCount,
    timeToBottomMs
} from './timing';

/**
 * Jump Rope — a six-member long-rope routine seen from the front (stage
 * view): two turners at the sides, four members who run in one at a time and
 * then jump together. Press A to start; while the rope turns, B (in the safe
 * window right after the rope sweeps the ground — ./timing.ts) sends the next
 * member dashing in, and already-entered members auto-jump. Once all four are
 * in, every rope pass is the player's: A jumps the whole line, ten in a row
 * wins, and the rope speeds up with each count. Any trip — a mistimed run-in
 * or being grounded when the rope sweeps the feet — runs the shared fail flow
 * (one strike). The rope is drawn as a front/back-swinging ellipse: in front
 * of the members while descending, faded behind them while rising, with a
 * ground shadow pulsing as it nears the feet for readability. Timing is
 * driven by a timed-button QTE cue (renderQte): the A/B badge appears with a
 * full radial gauge exactly when pressing becomes valid, the gauge drains to
 * the deadline, and the cue hides once answered. Letting a gauge empty
 * unanswered fails, as does pressing while no cue is up.
 * All six figures are runtime-generated placeholder blobs, to be replaced by
 * IZ*ONE art later.
 */

const WIN_BEAT_MS = 900; // celebration pause before completing
const DASH_MS = 380; // run-in tween, well under the gap to the next sweep

const FEET_Y = 600;
const HAND_Y = 430; // turners' hands — the rope's rotation axis height
const LEFT_HAND_X = 330;
const RIGHT_HAND_X = 950;
const TURNER_X = [300, 980];
const SLOT_X = [480, 610, 740, 870];
/** Waiting line outside the rope; skewed toward the left edge but kept above
    the very corner (virtual-pad thumb zone, PLAN.md §3.10) — and it only
    holds decorative waiters, the timing-critical visuals are central. */
const QUEUE_X = [70, 135, 200, 265];
const QUEUE_FEET_Y = 645;

const ROPE_RADIUS = 185; // bottom of the swing lands just past the feet
const ROPE_PERSPECTIVE = 22; // slight y push toward the camera in front
const ROPE_COLOR = 0x8a5a2b;
const JUMP_HEIGHT = 90;

const TURNER_TINT = 0x7aa5e8;
const MEMBER_TINTS = [0xf2909f, 0xf2c063, 0x9fd6a5, 0xb9a5f0];
const TRIP_TINT = 0xff5a5a;

/** QTE cue anchor — the DOM badge in .jump-rope-qte sits at the same canvas
    point via percentages (left 50% / top 25%); keep the CSS in sync. */
const QTE_X = GAME_WIDTH / 2;
const QTE_Y = 180;
const QTE_GAUGE_RADIUS = 40; // just outside the badge (28 canvas px radius)
const QTE_GAUGE_WIDTH = 6;
const QTE_TRACK_COLOR = 0xffffff;
const QTE_GLOW_COLOR = 0xffe27a;

const TEX_FIGURE = 'jump-rope-figure';
const ENDING_VIDEO_KEY = 'jump-rope-ending';

type JumpRopeState = 'ready' | 'entering' | 'jumping' | 'ended';

interface Member {
    sprite: Phaser.GameObjects.Sprite;
    state: 'waiting' | 'dashing' | 'in';
    slotX: number;
    /** Scene-clock ms of the current jump's takeoff; -Infinity = grounded. */
    jumpAtMs: number;
}

export class JumpRopeMiniGame extends MiniGameScene {
    private state: JumpRopeState = 'ready';
    private nowMs = 0;
    private phase = 0;
    private count = 0;
    private members: Member[] = [];
    private ropeFront!: Phaser.GameObjects.Graphics;
    private ropeBack!: Phaser.GameObjects.Graphics;
    private ropeShadow!: Phaser.GameObjects.Graphics;
    private qteRing!: Phaser.GameObjects.Graphics;
    private qteWrap: HTMLElement | null = null;
    private qteBadge: HTMLElement | null = null;
    private qteLetter: 'A' | 'B' | null = null;
    private qteGlow = false;
    /** The current enter window was answered — further B taps are ignored. */
    private enterConsumed = false;
    private wasInEnterWindow = false;
    private promptEl: HTMLElement | null = null;
    private countEl: HTMLElement | null = null;
    private quitButton: HTMLButtonElement | null = null;
    private failFlowCleanup: (() => void) | null = null;
    private offA: (() => void) | null = null;
    private offB: (() => void) | null = null;

    constructor() {
        super(SceneKeys.JumpRope);
    }

    preload(): void {
        // Optional in the placeholder era — a missing file logs a loader
        // error and the fail flow's VIDEO_ERROR path skips straight to the menu.
        if (!this.cache.video.exists(ENDING_VIDEO_KEY)) {
            this.load.video(ENDING_VIDEO_KEY, 'assets/video/jump-rope-ending.mp4');
        }
    }

    create(): void {
        // The same scene instance is reused across launches and restarts.
        this.state = 'ready';
        this.nowMs = 0;
        this.phase = 0;
        this.count = 0;
        this.members = [];
        this.countEl = null;
        this.failFlowCleanup = null;
        this.enterConsumed = false;
        this.wasInEnterWindow = false;

        this.cameras.main.setBackgroundColor('#2c3a54');
        this.add.rectangle(GAME_WIDTH / 2, 655, GAME_WIDTH, 130, 0x9a8557);
        this.ensureFigureTexture();

        const staticLayer = this.add.graphics().setDepth(2);
        for (const x of SLOT_X) {
            staticLayer.fillStyle(0x000000, 0.22);
            staticLayer.fillEllipse(x, FEET_Y + 6, 80, 16);
        }
        // Turner arms, raised toward the rope's rotation axis.
        staticLayer.lineStyle(9, TURNER_TINT, 1);
        staticLayer.lineBetween(TURNER_X[0] + 18, FEET_Y - 82, LEFT_HAND_X, HAND_Y);
        staticLayer.lineBetween(TURNER_X[1] - 18, FEET_Y - 82, RIGHT_HAND_X, HAND_Y);

        this.ropeShadow = this.add.graphics().setDepth(2);
        this.ropeBack = this.add.graphics().setDepth(3).setAlpha(0.35);
        this.ropeFront = this.add.graphics().setDepth(20);
        this.qteRing = this.add.graphics().setDepth(25);

        // QTE badge: a DOM A/B button (matching the virtual pad's look) inside
        // a canvas-aligned wrapper, so the canvas-drawn ring lands on it.
        this.qteLetter = null;
        this.qteGlow = false;
        this.qteWrap = createOverlayElement('jump-rope-qte');
        this.qteBadge = document.createElement('div');
        this.qteBadge.className = 'jump-rope-qte-badge is-hidden';
        this.qteWrap.appendChild(this.qteBadge);

        for (const x of TURNER_X) {
            this.add.sprite(x, FEET_Y, TEX_FIGURE).setOrigin(0.5, 1).setDepth(10).setTint(TURNER_TINT);
        }
        this.members = MEMBER_TINTS.map((tint, i) => ({
            sprite: this.add
                .sprite(QUEUE_X[i], QUEUE_FEET_Y, TEX_FIGURE)
                .setOrigin(0.5, 1)
                .setDepth(10)
                .setTint(tint),
            state: 'waiting' as const,
            slotX: SLOT_X[i],
            jumpAtMs: -Infinity
        }));

        this.promptEl = createOverlayElement('hud-prompt');
        this.promptEl.textContent = i18nService.t('minigame.jumpRope.prompt');

        this.quitButton = document.createElement('button');
        this.quitButton.className = 'menu-button jump-rope-quit';
        this.quitButton.textContent = i18nService.t('minigame.jumpRope.quit');
        this.quitButton.addEventListener('click', () => {
            if (this.state !== 'ended') {
                this.abortActivity();
            }
        });
        getOverlayRoot().appendChild(this.quitButton);

        this.offA = inputService.onPress('A', () => {
            if (this.state === 'ready') {
                this.startRope();
            } else if (this.state === 'jumping') {
                this.onJumpPress();
            }
        });
        this.offB = inputService.onPress('B', () => {
            if (this.state === 'entering') {
                this.onEnterPress();
            }
        });

        this.renderRope();

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.promptEl?.remove();
            this.countEl?.remove();
            this.quitButton?.remove();
            this.qteWrap?.remove();
            this.offA?.();
            this.offB?.();
            this.failFlowCleanup?.();
        });
    }

    update(_time: number, delta: number): void {
        if (this.state !== 'entering' && this.state !== 'jumping') {
            return;
        }
        this.nowMs += delta;

        const period = this.state === 'entering' ? ENTRY_PERIOD_MS : periodForCount(this.count);
        const step = advancePhase(this.phase, delta, period);
        this.phase = step.phase;
        if (step.crossedBottom) {
            this.onBottomCross();
        }
        if (this.state === 'entering') {
            this.checkEnterTimeout();
            this.autoJumpEnteredMembers(period);
        }
        this.renderRope();
        this.renderMembers();
        this.renderQte(period);
    }

    /** QTE rule: an enter window that closes unanswered while someone still
        waits outside is a fail, same as a mistimed press. */
    private checkEnterTimeout(): void {
        const inWindow = isSafeEnterPhase(this.phase);
        const expired = this.wasInEnterWindow && !inWindow && !this.enterConsumed;
        this.wasInEnterWindow = inWindow;
        if (expired && this.members.some((m) => m.state === 'waiting')) {
            this.trip([]);
        }
    }

    private startRope(): void {
        this.state = 'entering';
        if (this.promptEl) {
            this.promptEl.textContent = i18nService.t('minigame.jumpRope.enterHint');
        }
    }

    /** Entry phase: B while the cue is up dashes the next member in (extra
        taps in an answered window are ignored); B with no cue showing sends
        them straight into the rope — one strike. */
    private onEnterPress(): void {
        if (this.enterConsumed || this.members.some((m) => m.state === 'dashing')) {
            return;
        }
        const member = this.members.find((m) => m.state === 'waiting');
        if (!member) {
            return;
        }
        member.state = 'dashing';
        const safe = isSafeEnterPhase(this.phase);
        this.enterConsumed = safe;
        this.tweens.add({
            targets: member.sprite,
            x: member.slotX,
            y: FEET_Y,
            duration: DASH_MS,
            onComplete: () => {
                if (!safe) {
                    this.trip([member]);
                    return;
                }
                member.state = 'in';
                if (this.members.every((m) => m.state === 'in')) {
                    this.beginJumping();
                }
            }
        });
    }

    private beginJumping(): void {
        this.state = 'jumping';
        if (this.promptEl) {
            this.promptEl.textContent = i18nService.t('minigame.jumpRope.jumpHint');
        }
        this.countEl = createOverlayElement('jump-rope-count');
        this.updateCounter();
    }

    /** A jumps the whole line together (they land in sync, so one grounded
        check covers all). Mid-air presses are ignored — an answered window's
        extra taps are harmless — but A with no cue showing is a stumble:
        one strike, like any mistimed QTE press. */
    private onJumpPress(): void {
        if (this.nowMs - this.members[0].jumpAtMs < AIR_MS) {
            return;
        }
        if (!isJumpWindow(timeToBottomMs(this.phase, periodForCount(this.count)))) {
            this.trip(this.members);
            return;
        }
        for (const member of this.members) {
            member.jumpAtMs = this.nowMs;
        }
    }

    /** Entered members clear the rope on their own while others still run in:
        takeoff timed so their air time is centered on the next sweep. */
    private autoJumpEnteredMembers(periodMs: number): void {
        if (timeToBottomMs(this.phase, periodMs) > AIR_MS / 2) {
            return;
        }
        for (const member of this.members) {
            if (member.state === 'in' && this.nowMs - member.jumpAtMs >= AIR_MS) {
                member.jumpAtMs = this.nowMs;
            }
        }
    }

    private onBottomCross(): void {
        if (this.state !== 'jumping') {
            // Entry phase: in-rope members are auto-jumped clear, and each
            // sweep opens a fresh enter window.
            this.enterConsumed = false;
            return;
        }
        const grounded = this.members.filter((m) => this.nowMs - m.jumpAtMs >= AIR_MS);
        if (grounded.length > 0) {
            this.trip(grounded);
            return;
        }
        this.count += 1;
        this.updateCounter();
        if (this.count >= TARGET_JUMPS) {
            this.win();
        }
    }

    private trip(tripped: Member[]): void {
        this.state = 'ended';
        this.hideQte();
        this.quitButton?.remove();
        this.quitButton = null;
        for (const member of tripped) {
            member.sprite.setTint(TRIP_TINT).setAngle(-75);
        }
        this.failFlowCleanup = runFailFlow({
            scene: this,
            videoKey: ENDING_VIDEO_KEY,
            failedTextKey: 'minigame.jumpRope.failed',
            retryTextKey: 'minigame.jumpRope.retry',
            quitTextKey: 'minigame.jumpRope.quit',
            bannerClassName: 'jump-rope-failed',
            onRetry: () => this.scene.restart({ activity: this.activity, flagId: this.flagId }),
            onQuit: () => this.abortActivity()
        });
    }

    private win(): void {
        this.state = 'ended';
        this.hideQte();
        this.quitButton?.remove();
        this.quitButton = null;
        for (const member of this.members) {
            this.tweens.add({
                targets: member.sprite,
                y: FEET_Y - 46,
                duration: 160,
                yoyo: true,
                repeat: 2,
                ease: 'Sine.easeOut'
            });
        }
        this.time.delayedCall(WIN_BEAT_MS, () => this.completeActivity());
    }

    private updateCounter(): void {
        if (this.countEl) {
            this.countEl.textContent = `${this.count} / ${TARGET_JUMPS}`;
        }
    }

    /** Front-view rope: a hand-to-hand arc whose midpoint swings top → front
        → feet → back; drawn over the members while in front, faded behind
        them otherwise, plus a ground shadow that peaks at the sweep. */
    private renderRope(): void {
        const angle = Math.PI * 2 * this.phase;
        const midX = (LEFT_HAND_X + RIGHT_HAND_X) / 2;
        const midY = HAND_Y - ROPE_RADIUS * Math.cos(angle) + ROPE_PERSPECTIVE * Math.sin(angle);
        const inFront = Math.sin(angle) >= 0;

        const curve = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(LEFT_HAND_X, HAND_Y),
            new Phaser.Math.Vector2(midX, 2 * midY - HAND_Y),
            new Phaser.Math.Vector2(RIGHT_HAND_X, HAND_Y)
        );
        this.ropeFront.clear();
        this.ropeBack.clear();
        const target = inFront ? this.ropeFront : this.ropeBack;
        target.lineStyle(inFront ? 6 + 2 * Math.sin(angle) : 4, ROPE_COLOR, 1);
        curve.draw(target, 32);

        // Timing aid for the front view: the shadow darkens as the rope
        // approaches the feet (phase distance to the bottom, wrap-aware).
        const dist = Math.abs(this.phase - BOTTOM_PHASE);
        const proximity = Math.max(0, 1 - Math.min(dist, 1 - dist) * 5);
        this.ropeShadow.clear();
        this.ropeShadow.fillStyle(0x000000, 0.3 * proximity);
        this.ropeShadow.fillEllipse(midX, FEET_Y + 8, RIGHT_HAND_X - LEFT_HAND_X, 20);
    }

    /** QTE cue (timed-button style): the A/B badge is visible exactly while
        pressing is valid, with a radial gauge that starts full and drains to
        nothing at the deadline. It hides the moment the window is answered.
        DOM is only touched when the letter/visibility actually change; the
        gauge redraws per frame. */
    private renderQte(periodMs: number): void {
        let letter: 'A' | 'B' | null = null;
        let frac = 0;
        if (this.state === 'entering') {
            const waiting = this.members.some((m) => m.state === 'waiting');
            const dashing = this.members.some((m) => m.state === 'dashing');
            if (waiting && !dashing && !this.enterConsumed) {
                frac = enterGaugeFrac(this.phase);
                letter = frac > 0 ? 'B' : null;
            }
        } else if (this.state === 'jumping') {
            const grounded = this.nowMs - this.members[0].jumpAtMs >= AIR_MS;
            if (grounded) {
                frac = jumpGaugeFrac(timeToBottomMs(this.phase, periodMs));
                letter = frac > 0 ? 'A' : null;
            }
        }
        this.syncQteBadge(letter, letter !== null);

        this.qteRing.clear();
        if (!letter) {
            return;
        }
        this.qteRing.lineStyle(QTE_GAUGE_WIDTH, QTE_TRACK_COLOR, 0.18);
        this.qteRing.strokeCircle(QTE_X, QTE_Y, QTE_GAUGE_RADIUS);
        this.qteRing.lineStyle(QTE_GAUGE_WIDTH, QTE_GLOW_COLOR, 0.9);
        this.qteRing.beginPath();
        this.qteRing.arc(
            QTE_X,
            QTE_Y,
            QTE_GAUGE_RADIUS,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * frac
        );
        this.qteRing.strokePath();
    }

    private syncQteBadge(letter: 'A' | 'B' | null, glow: boolean): void {
        if (!this.qteBadge) {
            return;
        }
        if (letter !== this.qteLetter) {
            this.qteLetter = letter;
            this.qteBadge.textContent = letter ?? '';
            this.qteBadge.classList.toggle('is-hidden', letter === null);
        }
        if (glow !== this.qteGlow) {
            this.qteGlow = glow;
            this.qteBadge.classList.toggle('is-glowing', glow);
        }
    }

    private hideQte(): void {
        this.qteRing.clear();
        this.syncQteBadge(null, false);
    }

    private renderMembers(): void {
        for (const member of this.members) {
            if (member.state !== 'in') {
                continue; // waiting members stand still, dashers are tweened
            }
            const t = (this.nowMs - member.jumpAtMs) / AIR_MS;
            const offset = t >= 0 && t < 1 ? -JUMP_HEIGHT * 4 * t * (1 - t) : 0;
            member.sprite.setY(FEET_Y + offset);
        }
    }

    /** Runtime-generated front-facing placeholder blob (white, so per-member
        tints color it; the dark eyes stay dark) — no image assets needed. */
    private ensureFigureTexture(): void {
        if (this.textures.exists(TEX_FIGURE)) {
            return;
        }
        const g = this.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(0xffffff);
        g.fillCircle(38, 32, 26);
        g.fillRoundedRect(16, 62, 44, 60, 10);
        g.fillRect(24, 122, 10, 26);
        g.fillRect(42, 122, 10, 26);
        g.fillStyle(0x2b2b2b);
        g.fillCircle(28, 28, 4);
        g.fillCircle(48, 28, 4);
        g.generateTexture(TEX_FIGURE, 76, 150);
        g.destroy();
    }
}
