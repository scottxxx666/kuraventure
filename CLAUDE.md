# Kuraventure

Pixel RPG web game built with Phaser 3.90 + TypeScript + Vite.

**Start here: read `PLAN.md`** — it is the source of truth for architecture, confirmed
product decisions, implementation milestones, and open questions. Where PLAN.md marks
something **TBD**, ask the user; do not guess.

Status: milestone 6 (subtitle engine) done — `src/subtitles/`: `SubtitleEngine`
(pure TS; polls a `ClockSource` from a host-driven `update()` tick, per-session
track cache, reloads the playing track on `locale:changed`) renders through the
single DOM `SubtitleOverlay` (`.subtitle-bar`). Cue files are
`public/assets/subtitles/<trackId>.<locale>.json` (`start`/`end` in ms —
start-inclusive, end-exclusive; one file per locale, all four required).
`MiniGameScene.showDialogue(trackId)` plays a track against a `GameClock` fed
by scene UPDATE deltas, so dialogue pauses with the scene; the template
mini-game demos it with the `template-intro` track.
Earlier conventions that still apply: all screen-space text is DOM on the
overlay per PLAN.md §3.8, sized in integer multiples of the 12px font grid via
`--px`; `I18nService` typed keys derive from `src/locales/en.json` and
`StageDef.titleKey` is a `MessageKey`, so new stages must add their title to
all four locale files; per-locale Fusion Pixel flavors swap via `src/ui/fonts.ts`.
Next: PLAN.md milestone 7 (video activity — needs the video `ClockSource`
adapter over `video.getCurrentTime()`).

## Dev notes

- Package manager is **yarn** (enforced by a hook — `npm`/`npx` commands are blocked).
- `yarn dev` serves on port 8080 with `host: true` so a phone on the same LAN can
  connect for touch testing. Other scripts: `yarn build`, `yarn preview`,
  `yarn typecheck`, `yarn test` (vitest, tests in `tests/`). **The user runs all
  scripts manually — never run them yourself.**
- Engine is **Phaser 3.90.0** (pinned; user re-confirmed staying on 3.x over the now
  stable Phaser 4). Canvas is 320×180 logical, `pixelArt: true`, `Scale.FIT`
  (`src/config/gameConfig.ts`).
- Every Phaser scene is registered in `src/main.ts`; scene keys live in
  `src/scenes/keys.ts` — never use raw scene-key strings.
