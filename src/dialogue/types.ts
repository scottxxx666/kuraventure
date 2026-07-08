/**
 * Talk data model (PLAN.md §3.11). A "graph" is an Ink script — the source
 * language is English and lives directly in the .ink file; other locales are
 * flat string tables keyed by the `id:` tag on the line/choice that needs
 * translating (see TalkRunner for the file layout).
 */

/** One line of dialogue, already localized. */
export interface TalkLine {
    text: string;
    /** Who says the line — `speaker:` tag; keys TalkScene's portrait map. */
    speaker?: string;
    /** `id:` tag, if any — used to look up a translation and (for choices) log. */
    id?: string;
}

/** One player-facing choice, already localized. */
export interface TalkChoice {
    text: string;
    id?: string;
}
