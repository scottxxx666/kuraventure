import { describe, expect, it } from 'vitest';
import { ITEMS, getItemById } from '../src/config/items';
import type { ItemId } from '../src/config/items';

describe('item registry', () => {
    it('has unique item ids', () => {
        const ids = ITEMS.map((i) => i.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('getItemById returns the matching item', () => {
        expect(getItemById('demo-key').nameKey).toBe('item.demo-key.name');
    });

    it('getItemById throws on an unknown id', () => {
        expect(() => getItemById('nope' as ItemId)).toThrow(/Unknown item id "nope"/);
    });
});
