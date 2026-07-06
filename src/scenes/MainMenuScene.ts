import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { STAGES } from '../config/stages';
import { flowDirector } from '../core/FlowDirector';
import { SceneKeys } from './keys';

/**
 * Placeholder menu. Hardcoded English strings and Phaser text are temporary:
 * strings move to i18n/DOM overlay in milestone 5, and starting will go
 * through StageSelectScene in milestone 4.
 */
export class MainMenuScene extends Phaser.Scene {
    constructor() {
        super(SceneKeys.MainMenu);
    }

    create(): void {
        this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'KURAVENTURE', {
                fontFamily: 'monospace',
                fontSize: '24px',
                color: '#ffffff'
            })
            .setOrigin(0.5);

        const prompt = this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, 'Tap or press any key', {
                fontFamily: 'monospace',
                fontSize: '10px',
                color: '#aaaaaa'
            })
            .setOrigin(0.5);

        this.tweens.add({
            targets: prompt,
            alpha: 0.3,
            duration: 700,
            yoyo: true,
            repeat: -1
        });

        let started = false;
        const onStart = (): void => {
            if (started) {
                return;
            }
            started = true;
            flowDirector.startStage(STAGES[0].id);
        };
        this.input.keyboard?.once('keydown', onStart);
        this.input.once('pointerdown', onStart);
    }
}
