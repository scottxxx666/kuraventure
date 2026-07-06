/** Central registry of Phaser scene keys — always reference scenes through this. */
export const SceneKeys = {
    Boot: 'Boot',
    Preload: 'Preload',
    MainMenu: 'MainMenu',
    StageSelect: 'StageSelect',
    World: 'World',
    TemplateMiniGame: 'TemplateMiniGame'
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
