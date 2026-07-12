/** Central registry of Phaser scene keys — always reference scenes through this. */
export const SceneKeys = {
    Boot: 'Boot',
    Preload: 'Preload',
    MainMenu: 'MainMenu',
    StageSelect: 'StageSelect',
    World: 'World',
    Video: 'Video',
    Dialogue: 'Dialogue',
    Talk: 'Talk',
    TemplateMiniGame: 'TemplateMiniGame',
    PizzaRun: 'PizzaRun',
    Flappy: 'Flappy',
    CartCarry: 'CartCarry'
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
