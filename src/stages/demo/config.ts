import type { StageDef } from '../../config/stages';

/** Placeholder stage for milestones 2–3; triggers arrive in milestone 3. */
export const demoStage: StageDef = {
    id: 'demo',
    titleKey: 'stage.demo.title',
    tilemapKey: 'map-demo',
    tilemapUrl: 'assets/maps/demo.json',
    spawn: { objectName: 'spawn' },
    triggers: []
};
