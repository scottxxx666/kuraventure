import Phaser from 'phaser';
import { inputService } from '../../../input/InputService';
import { i18nService } from '../../../services/I18nService';
import { createOverlayElement } from '../../../ui/domOverlay';
import { SceneKeys } from '../../keys';
import { MiniGameScene } from '../MiniGameScene';

/**
 * Copy-me example (PLAN.md §3.3): the minimal valid mini-game — press A to
 * finish. Real mini-games live in scenes/minigames/<name>/ and register their
 * scene key in keys.ts + main.ts. Screen-space text is DOM (§3.8).
 */
export class TemplateMiniGame extends MiniGameScene {
    constructor() {
        super(SceneKeys.TemplateMiniGame);
    }

    create(): void {
        this.cameras.main.setBackgroundColor('#1d2233');

        const panel = createOverlayElement('minigame-panel');
        const title = document.createElement('div');
        title.className = 'minigame-title';
        title.textContent = i18nService.t('minigame.template.title');
        const prompt = document.createElement('div');
        prompt.className = 'minigame-prompt';
        prompt.textContent = i18nService.t('minigame.template.prompt');
        panel.append(title, prompt);

        const unsubscribe = inputService.onPress('A', () => this.completeActivity());
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            unsubscribe();
            panel.remove();
        });
    }
}
