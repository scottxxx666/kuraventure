import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../config/gameConfig';
import { inputService } from '../../../input/InputService';
import { SceneKeys } from '../../keys';
import { MiniGameScene } from '../MiniGameScene';

/**
 * Copy-me example (PLAN.md §3.3): the minimal valid mini-game — press A to
 * finish. Real mini-games live in scenes/minigames/<name>/ and register their
 * scene key in keys.ts + main.ts.
 */
export class TemplateMiniGame extends MiniGameScene {
    constructor() {
        super(SceneKeys.TemplateMiniGame);
    }

    create(): void {
        this.cameras.main.setBackgroundColor('#1d2233');

        this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 12, 'TEMPLATE MINI-GAME', {
                fontFamily: 'monospace',
                fontSize: '14px',
                color: '#ffffff'
            })
            .setOrigin(0.5);
        this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 12, 'Press A (Z / Space) to finish', {
                fontFamily: 'monospace',
                fontSize: '10px',
                color: '#aaaaaa'
            })
            .setOrigin(0.5);

        const unsubscribe = inputService.onPress('A', () => this.completeActivity());
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    }
}
