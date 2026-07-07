import { EventBus, eventBus } from '../core/EventBus';
import en from '../locales/en.json';
import ja from '../locales/ja.json';
import ko from '../locales/ko.json';
import zhTW from '../locales/zh-TW.json';
import { defaultStorage } from './storage';
import type { KeyValueStorage } from './storage';

/**
 * Locale state + t(key) (PLAN.md §3.7). Locale files are imported statically;
 * MessageKey derives from en.json so a bad key is a compile error, and the
 * MESSAGES assignment below makes a missing translation in any locale a
 * compile error too. Pure TS — no Phaser/DOM imports — unit-testable; the
 * pixel-font swap lives in ui/fonts.ts, driven by the locale:changed event.
 */

export const LOCALES = ['en', 'zh-TW', 'ja', 'ko'] as const;
export type Locale = (typeof LOCALES)[number];
export type MessageKey = keyof typeof en;

/** Switcher labels: each language named in itself — never translated via t(). */
export const LOCALE_LABELS: Record<Locale, string> = {
    en: 'English',
    'zh-TW': '繁體中文',
    ja: '日本語',
    ko: '한국어'
};

const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
    en,
    'zh-TW': zhTW,
    ja,
    ko
};

const STORAGE_KEY = 'kuraventure.locale';

function isLocale(value: string | null): value is Locale {
    return LOCALES.includes(value as Locale);
}

export class I18nService {
    private locale: Locale = 'en';

    /** Pass null storage for in-memory only (also the fallback when storage fails). */
    constructor(
        private readonly storage: KeyValueStorage | null = defaultStorage(),
        private readonly bus: EventBus = eventBus
    ) {
        try {
            const stored = this.storage?.getItem(STORAGE_KEY) ?? null;
            if (isLocale(stored)) {
                this.locale = stored;
            }
        } catch {
            // Unreadable storage — keep the default locale.
        }
    }

    getLocale(): Locale {
        return this.locale;
    }

    /** `{name}` placeholders are replaced from `params`; unknown ones are left as-is. */
    t(key: MessageKey, params?: Record<string, string>): string {
        const message = MESSAGES[this.locale][key];
        if (!params) {
            return message;
        }
        return message.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
    }

    setLocale(locale: Locale): void {
        if (locale === this.locale) {
            return;
        }
        this.locale = locale;
        try {
            this.storage?.setItem(STORAGE_KEY, locale);
        } catch {
            // Quota/private-mode failure — the choice just won't survive reload.
        }
        this.bus.emit('locale:changed', { locale });
    }
}

export const i18nService = new I18nService();
