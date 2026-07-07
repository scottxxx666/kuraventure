/** The minimal localStorage surface services use; tests inject a fake. */
export interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

/** localStorage access can throw (private-browsing modes) — treat as absent. */
export function defaultStorage(): KeyValueStorage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}
