import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { flowDirector } from './core/FlowDirector';
import { inputService } from './input/InputService';
import { KeyboardSource } from './input/KeyboardSource';
import { createVirtualPadIfTouch } from './input/VirtualPadSource';
import { BootScene } from './scenes/BootScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { TemplateMiniGame } from './scenes/minigames/_template/TemplateMiniGame';
import { PreloadScene } from './scenes/PreloadScene';
import { StageSelectScene } from './scenes/StageSelectScene';
import { WorldScene } from './scenes/WorldScene';

// Every scene (including future mini-game scenes) is registered here — see PLAN.md §3.1.
const game = new Phaser.Game({
    ...gameConfig,
    scene: [BootScene, PreloadScene, MainMenuScene, StageSelectScene, WorldScene, TemplateMiniGame]
});

flowDirector.init(game);

// Input sources feed the one InputService; gameplay reads only the service (PLAN.md §3.10).
new KeyboardSource(inputService);
createVirtualPadIfTouch(inputService);
