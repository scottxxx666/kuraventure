import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import en from '../src/locales/en.json';
import ja from '../src/locales/ja.json';
import ko from '../src/locales/ko.json';
import zhTW from '../src/locales/zh-TW.json';
import { I18nService, LOCALES } from '../src/services/I18nService';
import type { Locale } from '../src/services/I18nService';
import type { KeyValueStorage } from '../src/services/storage';

const STORAGE_KEY = 'kuraventure.locale';

function makeStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
    const data = new Map(Object.entries(initial));
    return {
        data,
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => {
            data.set(key, value);
        }
    };
}

describe('locale completeness', () => {
    const translations: Record<Exclude<Locale, 'en'>, Record<string, string>> = {
        'zh-TW': zhTW,
        ja,
        ko
    };

    it.each(Object.keys(translations))('%s has exactly the same keys as en', (locale) => {
        const keys = Object.keys(translations[locale as Exclude<Locale, 'en'>]).sort();
        expect(keys).toEqual(Object.keys(en).sort());
    });

    it.each(['en', ...Object.keys(translations)])('%s has no empty values', (locale) => {
        const messages: Record<string, string> =
            locale === 'en' ? en : translations[locale as Exclude<Locale, 'en'>];
        for (const [key, value] of Object.entries(messages)) {
            expect(value.trim(), `${locale}: "${key}" is empty`).not.toBe('');
        }
    });
});

describe('I18nService', () => {
    it('defaults to en with empty storage and translates keys', () => {
        const i18n = new I18nService(makeStorage(), new EventBus());
        expect(i18n.getLocale()).toBe('en');
        expect(i18n.t('stageSelect.title')).toBe(en['stageSelect.title']);
    });

    it('t() follows the active locale', () => {
        const i18n = new I18nService(null, new EventBus());
        i18n.setLocale('ja');
        expect(i18n.t('stageSelect.title')).toBe(ja['stageSelect.title']);
        i18n.setLocale('zh-TW');
        expect(i18n.t('stageSelect.title')).toBe(zhTW['stageSelect.title']);
    });

    it('t() interpolates {name} placeholders from params', () => {
        const i18n = new I18nService(null, new EventBus());
        expect(i18n.t('world.exitNeedsItems', { items: 'Demo Key' })).toBe('You need: Demo Key');
    });

    it('t() leaves unknown placeholders untouched and ignores extra params', () => {
        const i18n = new I18nService(null, new EventBus());
        expect(i18n.t('world.exitNeedsItems', { other: 'x' })).toBe(en['world.exitNeedsItems']);
        expect(i18n.t('menu.title', { items: 'x' })).toBe(en['menu.title']);
    });

    it('every locale interpolates the {items} placeholder', () => {
        const i18n = new I18nService(null, new EventBus());
        for (const locale of LOCALES) {
            i18n.setLocale(locale);
            const text = i18n.t('world.exitNeedsItems', { items: 'XYZ' });
            expect(text).toContain('XYZ');
            expect(text).not.toContain('{items}');
        }
    });

    it('persists the choice and restores it in a new instance', () => {
        const storage = makeStorage();
        new I18nService(storage, new EventBus()).setLocale('ko');
        expect(storage.data.get(STORAGE_KEY)).toBe('ko');
        expect(new I18nService(storage, new EventBus()).getLocale()).toBe('ko');
    });

    it('ignores an invalid stored locale', () => {
        const storage = makeStorage({ [STORAGE_KEY]: 'fr' });
        expect(new I18nService(storage, new EventBus()).getLocale()).toBe('en');
    });

    it('emits locale:changed with the new locale', () => {
        const bus = new EventBus();
        const seen: Locale[] = [];
        bus.on('locale:changed', ({ locale }) => seen.push(locale));
        const i18n = new I18nService(null, bus);
        i18n.setLocale('ja');
        expect(seen).toEqual(['ja']);
    });

    it('does not emit when setting the already-active locale', () => {
        const bus = new EventBus();
        let calls = 0;
        bus.on('locale:changed', () => calls++);
        const i18n = new I18nService(null, bus);
        i18n.setLocale('en');
        expect(calls).toBe(0);
    });

    it('keeps working when storage throws', () => {
        const throwingStorage: KeyValueStorage = {
            getItem: () => {
                throw new Error('denied');
            },
            setItem: () => {
                throw new Error('quota');
            }
        };
        const bus = new EventBus();
        const seen: Locale[] = [];
        bus.on('locale:changed', ({ locale }) => seen.push(locale));

        const i18n = new I18nService(throwingStorage, bus);
        expect(i18n.getLocale()).toBe('en');
        i18n.setLocale('zh-TW');
        expect(i18n.getLocale()).toBe('zh-TW');
        expect(seen).toEqual(['zh-TW']);
    });

    it('every locale in LOCALES is switchable', () => {
        const i18n = new I18nService(null, new EventBus());
        for (const locale of LOCALES) {
            i18n.setLocale(locale);
            expect(i18n.getLocale()).toBe(locale);
            expect(i18n.t('menu.start').trim()).not.toBe('');
        }
    });
});
