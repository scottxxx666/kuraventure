# Kuraventure

Pixel RPG web game built with Phaser 3.90 + TypeScript + Vite.

**Start here: read `PLAN.md`** — it is the source of truth for architecture, confirmed
product decisions, implementation milestones, and open questions. Where PLAN.md marks
something **TBD**, ask the user; do not guess.

Status: milestone 7 (video activity) done — `VideoScene` (`src/scenes/VideoScene.ts`)
is THE generic cutscene player: FlowDirector routes every `type: 'video'` activity
into it (`SceneKeys.Video`), it lazy-loads the video in `preload`, fits it to the
320×180 canvas on the metadata event, plays subtitles against a `VideoClock`
(`src/subtitles/VideoClock.ts` — `video.getCurrentTime() * 1000`, so pause/seek
stays in sync), hides the virtual pad while playing, and emits `activity:complete`
on video end or skip. Skippable videos show a localized DOM Skip button
(`video.skip` key, `.video-skip`) revealed by any key/pointer, activated by
tap/click. The demo stage has an optional repeatable `intro-video` trigger playing
`public/assets/video/intro.mp4` (ffmpeg test-pattern placeholder, 8 s, with audio —
autoplay-with-sound after the trigger gesture still needs a real-browser check per
PLAN.md §3.6) with the `intro-video` cue track.
Subtitle conventions (milestone 6): `SubtitleEngine` (pure TS; host-driven
`update()` tick, per-session track cache, reloads the playing track on
`locale:changed`) renders through the single DOM `SubtitleOverlay`
(`.subtitle-bar`). Cue files are `public/assets/subtitles/<trackId>.<locale>.json`
(`start`/`end` in ms — start-inclusive, end-exclusive; one file per locale, all
four required). `MiniGameScene.showDialogue(trackId)` plays a track against a
`GameClock` fed by scene UPDATE deltas, so dialogue pauses with the scene.
Earlier conventions that still apply: all screen-space text is DOM on the
overlay per PLAN.md §3.8, sized in integer multiples of the 12px font grid via
`--px`; `I18nService` typed keys derive from `src/locales/en.json` and
`StageDef.titleKey` is a `MessageKey`, so new stages must add their title to
all four locale files; per-locale Fusion Pixel flavors swap via `src/ui/fonts.ts`.
Next: PLAN.md milestone 8 (real stages & mini-games — **TBD: ask the user** for
the stage list, maps, and mini-game designs; content only, no core changes).

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
