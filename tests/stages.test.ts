import { describe, expect, it } from 'vitest';
import { STAGES, getStageById } from '../src/config/stages';

describe('stage registry', () => {
    it('is not empty', () => {
        expect(STAGES.length).toBeGreaterThan(0);
    });

    it('has unique stage ids', () => {
        const ids = STAGES.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('has unique trigger ids within each stage', () => {
        for (const stage of STAGES) {
            const ids = stage.triggers.map((t) => t.id);
            expect(new Set(ids).size).toBe(ids.length);
        }
    });

    it('every next/unlockedBy reference points at a registered stage', () => {
        const ids = new Set(STAGES.map((s) => s.id));
        for (const stage of STAGES) {
            if (stage.next !== undefined) {
                expect(ids.has(stage.next), `${stage.id}.next = ${stage.next}`).toBe(true);
            }
            for (const dep of stage.unlockedBy ?? []) {
                expect(ids.has(dep), `${stage.id}.unlockedBy includes ${dep}`).toBe(true);
            }
        }
    });

    it('every exit destination points at a registered stage', () => {
        const ids = new Set(STAGES.map((s) => s.id));
        for (const stage of STAGES) {
            for (const exit of stage.exits ?? []) {
                if (exit.to !== undefined) {
                    expect(ids.has(exit.to), `${stage.id} exit.to = ${exit.to}`).toBe(true);
                }
            }
        }
    });

    it('getStageById returns the matching stage', () => {
        expect(getStageById('demo').id).toBe('demo');
    });

    it('getStageById throws on an unknown id', () => {
        expect(() => getStageById('nope')).toThrow(/Unknown stage id "nope"/);
    });
});
