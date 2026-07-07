import type { MessageKey } from '../services/I18nService';

/**
 * Item registry (PLAN.md §3.4). Items are permanent booleans: granted by
 * triggers (`TriggerDef.grantsItems`) when they complete, required by stage
 * exits (`ExitDef.requiredItems`), never consumed.
 * Pure TS — no Phaser imports — unit-testable.
 */

export interface ItemDef {
    /** Unique, stable — persisted in the progress inventory. */
    id: string;
    /** i18n key for the item's display name (exit messages, pickup toast). */
    nameKey: MessageKey;
}

export const ITEMS = [
    { id: 'demo-key', nameKey: 'item.demo-key.name' }
] as const satisfies readonly ItemDef[];

/** IDs of registered items — config fields referencing items are typed with this. */
export type ItemId = (typeof ITEMS)[number]['id'];

export function getItemById(id: ItemId): ItemDef {
    const item = ITEMS.find((i) => i.id === id);
    if (!item) {
        throw new Error(`Unknown item id "${id}" — is it registered in config/items.ts?`);
    }
    return item;
}
