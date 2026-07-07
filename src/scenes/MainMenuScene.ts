import Phaser from 'phaser';
import { eventBus } from '../core/EventBus';
import { flowDirector } from '../core/FlowDirector';
import { LOCALES, LOCALE_LABELS, i18nService } from '../services/I18nService';
import { createOverlayElement } from '../ui/domOverlay';
import { SceneKeys } from './keys';

/**
 * Menu UI is DOM on the overlay (PLAN.md §3.8): tap/click as normal, pixel
 * web font, and the language switcher lives here (§3.7). Texts re-render on
 * locale:changed.
 */
export class MainMenuScene extends Phaser.Scene {
    private title!: HTMLDivElement;
    private prompt!: HTMLDivElement;

    constructor() {
        super(SceneKeys.MainMenu);
    }

    create(): void {
        const panel = createOverlayElement('menu');

        this.title = document.createElement('div');
        this.title.className = 'menu-title';
        this.prompt = document.createElement('div');
        this.prompt.className = 'menu-prompt';

        const langs = document.createElement('div');
        langs.className = 'menu-langs';
        const langButtons = LOCALES.map((locale) => {
            const button = document.createElement('button');
            button.className = 'menu-button';
            button.textContent = LOCALE_LABELS[locale];
            button.addEventListener('click', () => i18nService.setLocale(locale));
            langs.appendChild(button);
            return button;
        });

        panel.append(this.title, this.prompt, langs);
        this.renderTexts(langButtons);

        const offLocale = eventBus.on('locale:changed', () => this.renderTexts(langButtons));

        let started = false;
        const onStart = (): void => {
            if (started) {
                return;
            }
            started = true;
            flowDirector.openStageSelect();
        };
        this.input.keyboard?.once('keydown', onStart);
        this.input.once('pointerdown', onStart);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            offLocale();
            panel.remove();
        });
    }

    private renderTexts(langButtons: HTMLButtonElement[]): void {
        this.title.textContent = i18nService.t('menu.title');
        this.prompt.textContent = i18nService.t('menu.start');
        langButtons.forEach((button, i) => {
            button.dataset.active = String(LOCALES[i] === i18nService.getLocale());
        });
    }
}
