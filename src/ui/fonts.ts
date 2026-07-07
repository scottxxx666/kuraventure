import type { Locale } from '../services/I18nService';

/**
 * Fusion Pixel Font 12px proportional (confirmed 2026-07-07), one flavor per
 * locale: same charset, language-specific Han glyph conventions. Only the
 * active locale's ~700 KB woff2 is fetched; each flavor loads once per session.
 */
const FLAVORS: Record<Locale, string> = {
    en: 'latin',
    'zh-TW': 'zh_hant',
    ja: 'ja',
    ko: 'ko'
};

const loading = new Set<Locale>();

/**
 * Points --ui-font at the locale's flavor and sets <html lang> (CJK line
 * breaking, §3.7). Until the woff2 loads, display:swap shows the monospace
 * fallback; if it fails to load, that fallback simply stays.
 */
export function applyLocaleFont(locale: Locale): void {
    document.documentElement.lang = locale;
    const flavor = FLAVORS[locale];
    const family = `fusion-pixel-${flavor}`;
    if (!loading.has(locale)) {
        loading.add(locale);
        const face = new FontFace(
            family,
            `url(assets/fonts/fusion-pixel-12px-proportional-${flavor}.otf.woff2)`,
            { display: 'swap' }
        );
        document.fonts.add(face);
        face.load().catch((err) => console.warn(`Pixel font "${family}" failed to load`, err));
    }
    document.documentElement.style.setProperty('--ui-font', `"${family}", monospace`);
}
