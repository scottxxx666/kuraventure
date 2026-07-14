import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/dimensions';
import { inputService } from '../../input/InputService';
import { i18nService } from '../../services/I18nService';
import type { MessageKey } from '../../services/I18nService';
import { createOverlayElement } from '../../ui/domOverlay';

/**
 * Shared mini-game fail flow (PLAN.md §3.1 "shared by 2+ mini-games"):
 * fail banner → ending video (A skips) → Retry / Give up menu.
 * The host scene freezes its own gameplay before calling this.
 */

const FAIL_BANNER_MS = 2000;

export interface FailFlowOptions {
    scene: Phaser.Scene;
    /** Preloaded ending-video key (loaded in the host scene's preload). */
    videoKey: string;
    failedTextKey: MessageKey;
    retryTextKey: MessageKey;
    quitTextKey: MessageKey;
    /** Extra class on the banner text, e.g. 'pizza-run-failed'. */
    bannerClassName: string;
    onRetry(): void;
    onQuit(): void;
}

/**
 * Runs the flow to completion (the menu stays up until onRetry/onQuit fires).
 * Returns a cleanup the host MUST call on SHUTDOWN: removes DOM nodes and
 * unsubscribes the A-press skip (scene timers die with the scene on their own).
 */
export function runFailFlow(opts: FailFlowOptions): () => void {
    const domNodes: HTMLElement[] = [];
    const unsubscribers: (() => void)[] = [];

    const addOverlay = (className: string): HTMLDivElement => {
        const el = createOverlayElement(className);
        domNodes.push(el);
        return el;
    };

    const showRetryMenu = (): void => {
        const panel = addOverlay('minigame-panel');
        const retry = document.createElement('button');
        retry.className = 'menu-button';
        retry.textContent = i18nService.t(opts.retryTextKey);
        retry.addEventListener('click', () => opts.onRetry());
        const quit = document.createElement('button');
        quit.className = 'menu-button';
        quit.textContent = i18nService.t(opts.quitTextKey);
        quit.addEventListener('click', () => opts.onQuit());
        panel.append(retry, quit);
    };

    const playFailVideo = (): void => {
        // scrollFactor 0: scrolled-camera mini-games (cart-carry) fail mid-level,
        // so the video stays fixed to the screen center regardless of scroll.
        const video = opts.scene.add
            .video(GAME_WIDTH / 2, GAME_HEIGHT / 2, opts.videoKey)
            .setDepth(100)
            .setScrollFactor(0);
        const fit = (): void => {
            if (video.width > 0 && video.height > 0) {
                const scale = Math.min(GAME_WIDTH / video.width, GAME_HEIGHT / video.height);
                video.setDisplaySize(video.width * scale, video.height * scale);
            }
        };
        video.on(Phaser.GameObjects.Events.VIDEO_METADATA, fit);
        fit();

        let done = false;
        const finish = (): void => {
            if (done) {
                return;
            }
            done = true;
            offSkip();
            video.destroy();
            showRetryMenu();
        };
        video.once(Phaser.GameObjects.Events.VIDEO_COMPLETE, finish);
        video.once(Phaser.GameObjects.Events.VIDEO_ERROR, finish);
        // The fail happens long after the trigger gesture, so the browser may
        // refuse audible playback — Phaser signals that with VIDEO_LOCKED;
        // muted autoplay is always allowed.
        video.once(Phaser.GameObjects.Events.VIDEO_LOCKED, () => {
            video.setMute(true);
            video.play();
        });
        const offSkip = inputService.onPress('A', finish);
        unsubscribers.push(offSkip);
        video.play();
    };

    const banner = addOverlay('minigame-panel');
    const text = document.createElement('div');
    text.className = `menu-title ${opts.bannerClassName}`;
    text.textContent = i18nService.t(opts.failedTextKey);
    banner.appendChild(text);
    opts.scene.time.delayedCall(FAIL_BANNER_MS, () => {
        banner.remove();
        playFailVideo();
    });

    return () => {
        for (const el of domNodes) {
            el.remove();
        }
        for (const off of unsubscribers) {
            off();
        }
    };
}
