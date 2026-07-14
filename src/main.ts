import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { eventBus } from './core/EventBus';
import { flowDirector } from './core/FlowDirector';
import { inputService } from './input/InputService';
import { KeyboardSource } from './input/KeyboardSource';
import { createVirtualPadIfTouch } from './input/VirtualPadSource';
import { i18nService } from './services/I18nService';
import { initOverlayScale } from './ui/domOverlay';
import { applyLocaleFont } from './ui/fonts';
import { createRotateOverlayIfTouch } from './ui/rotateOverlay';
import { BootScene } from './scenes/BootScene';
import { DialogueScene } from './scenes/DialogueScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { TemplateMiniGame } from './scenes/minigames/_template/TemplateMiniGame';
import { CartCarryMiniGame } from './scenes/minigames/cart-carry/CartCarryMiniGame';
import { DanceMiniGame } from './scenes/minigames/dance/DanceMiniGame';
import { FlappyMiniGame } from './scenes/minigames/flappy/FlappyMiniGame';
import { PizzaRunMiniGame } from './scenes/minigames/pizza-run/PizzaRunMiniGame';
import { PreloadScene } from './scenes/PreloadScene';
import { StageSelectScene } from './scenes/StageSelectScene';
import { TalkScene } from './scenes/TalkScene';
import { VideoScene } from './scenes/VideoScene';
import { WorldScene } from './scenes/WorldScene';

// Every scene (including future mini-game scenes) is registered here — see PLAN.md §3.1.
const game = new Phaser.Game({
    ...gameConfig,
    scene: [
        BootScene,
        PreloadScene,
        MainMenuScene,
        StageSelectScene,
        WorldScene,
        VideoScene,
        DialogueScene,
        TalkScene,
        TemplateMiniGame,
        PizzaRunMiniGame,
        FlappyMiniGame,
        CartCarryMiniGame,
        DanceMiniGame
    ]
});

flowDirector.init(game);

// Input sources feed the one InputService; gameplay reads only the service (PLAN.md §3.10).
new KeyboardSource(inputService);
createVirtualPadIfTouch(inputService);
// Landscape-only: portrait on a touch device shows a full-screen rotate prompt.
createRotateOverlayIfTouch();

// i18n + pixel font (PLAN.md §3.7): load the stored locale's font flavor now,
// swap flavors on every locale change. Scenes re-render their own texts.
initOverlayScale();
applyLocaleFont(i18nService.getLocale());
eventBus.on('locale:changed', ({ locale }) => applyLocaleFont(locale));
