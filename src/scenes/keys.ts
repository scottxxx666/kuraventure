/** Central registry of Phaser scene keys — always reference scenes through this. */
export const SceneKeys = {
    Boot: 'Boot',
    Preload: 'Preload',
    MainMenu: 'MainMenu',
    StageSelect: 'StageSelect',
    World: 'World',
    Video: 'Video',
    Dialogue: 'Dialogue',
    TemplateMiniGame: 'TemplateMiniGame',
    PizzaRun: 'PizzaRun'
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
