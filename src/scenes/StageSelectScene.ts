import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/gameConfig';
import { flowDirector } from '../core/FlowDirector';
import { progressService } from '../services/ProgressService';
import { SceneKeys } from './keys';

/**
 * Lists the unlocked stages (PLAN.md §3.4); completed ones are marked and can
 * be replayed. Entries are tap/click like all menus (PLAN.md §3.10).
 * Hardcoded strings and Phaser text are temporary: stage titles switch to
 * titleKey via i18n and the DOM overlay in milestone 5.
 */
export class StageSelectScene extends Phaser.Scene {
    constructor() {
        super(SceneKeys.StageSelect);
    }

    create(): void {
        this.add
            .text(GAME_WIDTH / 2, 24, 'SELECT STAGE', {
                fontFamily: 'monospace',
                fontSize: '16px',
                color: '#ffffff'
            })
            .setOrigin(0.5);

        progressService.getUnlockedStages().forEach((stage, i) => {
            const done = progressService.isStageComplete(stage.id);
            const label = `${done ? '*' : ' '} ${stage.id.toUpperCase()}`;
            this.add
                .text(GAME_WIDTH / 2, 56 + i * 18, label, {
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: done ? '#8fd18f' : '#ffffff'
                })
                .setOrigin(0.5)
                .setInteractive({ useHandCursor: true })
                .once('pointerdown', () => flowDirector.startStage(stage.id));
        });
    }
}
