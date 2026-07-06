import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { BootScene } from './scenes/BootScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { PreloadScene } from './scenes/PreloadScene';

// Every scene (including future mini-game scenes) is registered here — see PLAN.md §3.1.
new Phaser.Game({
    ...gameConfig,
    scene: [BootScene, PreloadScene, MainMenuScene]
});
