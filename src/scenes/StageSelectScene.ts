import Phaser from 'phaser';
import { eventBus } from '../core/EventBus';
import { flowDirector } from '../core/FlowDirector';
import { i18nService } from '../services/I18nService';
import { progressService } from '../services/ProgressService';
import { createOverlayElement } from '../ui/domOverlay';
import { SceneKeys } from './keys';

/**
 * Lists the unlocked stages (PLAN.md §3.4); completed ones are marked and can
 * be replayed. DOM on the overlay, tap/click like all menus (§3.8/§3.10);
 * rebuilt on locale:changed.
 */
export class StageSelectScene extends Phaser.Scene {
    private panel: HTMLDivElement | null = null;

    constructor() {
        super(SceneKeys.StageSelect);
    }

    create(): void {
        this.panel = createOverlayElement('menu');
        this.render();

        const offLocale = eventBus.on('locale:changed', () => this.render());
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            offLocale();
            this.panel?.remove();
            this.panel = null;
        });
    }

    private render(): void {
        if (!this.panel) {
            return;
        }
        this.panel.replaceChildren();

        const title = document.createElement('div');
        title.className = 'menu-title';
        title.textContent = i18nService.t('stageSelect.title');

        const list = document.createElement('div');
        list.className = 'menu-stages';
        for (const stage of progressService.getUnlockedStages()) {
            const done = progressService.isStageComplete(stage.id);
            const button = document.createElement('button');
            button.className = done ? 'menu-button menu-button-done' : 'menu-button';
            button.textContent = `${done ? '* ' : ''}${i18nService.t(stage.titleKey)}`;
            button.addEventListener('click', () => flowDirector.startStage(stage.id));
            list.appendChild(button);
        }

        this.panel.append(title, list);
    }
}
