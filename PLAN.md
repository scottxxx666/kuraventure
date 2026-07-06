# Kuraventure — Pixel RPG Web Game: Architecture & Implementation Plan

> **Audience:** This document is the source of truth for the implementing agent (OPUS).
> Follow it exactly. Where something is marked **TBD**, ask the user — do not guess.

## 1. Product Requirements (confirmed with user)

1. Pixel-art RPG in the browser, built with **Phaser**.
2. The game is a set of **stages**; each stage is a **tilemap the player explores**
   (one reusable world scene, a different map per stage). Inside a stage, **triggers**
   (zones / NPC interactions) launch **activities**: mini-games or cutscene videos.
   Progression is **mostly linear with branches** — there is a default stage sequence,
   but some stages are optional or can be done out of order. The stage list and
   mini-game list are **TBD** — the architecture must let new stages, mini-games, and
   videos be added without touching core code.
3. **No save/load of gameplay state.** Only **completion flags** persist (completed
   trigger/stage IDs in **localStorage** — never game state). Map state (door open,
   trigger consumed) and stage unlocking are *derived* from the flags when a map loads.
   A refresh loses mid-map position, never progress. The player can enter or replay any
   unlocked stage from a stage-select screen.
4. **Subtitles in multiple languages**: English (`en`), Traditional Chinese (`zh-TW`),
   Japanese (`ja`), Korean (`ko`). Scope is **full UI + subtitles** — every visible
   string goes through i18n.
5. **Videos play as cutscenes**, triggered inside stages (or between them). Subtitles
   must render over videos too.
6. **Desktop AND mobile browsers.** One **virtual-gamepad input model** everywhere:
   gameplay (world + every mini-game) uses only *direction + A/B action buttons*,
   supplied by keyboard on desktop and an on-screen joystick + buttons on touch
   devices. Menus/UI screens are tap/click (DOM) as normal. Mini-game designs must be
   playable with D-pad + 1–2 buttons — no pointer-position gameplay (exceptions need
   explicit user sign-off).

## 2. Confirmed Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Engine | **Phaser 3.90.0** (re-confirmed 2026-07-07: Phaser 4.x is stable now, but user chose to stay on 3.x) | Mature docs/ecosystem; every API in this plan validated against 3.x |
| Canvas resolution | **320×180 logical** (confirmed 2026-07-07), `Scale.FIT` + integer art scale | Best mobile readability; divides 720p/1080p/4K exactly |
| Language / bundler | **TypeScript + Vite** (official Phaser vite-ts template as starting point) | Typed contracts for stage/mini-game/subtitle/progress interfaces |
| Progress persistence | **localStorage** completion flags (trigger/stage IDs only, versioned key) | Survives refresh; still "no save/load" of state |
| Maps | **Tiled** JSON tilemaps, one per stage, loaded by a single reusable `WorldScene` | Data-driven stages; Phaser has first-class Tiled support |
| Target devices / input | **Desktop + mobile.** Unified `InputService` (direction + A/B); keyboard on desktop, on-screen joystick + buttons on touch. Gameplay never reads pointer position; menus stay tappable. | Write input once; console-style controls fit the pixel-RPG feel |
| Localization scope | **Full UI + subtitles**, `en`, `zh-TW`, `ja`, `ko` | User confirmed |
| Pixel font strategy | **One pixel web font covering Latin + zh-TW + ja + ko** (candidate: Fusion Pixel Font — OFL-licensed, designed on 8/10/12px grids, covers all four scripts; verify coverage/license at implementation time and confirm with user). Render at integer multiples of its grid size to stay crisp. | One font = identical look in all languages; avoids mixing per-script fonts |
| Text rendering | **DOM overlay** for screen-space text (subtitles, menus, HUD labels); **Phaser BitmapText/Text** for world-space text. See §3.8 for the policy. | Each where it's strongest |
| Video subtitles | **One custom subtitle engine** (DOM overlay) shared by in-game dialogue AND video playback — no WebVTT | Single format, single styling, language switch works everywhere |
| i18n mechanism | **Custom lightweight module** (typed keys, JSON per locale). Alternative considered: i18next — rejected for now (YAGNI; 4 locales but no plural/ICU needs yet). Revisit only if requirements grow (pluralization, interpolation-heavy text). | Simplicity |

## 3. Architecture Overview

Layering (adapted from routes→controllers→services→repositories to a game context):

```
Scenes (presentation: WorldScene, activity scenes (mini-games/video), DOM overlays)
   │  emit/consume typed events only
FlowDirector (control: launches stages, pauses world ↔ runs activities, advances flow)
   │
Services (domain: ProgressService, I18nService, SubtitleEngine)
   │
Storage / Assets (localStorage wrapper, static JSON, Tiled maps, video/image files)
```

Two-level flow model:
- A **stage** = one Tiled map, played by the single reusable `WorldScene`.
- An **activity** = a mini-game or a video, launched by a **trigger** inside a stage.
  FlowDirector *pauses* `WorldScene`, *launches* the activity scene, and on
  `activity:complete` stops it and *resumes* `WorldScene` where the player stood
  (Phaser `scene.pause`/`launch`/`resume` — no state serialization needed).

Rules:
- Scenes never touch `localStorage` or read stage config directly — they go through
  services / FlowDirector.
- All cross-scene communication uses the typed event bus (thin wrapper around
  `Phaser.Events.EventEmitter`); no scene reaches into another scene's fields.
- Everything about game progression is **data-driven** via the stage registry
  (`config/stages.ts` + `stages/<id>/config.ts`) — adding a stage or cutscene must
  require config + assets only (plus a scene subclass only for a brand-new mini-game);
  no FlowDirector changes.

### 3.1 Directory Structure

```
src/
  main.ts                    # Phaser.Game bootstrap (registers all scenes)
  config/
    gameConfig.ts            # Phaser.Types.Core.GameConfig (pixelArt: true, scale config)
    stages.ts                # stage REGISTRY: imports stages/<id>/config.ts, defines
                             # default order + unlock graph (see §3.2)
  core/
    FlowDirector.ts          # launches stages, pause-world/run-activity/resume, advances flow
    EventBus.ts              # typed event emitter + event name constants/types
  scenes/
    BootScene.ts             # minimal, loads preload assets
    PreloadScene.ts          # loads global assets, shows progress bar
    MainMenuScene.ts         # start / language / stage-select entry
    StageSelectScene.ts      # lists UNLOCKED stages, enter/replay any of them
    WorldScene.ts            # THE reusable map scene: builds itself from a StageDef
                             # (tilemap, spawn, triggers); one instance serves all stages
    VideoScene.ts            # generic cutscene player (any video + subtitle track)
    minigames/               # SHARED pool — any stage's trigger can reference any mini-game
      MiniGameScene.ts       # abstract base class — THE mini-game contract (§3.3)
      _template/
        TemplateMiniGame.ts  # copy-me example implementing the contract
      <name>/                # one folder per real mini-game; stage-private helpers
        <Name>MiniGame.ts    #   (entities, constants) live beside the scene file
  stages/
    <stage-id>/              # one folder per stage — CONTENT only, no core logic
      config.ts              # StageDef: tilemap key/url, spawn, triggers (§3.2)
      script.ts              # OPTIONAL per-stage hooks (onEnter, custom trigger handlers)
                             # called by WorldScene if present; omit when data suffices
  input/
    InputService.ts          # THE input abstraction: direction vector + A/B buttons +
                             # typed events; gameplay code reads ONLY this (§3.10)
    KeyboardSource.ts        # arrows/WASD + Z/X (or Space/Enter) → InputService
    VirtualPadSource.ts      # on-screen joystick + A/B buttons (DOM via ui/domOverlay),
                             # created only on touch devices → InputService
  services/
    ProgressService.ts       # completion-flag persistence + unlock derivation (localStorage)
    I18nService.ts           # locale loading, t(key), locale-change event
  subtitles/
    SubtitleEngine.ts        # cue scheduling against a clock source (§3.5)
    SubtitleOverlay.ts       # DOM renderer (a styled div above the canvas)
    types.ts                 # SubtitleCue, SubtitleTrack, ClockSource
  ui/
    domOverlay.ts            # helpers to position DOM elements over the canvas
  locales/
    en.json                  # UI strings (imported as module for typed keys)
    zh-TW.json
    ja.json
    ko.json
public/assets/
  maps/                      # Tiled JSON, one per stage (+ shared tileset images)
  video/                     # .mp4/.webm cutscenes
  subtitles/                 # <trackId>.<locale>.json cue files (lazy-loaded)
  images/ audio/ ...         # stage-specific art under images/<stage-or-minigame-id>/
tests/                       # vitest unit tests for services & subtitle timing
```

Placement rules (so nothing lands in the wrong place):
- New **stage** → `src/stages/<id>/` + a map in `public/assets/maps/` + register in
  `config/stages.ts`. Never touches `core/` or `scenes/`.
- New **mini-game** → `src/scenes/minigames/<name>/` + scene-key registration in
  `main.ts`. Referenced from stage triggers; never owned by one stage folder.
- New **video** → assets only (`public/assets/video/` + `subtitles/`) + a trigger entry.
- Anything shared by 2+ mini-games graduates out of a mini-game folder into
  `core/`/`services/`/`ui/` as appropriate.

### 3.2 Stage & Activity Config (data-driven flow)

Types (in `src/config/stages.ts`; each stage's data lives in `src/stages/<id>/config.ts`):

```ts
export type ActivityRef =
  | { type: 'minigame'; sceneKey: string }        // scene key of a MiniGameScene subclass
  | {
      type: 'video';
      videoKey: string;                            // key for the lazy loader
      videoUrl: string;                            // public/assets/video/...
      subtitleTrackId?: string;                    // public/assets/subtitles/<id>.<locale>.json
      skippable: boolean;
    };

export interface TriggerDef {
  id: string;                    // unique WITHIN the stage; flag is `${stageId}/${id}`
  at: { objectName: string };    // named object in the Tiled map (zone or NPC spawn)
  activity: ActivityRef;
  required: boolean;             // counts toward stage completion
  once: boolean;                 // if true, consumed (hidden) once completed
}

export interface StageDef {
  id: string;                    // unique, stable — used in completion flags
  titleKey: string;              // i18n key shown in stage select
  tilemapKey: string;
  tilemapUrl: string;            // public/assets/maps/...
  spawn: { objectName: string }; // player spawn point object in the Tiled map
  triggers: TriggerDef[];
  next?: string;                 // default next stage (the "mostly linear" spine)
  unlockedBy?: string[];         // stage IDs that must be complete first; omitted on
                                 // the spine = unlocked when `next` chain reaches it;
                                 // used for optional/branch stages
}

export const STAGES: StageDef[] = [ /* registry, imports from src/stages/<id>/ */ ];
```

A stage is **complete** when every `required: true` trigger's flag is set.
Trigger positions/spawn points live in the Tiled map as named objects; `config.ts` only
binds names to activities, so level layout stays entirely in the map editor.

`FlowDirector` responsibilities (and nothing more):
- `startStage(stageId)` — used by MainMenu (first unlocked stage) and StageSelectScene;
  starts `WorldScene` with the `StageDef` as scene data.
- On `EventBus` event `activity:start` (from a WorldScene trigger) → pause `WorldScene`,
  launch the activity scene (`VideoScene` with the `ActivityRef` as scene data, or the
  mini-game's `sceneKey`).
- On `activity:complete` → stop the activity scene, record the flag via
  `ProgressService.markCompleted(flagId)`, resume `WorldScene`. If the stage is now
  complete → mark the stage complete (unlocks branches / the `next` stage) and prompt
  advance to `next` (or return to StageSelect when there is no `next`).
- After the final spine stage → an end/credits state (simple return to MainMenu is fine
  for v1).

### 3.3 Mini-game Contract

```ts
// scenes/minigames/MiniGameScene.ts
export abstract class MiniGameScene extends Phaser.Scene {
  /** Called with the triggering context; base class stores it. */
  init(data: { activity: ActivityRef; flagId: string }): void;

  /** Subclasses MUST call this exactly once when the player finishes. */
  protected completeActivity(result?: unknown): void; // emits 'activity:complete' on EventBus

  /** Subclasses MAY call to show timed in-game dialogue (uses SubtitleEngine
      with the game-clock source). */
  protected showDialogue(trackId: string): Promise<void>;
}
```

Adding a mini-game = create a subclass in `scenes/minigames/<name>/`, register its scene
key in `main.ts`, reference it from any stage's `TriggerDef`. No changes to
FlowDirector/EventBus. Mini-games are otherwise unconstrained (own physics, tilemaps,
input) — they only owe the framework a `completeActivity()` call, and they MUST read
player input only through `InputService` (§3.10): direction + A/B, never raw keyboard
or pointer position. Mini-games are a shared pool: multiple stages may trigger the
same mini-game.

### 3.4 Progress & Unlocking

`ProgressService` (pure TS class, no Phaser imports — unit-testable):
- Storage key: `kuraventure.progress.v1` →
  `{ completedTriggers: string[], completedStages: string[] }`
  (trigger flags are `${stageId}/${triggerId}`; insertion order).
- `markCompleted(flagId)`, `markStageCompleted(stageId)`, `isCompleted(flagId)`,
  `isStageComplete(stageId)`,
  `getUnlockedStages(): StageDef[]` — derived from `STAGES` + completed flags
  (spine stages unlock as the `next` chain is completed; branch stages when their
  `unlockedBy` list is complete; drop unknown IDs so config changes can't crash the UI).
- Wrap all `localStorage` access in try/catch (private-browsing modes throw) and fall
  back to an in-memory set.
- **No other state is ever persisted.** Map state (consumed triggers, open doors) is
  *derived* from flags when `WorldScene` builds the map; entering a stage always starts
  it fresh at its spawn point.

`StageSelectScene`: renders `getUnlockedStages()` as a list (completed stages marked);
selecting one calls `FlowDirector.startStage(id)`. Replaying a completed stage is
allowed and never erases flags.

### 3.5 Subtitle Engine (shared by dialogue AND video)

Data format — `public/assets/subtitles/<trackId>.<locale>.json`:

```json
{ "cues": [ { "start": 1200, "end": 3400, "text": "Hello!" } ] }
```
(`start`/`end` in ms; one file per track per locale; loaded lazily by
`SubtitleEngine.loadTrack(trackId, locale)`.)

Core abstraction — the **clock source**:

```ts
export interface ClockSource { nowMs(): number }   // monotonic within a playback
```

- In-game dialogue → clock adapter over the scene's elapsed time (pause-aware).
- Video → clock adapter over `video.getCurrentTime() * 1000` from the Phaser Video
  game object, so **seeking/pausing video keeps subtitles in sync automatically**.

`SubtitleEngine.play(track, clock)` polls the clock each Phaser update tick (an
`update()` hookup, not `setInterval`) and tells `SubtitleOverlay` which cue is active.
`SubtitleOverlay` is a single DOM `<div>` positioned over the canvas (via `ui/domOverlay.ts`):
DOM gives crisp readable text at any canvas zoom, trivial CJK font support, and one CSS
stylesheet for both dialogue and video subtitles. On locale change (event from
`I18nService`), the engine reloads the current track in the new locale and re-syncs.

### 3.6 Video / Cutscenes

`VideoScene` (one generic scene, parameterized by the `ActivityRef`; launched by
FlowDirector over the paused `WorldScene` like any other activity):
- `this.load.video(videoKey, videoUrl)` in its `preload`, `this.add.video(...)` centered
  and scaled to fit in `create`, then `video.play()`.
- Autoplay policy: playback always starts after a user gesture (menu click / trigger
  interaction), so sound is allowed; still verify on first implementation and fall back
  to muted + "tap to enable sound" if a browser blocks it.
- If `subtitleTrackId` is set: `SubtitleEngine.play(track, videoClock)`.
- If `skippable`: any key/pointer shows a localized "Skip" button; skipping stops video +
  subtitles and emits `activity:complete`.
- On video `complete` event → `activity:complete`.

### 3.7 i18n

`I18nService`:
- `en.json` / `zh-TW.json` / `ja.json` / `ko.json` imported statically; key type derived from `en.json`
  (`type MessageKey = keyof typeof en`) so `t(key)` is compile-time checked and a missing
  translation in another locale is a type/test error.
- `t(key: MessageKey): string`, `setLocale(locale)` → persists choice to
  `kuraventure.locale` in localStorage and emits `locale:changed` on the EventBus.
- Scenes re-render their texts on `locale:changed` (each scene owns its refresh).
- Font: use the single multi-script pixel font from §2 (candidate: Fusion Pixel Font)
  as a web font for all DOM text. Confirm the exact font with the user before milestone 4.
- CJK line breaking: DOM/CSS handles ja kinsoku and ko word-boundary wrapping natively
  (`overflow-wrap`, `line-break: strict` for ja) — another reason screen-space text is
  DOM, since Phaser's word-wrap is space-based and poor for CJK.

### 3.8 Text Rendering Policy (DOM overlay vs Phaser text)

**Use the DOM overlay** for *screen-space* text — text that belongs to the "screen", not
the game world: subtitles (dialogue + video), menus, stage-select list, language switcher,
skip button, any paragraph-length localized text. Reasons: correct CJK wrapping, easy
web-font loading for all four scripts, crisp at any canvas zoom, one CSS stylesheet,
renders above `<video>`/canvas trivially.

**Use Phaser text** for *world-space* text — text that lives inside the game simulation:
damage numbers, name tags above sprites, signs on the map, anything that must move with
the camera, sit in the depth/scroll system, or be tinted/tweened with game objects.
Prefer `BitmapText` (pre-baked pixel glyphs, pixel-perfect at integer scales) for
short Latin/digit strings; if world-space text must be localized CJK, use `Phaser.Text`
with the same web font at an integer multiple of its pixel grid — but prefer designing
world text to be language-neutral (icons/numbers) so this stays rare.

Rule of thumb for OPUS: *if the camera moves and the text shouldn't → DOM; if the text
belongs to a game object → Phaser.* Keep every DOM element inside the `ui/domOverlay.ts`
container so scaling/positioning stays in one place.

**Keeping DOM text pixel-styled:** use a true pixel font at exact integer multiples of
its native grid (e.g. 12px, 24px, 36px for a 12px-grid font — never 30px), disable
smoothing (`-webkit-font-smoothing: none; font-smooth: never;` where supported), avoid
fractional positions/transforms (round to device pixels), and skip anti-aliased effects
like blur/soft shadows (hard 1px offset shadows only). Done this way, DOM text is
visually indistinguishable from bitmap-font text.

### 3.9 WorldScene (the one map scene)

One reusable `Phaser.Scene` serving every stage; never subclassed per stage.
`init({ stage: StageDef })`, then in `create`:
- Load/build the Tiled tilemap (`tilemapKey`), place the player at the `spawn` named
  object, set up camera follow + collision layers, and standard top-down movement
  driven by `InputService.direction()` (§3.10); `A` interacts with triggers/NPCs.
- For each `TriggerDef`, find its named object in the map and create an interaction
  zone/NPC. Skip triggers whose flag is already set when `once: true` (derived map
  state — §3.4). Entering/interacting emits `activity:start` on the EventBus; the
  FlowDirector handles pause/launch (WorldScene never launches activity scenes itself).
- If `src/stages/<id>/script.ts` exists, call its exported hooks
  (`onEnter(scene)`, optional per-trigger overrides). Hooks are the escape hatch for
  stage-specific behavior that data can't express — prefer data; keep scripts rare
  and small.
- On resume after an activity, refresh trigger/map state from `ProgressService`
  (a just-completed `once` trigger disappears without reloading the map).

### 3.10 Input (desktop + mobile, one abstraction)

`InputService` (in `src/input/`) is the only input API gameplay code may use:

```ts
export interface GameInput {
  direction(): { x: number; y: number };   // normalized, from keys or joystick
  isDown(button: 'A' | 'B'): boolean;
  onPress(button: 'A' | 'B', cb: () => void): () => void; // returns unsubscribe
}
```

- Sources: `KeyboardSource` always; `VirtualPadSource` (DOM joystick + A/B buttons via
  `ui/domOverlay.ts`, bottom-left/bottom-right) created when touch is detected.
  Both feed the same `InputService`; if both exist, most-recent-input wins.
- `WorldScene` movement and every mini-game read only `InputService` — never raw
  keyboard events, never pointer position. This is what makes each mini-game work on
  both platforms with zero per-platform code.
- Menus / stage select / skip button / language switcher are DOM and stay
  tap/click-driven; the virtual pad hides while a menu scene or video is active.
- Design constraints that follow: mini-games must be D-pad + 1–2 buttons playable;
  avoid pixel-precise or twitch-heavy challenges (virtual sticks are imprecise); keep
  critical visuals out of the bottom screen corners (thumbs sit there).

## 4. Implementation Milestones (for OPUS)

Do these in order; each is a coherent, reviewable unit. **Do not run build/test/lint
scripts — the user runs them manually** (per user's global rules). Write tests; don't run them.

Milestones 1–7 build the **framework**; the directory layout of §3.1 is final from
milestone 1, so stage/mini-game content added later (milestone 8+) never moves files.

1. **Scaffold** — Phaser 3.90 + TS + Vite (start from the official `template-vite-ts`),
   `gameConfig.ts` with `pixelArt: true`, Boot/Preload/MainMenu placeholder scenes, and a
   project `CLAUDE.md` pointing here. *Accept:* game boots to menu.
2. **World core + input** — `EventBus`, `FlowDirector.startStage`, `InputService` with
   `KeyboardSource` and `VirtualPadSource` (§3.10), `WorldScene` with one placeholder
   Tiled map (`src/stages/demo/`), player movement + collision, spawn from named
   object. *Accept:* menu starts the demo stage; player walks with keys on desktop AND
   with the on-screen joystick on a phone/touch emulation. *Tests:* stage registry
   lookup, InputService source merging.
3. **Activity flow** — `TriggerDef` handling in `WorldScene`, pause/launch/resume in
   `FlowDirector`, `MiniGameScene` base + `TemplateMiniGame` (a "press A to finish"
   placeholder), one trigger in the demo map. *Accept:* walking into the trigger runs
   the mini-game; finishing it returns to the map at the same spot; a `once` trigger
   disappears. *Tests:* FlowDirector activity dispatch + completion handling.
4. **Progress & unlocking** — `ProgressService` + `StageSelectScene` + menu entry; a
   second demo stage on the spine plus one branch stage to prove `next`/`unlockedBy`.
   *Accept:* refresh browser, completion flags survive; stage select shows exactly the
   unlocked stages; replay works. *Tests:* persistence, unlock derivation (spine +
   branch), unknown-ID filtering, storage-failure fallback.
5. **i18n** — `I18nService`, 4 locale files, language switcher in menu, all existing UI
   strings converted; load the confirmed pixel web font (ask user per §3.7 if not yet
   confirmed). *Accept:* live switching among en / zh-TW / ja / ko updates every visible
   string and renders correctly in the pixel font. *Tests:* locale completeness (every
   `MessageKey` exists in every locale), persistence.
6. **Subtitle engine** — types, engine, DOM overlay, game-clock adapter; wire
   `showDialogue()` into the template mini-game. *Accept:* timed dialogue displays and
   switches language live. *Tests:* cue selection at boundary times, pause behavior,
   locale reload.
7. **Video activity** — `VideoScene` + video-clock adapter + skip, launched from a
   trigger in the demo map. Use any placeholder .mp4/.webm. *Accept:* video plays with
   synced subtitles in all four languages; skip works; completion resumes the map and
   records the flag.
8. **Real stages & mini-games** — **TBD: ask the user for the stage list (spine +
   branches), maps, and mini-game designs.** Each stage/mini-game is a separate
   milestone using §3.2/§3.3; content only, no core changes.
9. **Polish** — responsive `Scale.FIT` tuning, transitions, audio, credits. TBD scope.

## 5. Open Questions (ask the user — do not assume)

- The actual stage list: the linear spine, which stages branch off it, and each stage's
  map contents/triggers.
- Which mini-games (gameplay, count) and which stages trigger them.
- Art direction: asset sources (including tilesets for the Tiled maps).
  (Canvas resolution is DECIDED: 320×180 — see §2.)
- Confirm the multi-script pixel font (proposed: Fusion Pixel Font covering
  Latin/zh-TW/ja/ko) or the user supplies another.
- Audio: music/SFX requirements; whether videos carry their own audio.
- Mobile orientation: lock to landscape (assumed — matches joystick-left/buttons-right
  layout) or also support portrait?
  (Target devices are DECIDED: desktop + mobile with the unified gamepad input of §3.10.)
