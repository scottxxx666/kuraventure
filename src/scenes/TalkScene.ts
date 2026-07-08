import Phaser from 'phaser';
import type { ActivityRef } from '../config/stages';
import { eventBus } from '../core/EventBus';
import { talkRunner } from '../dialogue/TalkRunner';
import type { TalkChoice, TalkLine } from '../dialogue/types';
import { inputService } from '../input/InputService';
import { setVirtualPadVisible } from '../input/VirtualPadSource';
import { createOverlayElement, getOverlayRoot } from '../ui/domOverlay';
import { SceneKeys } from './keys';

type TalkActivity = Extract<ActivityRef, { type: 'talk' }>;

/** Scene data FlowDirector passes when launching a talk activity. */
export interface TalkSceneData {
    activity: ActivityRef;
    flagId: string;
}

/** The dialogue-box DOM nodes, created together on first render (§3.8). */
interface TalkDom {
    box: HTMLDivElement;
    speaker: HTMLDivElement;
    text: HTMLDivElement;
    choices: HTMLDivElement;
}

/**
 * THE generic interactive NPC conversation player (PLAN.md §3.11): one scene
 * serves every talk activity, launched by FlowDirector over the paused world
 * (which keeps rendering underneath), driven by TalkRunner. Unlike
 * DialogueScene (timed, no input), a talk needs the player to advance lines
 * and pick choices, so the virtual pad stays visible.
 *
 * On any error loading/compiling/continuing the graph, the conversation ends
 * immediately (console.warn + activity:complete or :abort per
 * `wasCompleted()`) — a broken graph must never soft-lock the paused world.
 */
export class TalkScene extends Phaser.Scene {
    private activity!: TalkActivity;
    private flagId!: string;
    private ended = false;
    private selectedIndex = 0;
    /** Sign (-1/0/1) of the last frame's direction().y, for edge-detected choice navigation. */
    private prevDirSign = 0;

    private dom: TalkDom | null = null;
    private portraitEl: HTMLImageElement | null = null;
    private portraitSrc: string | null = null;

    private offPress: (() => void) | null = null;
    private offRelocalized: (() => void) | null = null;

    constructor() {
        super(SceneKeys.Talk);
    }

    init(data: TalkSceneData): void {
        if (data?.activity?.type !== 'talk' || !data.flagId) {
            throw new Error(
                `${SceneKeys.Talk} needs a talk ActivityRef — talks are launched by FlowDirector via a stage trigger`
            );
        }
        this.activity = data.activity;
        this.flagId = data.flagId;
        // The same scene instance is reused across launches.
        this.ended = false;
        this.selectedIndex = 0;
        this.prevDirSign = 0;
        this.portraitSrc = null;
    }

    create(): void {
        // This activity needs input, unlike the timed DialogueScene (PLAN.md §3.10).
        setVirtualPadVisible(true);

        talkRunner
            .start(this.activity.graphId)
            .then(() => this.afterStep())
            .catch((err: unknown) => this.fail(err));

        this.offPress = inputService.onPress('A', () => this.onPressA());
        this.offRelocalized = talkRunner.onRelocalized(() => this.render());

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.offPress?.();
            this.offPress = null;
            this.offRelocalized?.();
            this.offRelocalized = null;
            talkRunner.stop();
            this.removeDom();
        });
    }

    update(): void {
        if (this.ended || talkRunner.currentChoices().length === 0) {
            this.prevDirSign = 0;
            return;
        }
        const y = inputService.direction().y;
        const sign = y > 0.5 ? 1 : y < -0.5 ? -1 : 0;
        if (sign !== 0 && sign !== this.prevDirSign) {
            this.moveSelection(sign);
        }
        this.prevDirSign = sign;
    }

    private onPressA(): void {
        if (this.ended) {
            return;
        }
        try {
            if (talkRunner.currentChoices().length > 0) {
                talkRunner.choose(this.selectedIndex);
            } else {
                talkRunner.advance();
            }
            this.selectedIndex = 0;
            this.afterStep();
        } catch (err) {
            this.fail(err);
        }
    }

    private selectChoice(index: number): void {
        if (this.ended) {
            return;
        }
        try {
            talkRunner.choose(index);
            this.selectedIndex = 0;
            this.afterStep();
        } catch (err) {
            this.fail(err);
        }
    }

    private moveSelection(delta: number): void {
        const choices = talkRunner.currentChoices();
        if (choices.length === 0) {
            return;
        }
        this.selectedIndex = (this.selectedIndex + delta + choices.length) % choices.length;
        this.renderChoices(choices);
    }

    /** After start()/advance()/choose() succeed: end the conversation if the
        story ran out, else render the new current line/choices. */
    private afterStep(): void {
        if (talkRunner.isFinished()) {
            this.end();
            return;
        }
        this.render();
    }

    private fail(err: unknown): void {
        // A malformed graph (compile/continue failure) must not soft-lock the paused world.
        console.warn(err);
        this.end();
    }

    /** Emits activity:complete/:abort exactly once per run, per wasCompleted(). */
    private end(): void {
        if (this.ended) {
            return;
        }
        this.ended = true;
        this.hideAll();
        if (talkRunner.wasCompleted()) {
            eventBus.emit('activity:complete', { flagId: this.flagId });
        } else {
            eventBus.emit('activity:abort', { flagId: this.flagId });
        }
    }

    private render(): void {
        const choices = talkRunner.currentChoices();
        if (choices.length > 0) {
            this.renderChoices(choices);
            return;
        }
        const line = talkRunner.currentLine();
        if (line) {
            this.syncPortrait(line.speaker);
            this.renderLine(line);
        }
    }

    private renderLine(line: TalkLine): void {
        const dom = this.ensureDom();
        dom.box.hidden = false;
        dom.choices.hidden = true;
        dom.choices.replaceChildren();
        dom.speaker.hidden = !line.speaker;
        dom.speaker.textContent = line.speaker ?? '';
        dom.text.textContent = line.text;
    }

    private renderChoices(choices: TalkChoice[]): void {
        const dom = this.ensureDom();
        dom.box.hidden = true;
        dom.choices.hidden = false;
        dom.choices.replaceChildren();
        choices.forEach((choice, index) => {
            const button = document.createElement('button');
            button.className = 'menu-button talk-choice';
            button.textContent = choice.text;
            button.dataset.active = String(index === this.selectedIndex);
            button.addEventListener('click', () => this.selectChoice(index));
            dom.choices.appendChild(button);
        });
    }

    /** Shows the portrait mapped to the active line's speaker; none → hidden
        (same pattern as DialogueScene.syncPortrait, PLAN.md §3.6). */
    private syncPortrait(speaker: string | undefined): void {
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

    /** Lazily builds the box + choices containers (kept for the scene's lifetime,
        toggled hidden/visible rather than recreated every render). */
    private ensureDom(): TalkDom {
        if (this.dom) {
            return this.dom;
        }
        const box = createOverlayElement('talk-box');
        const speaker = document.createElement('div');
        speaker.className = 'talk-speaker';
        const text = document.createElement('div');
        text.className = 'talk-text';
        const hint = document.createElement('div');
        hint.className = 'talk-hint';
        hint.textContent = '▼';
        box.append(speaker, text, hint);
        const choices = createOverlayElement('talk-choices');
        this.dom = { box, speaker, text, choices };
        return this.dom;
    }

    private hideAll(): void {
        if (this.dom) {
            this.dom.box.hidden = true;
            this.dom.choices.hidden = true;
            this.dom.choices.replaceChildren();
        }
        if (this.portraitEl) {
            this.portraitEl.hidden = true;
        }
    }

    private removeDom(): void {
        this.dom?.box.remove();
        this.dom?.choices.remove();
        this.dom = null;
        this.portraitEl?.remove();
        this.portraitEl = null;
        this.portraitSrc = null;
    }
}
