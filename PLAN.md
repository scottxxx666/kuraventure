# Kuraventure — Architecture & Conventions

> Source of truth for architecture, confirmed product decisions, and remaining work.
> The framework build-out (milestones 1–7) is **complete** — §3 describes how it
> works and how content is added. Where something is marked **TBD**, ask the user;
> do not guess. Section numbers (§3.x) are referenced from code comments — keep
> them stable.

## 1. Product Requirements (confirmed)

- Pixel-art RPG in the browser, built with **Phaser**. The game is a set of
  **stages** — each a Tiled map explored via one reusable world scene. **Triggers**
  in a stage (zones / NPC interactions) launch **activities**: mini-games or
  cutscene videos. Progression is mostly linear with branches. Adding stages,
  mini-games, or videos never touches core code.
- **No save/load of gameplay state.** Only completion flags and the item
  inventory persist (localStorage). Map state (door open, trigger consumed) and
  stage unlocking are *derived* from the flags. A refresh loses mid-map position,
  never progress; any unlocked stage can be entered or replayed from stage select.
- **Items** are permanent booleans (never consumed, no quantities), granted by
  triggers (map pickups, mini-game rewards, NPC/cutscene gifts) and required by
  **gated in-map exits**: a stage's exit door opens only when the stage is
  complete AND the exit's required items are held (§3.2, §3.4, §3.9).
- **Full UI + subtitle i18n**: `en`, `zh-TW`, `ja`, `ko`. Every visible string goes
  through i18n; subtitles render over videos too.
- **Desktop AND mobile browsers.** One virtual-gamepad input model everywhere:
  gameplay uses only *direction + A/B* (keyboard on desktop, on-screen joystick +
  buttons on touch). Menus/UI are tap/click DOM. Mini-games must be playable with
  D-pad + 1–2 buttons — no pointer-position gameplay (exceptions need explicit
  user sign-off).

## 2. Technical Decisions (confirmed)

| Decision | Choice |
|---|---|
| Engine | **Phaser 3.90.0**, pinned — user chose to stay on 3.x over the now-stable Phaser 4 |
| Canvas | **320×180 logical**, `Scale.FIT`, `pixelArt: true`, integer art scale |
| Language / bundler | TypeScript + Vite |
| Progress persistence | localStorage completion flags + item inventory (trigger/stage/item IDs, versioned key) — §3.4. User chose persisted inventory over deriving items from flags |
| Maps | Tiled JSON, one per stage, all played by the single `WorldScene` — §3.9 |
| Input | Unified `InputService` (direction + A/B); keyboard + virtual pad — §3.10 |
| Localization | Full UI + subtitles: `en`, `zh-TW`, `ja`, `ko` — §3.7 |
| Pixel font | **Fusion Pixel 12px proportional** (OFL-1.1), per-locale glyph flavors (latin / zh_hant / ja / ko woff2 in `public/assets/fonts/`), lazy-loaded and swapped on locale change; render at integer multiples of the 12px grid |
| Text rendering | DOM overlay for screen-space text, Phaser text for world-space — §3.8 |
| Video subtitles | One custom subtitle engine (DOM overlay) shared by dialogue AND video — no WebVTT — §3.5 |
| i18n | Custom lightweight module (typed keys, JSON per locale); i18next rejected (YAGNI) — revisit only if plural/ICU needs appear |

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
  (`config/stages.ts` + `stages/<id>/config.ts`) — adding a stage or cutscene
  requires config + assets only (plus a scene subclass only for a brand-new
  mini-game); no FlowDirector changes.

### 3.1 Directory Structure

```
src/
  main.ts                    # Phaser.Game bootstrap (registers all scenes)
  config/
    gameConfig.ts            # Phaser GameConfig (pixelArt: true, Scale.FIT)
    dimensions.ts            # 320×180 logical-size constants
    stages.ts                # stage REGISTRY + StageDef/TriggerDef/ExitDef/ActivityRef types (§3.2)
    items.ts                 # item REGISTRY + ItemDef/ItemId types (§3.4)
  core/
    FlowDirector.ts          # launches stages, pause-world/run-activity/resume, advances flow
    EventBus.ts              # typed event emitter + event name constants/types
  scenes/
    keys.ts                  # SceneKeys constants — never use raw scene-key strings
    BootScene.ts             # minimal, loads preload assets
    PreloadScene.ts          # loads global assets, shows progress bar
    MainMenuScene.ts         # start / language / stage-select entry
    StageSelectScene.ts      # lists UNLOCKED stages, enter/replay any of them
    WorldScene.ts            # THE reusable map scene (§3.9); one instance serves all stages
    VideoScene.ts            # THE generic cutscene player (§3.6)
    minigames/               # SHARED pool — any stage's trigger can reference any mini-game
      MiniGameScene.ts       # abstract base class — THE mini-game contract (§3.3)
      _template/
        TemplateMiniGame.ts  # copy-me example implementing the contract
      <name>/                # one folder per real mini-game; private helpers live beside it
  stages/
    <stage-id>/              # one folder per stage — CONTENT only, no core logic
      config.ts              # StageDef (§3.2); current stages: demo, demo-2, demo-branch
  input/
    InputService.ts          # THE input abstraction (§3.10); gameplay reads ONLY this
    KeyboardSource.ts        # arrows/WASD + action keys → InputService
    VirtualPadSource.ts      # on-screen joystick + A/B (DOM), created on touch devices
  services/
    ProgressService.ts       # completion-flag persistence + unlock derivation (§3.4)
    I18nService.ts           # locale loading, t(key), locale-change event (§3.7)
    storage.ts               # KeyValueStorage interface + safe localStorage accessor
  subtitles/
    SubtitleEngine.ts        # cue scheduling against a clock source (§3.5)
    SubtitleOverlay.ts       # DOM renderer (.subtitle-bar div above the canvas)
    GameClock.ts             # clock adapter fed by scene UPDATE deltas (pause-aware)
    VideoClock.ts            # clock adapter over video.getCurrentTime() * 1000
    types.ts                 # SubtitleCue, SubtitleTrack, ClockSource
  ui/
    domOverlay.ts            # DOM-over-canvas container; --px scaling helpers (§3.8)
    fonts.ts                 # per-locale pixel-font loader (FontFace) + --ui-font swap
  locales/
    en.json                  # source of truth for MessageKey (typed keys)
    zh-TW.json  ja.json  ko.json
public/assets/
  maps/                      # Tiled JSON, one per stage (+ shared tileset images)
  video/                     # .mp4/.webm cutscenes
  subtitles/                 # <trackId>.<locale>.json cue files (lazy-loaded)
  fonts/                     # Fusion Pixel woff2, one per locale flavor (+ OFL licenses)
  images/ audio/ ...         # stage-specific art under images/<stage-or-minigame-id>/
tests/                       # vitest unit tests for services & subtitle timing
```

Placement rules (so nothing lands in the wrong place):
- New **stage** → `src/stages/<id>/` + a map in `public/assets/maps/` + register in
  `config/stages.ts` + add its `titleKey` to **all four** locale files
  (`StageDef.titleKey` is a typed `MessageKey`). Never touches `core/` or `scenes/`.
- New **mini-game** → `src/scenes/minigames/<name>/` + a key in `scenes/keys.ts` +
  registration in `main.ts`. Referenced from stage triggers; never owned by one
  stage folder.
- New **video** → assets only (`public/assets/video/` + `subtitles/`) + a trigger entry.
- Anything shared by 2+ mini-games graduates out of a mini-game folder into
  `core/`/`services/`/`ui/` as appropriate.

### 3.2 Stage & Activity Config (data-driven flow)

Types (in `src/config/stages.ts`; each stage's data lives in `src/stages/<id>/config.ts`):

```ts
export type ActivityRef =
  | { type: 'minigame'; sceneKey: string }        // scene key of a MiniGameScene subclass
  | { type: 'pickup' }                             // sceneless map pickup: FlowDirector records
                                                   // the flag immediately, world keeps running
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
  grantsItems?: ItemId[];        // items granted when this trigger completes (never on abort)
  required: boolean;             // counts toward stage completion
  once: boolean;                 // if true, consumed (hidden) once completed
}

export interface ExitDef {       // in-map gated door (§3.9)
  at: { objectName: string };    // named object in the Tiled map
  to?: string;                   // destination stage; omitted = this stage's `next`
                                 // (none → stage select); branch doors set `to`
  requiredItems?: ItemId[];      // items the player must hold, on top of stage completion
}

export interface StageDef {
  id: string;                    // unique, stable — used in completion flags
  titleKey: MessageKey;          // i18n key shown in stage select (typed — §3.7)
  tilemapKey: string;
  tilemapUrl: string;            // public/assets/maps/...
  spawn: { objectName: string }; // player spawn point object in the Tiled map
  triggers: TriggerDef[];
  exits?: ExitDef[];             // gated doors; when present they REPLACE the
                                 // press-A advance prompt (§3.9)
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
  mini-game's `sceneKey`). Exception: `type: 'pickup'` is sceneless — the flag is
  recorded and `grantsItems` granted immediately, the world never pauses.
- On `activity:complete` → stop the activity scene, record the flag via
  `ProgressService.markCompleted(flagId)`, grant the trigger's `grantsItems`, resume
  `WorldScene`. If the stage is now complete → mark the stage complete (unlocks
  branches / the `next` stage) and prompt advance to `next` (or return to StageSelect
  when there is no `next`).
- On `stage:advance` → start the payload's `to` stage (set by branch exit doors),
  else the stage's `next`, else return to StageSelect.
- On `activity:abort` (player quit the activity) → same as complete but the flag is
  **not** recorded: stop the activity scene, resume `WorldScene`; the trigger stays
  replayable.
- After the final spine stage → an end/credits state (simple return to MainMenu for v1).

### 3.3 Mini-game Contract

```ts
// scenes/minigames/MiniGameScene.ts
export abstract class MiniGameScene extends Phaser.Scene {
  /** Called with the triggering context; base class stores it. */
  init(data: { activity: ActivityRef; flagId: string }): void;

  /** Subclasses MUST call this exactly once when the player finishes. */
  protected completeActivity(result?: unknown): void; // emits 'activity:complete' on EventBus

  /** Player quit without finishing: resumes the world WITHOUT recording the flag.
      A scene calls exactly one of completeActivity/abortActivity. */
  protected abortActivity(): void; // emits 'activity:abort' on EventBus

  /** Timed in-game dialogue (SubtitleEngine + GameClock, pauses with the scene).
      Resolves when the track finishes. */
  protected showDialogue(trackId: string): Promise<void>;
}
```

Adding a mini-game = create a subclass in `scenes/minigames/<name>/`, register its scene
key in `scenes/keys.ts` + `main.ts`, reference it from any stage's `TriggerDef`. No
changes to FlowDirector/EventBus. Mini-games are otherwise unconstrained (own physics,
tilemaps, input) — they only owe the framework a `completeActivity()` call, and they
MUST read player input only through `InputService` (§3.10): direction + A/B, never raw
keyboard or pointer position. Mini-games are a shared pool: multiple stages may trigger
the same mini-game. `_template/TemplateMiniGame.ts` is the copy-me example.

### 3.4 Progress & Unlocking

`ProgressService` (pure TS class, no Phaser imports — unit-testable):
- Storage key: `kuraventure.progress.v1` →
  `{ completedTriggers: string[], completedStages: string[], items: string[] }`
  (trigger flags are `${stageId}/${triggerId}`; insertion order; `items` was added
  later — saves without it load as an empty inventory).
- `markCompleted(flagId)`, `markStageCompleted(stageId)`, `isCompleted(flagId)`,
  `isStageComplete(stageId)`,
  `grantItem(itemId)` / `hasItem(itemId)` — the persisted item inventory. Items are
  permanent booleans, granted by FlowDirector from `TriggerDef.grantsItems` on
  completion (never on abort; re-grants are no-ops), never consumed,
  `areRequiredTriggersComplete(stage)` — the stage-completion rule (every
  `required: true` trigger flag set), shared by FlowDirector and exit gating (§3.9),
  `getUnlockedStages(): StageDef[]` — derived from `STAGES` + completed flags
  (spine stages unlock as the `next` chain is completed; branch stages when their
  `unlockedBy` list is complete; unknown IDs are dropped so config changes can't
  crash the UI).
- Items live in the registry `config/items.ts` (`ItemDef { id, nameKey }`; `ItemId`
  is derived from the registry so config referencing an unknown item is a compile
  error; `nameKey` is the localized display name used in exit/pickup messages).
- All `localStorage` access is wrapped in try/catch (private-browsing modes throw)
  with an in-memory fallback.
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
(`start`/`end` in ms — start-inclusive, end-exclusive; one file per track per locale,
**all four locales required**; loaded lazily and cached per session.)

Core abstraction — the **clock source**:

```ts
export interface ClockSource { nowMs(): number }   // monotonic within a playback
```

- In-game dialogue → `GameClock`, advanced by the hosting scene's UPDATE deltas
  (pause-aware: dialogue pauses with the scene).
- Video → `VideoClock` over `video.getCurrentTime() * 1000` from the Phaser Video
  game object, so **seeking/pausing video keeps subtitles in sync automatically**.

`SubtitleEngine.play(trackId, clock)` polls the clock on a host-driven `update()` tick
(not `setInterval`) and tells `SubtitleOverlay` which cue is active. `SubtitleOverlay`
is a single DOM div (`.subtitle-bar`) positioned over the canvas (via `ui/domOverlay.ts`):
DOM gives crisp readable text at any canvas zoom, trivial CJK font support, and one CSS
stylesheet for both dialogue and video subtitles. On `locale:changed`, the engine
reloads the playing track in the new locale and re-syncs.

### 3.6 Video / Cutscenes

`VideoScene` (one generic scene, parameterized by the `ActivityRef`; launched by
FlowDirector for every `type: 'video'` activity, over the paused `WorldScene`):
- Lazy-loads the video in `preload` (`this.load.video(videoKey, videoUrl)`), fits it
  to the 320×180 canvas on the metadata event, then plays.
- Autoplay policy: playback always starts after a user gesture (menu click / trigger
  interaction), so sound is allowed. **Still pending: a real-browser check of
  autoplay-with-sound after the trigger gesture** — fall back to muted +
  "tap to enable sound" if a browser blocks it.
- If `subtitleTrackId` is set: subtitles play against the `VideoClock`.
- If `skippable`: any key/pointer reveals a localized DOM Skip button (`video.skip`
  key, `.video-skip`); activating it stops video + subtitles and emits
  `activity:complete`.
- On video `complete` event → `activity:complete`. The virtual pad hides while a
  video is active.

### 3.7 i18n

`I18nService`:
- `en.json` / `zh-TW.json` / `ja.json` / `ko.json` imported statically; key type derived
  from `en.json` (`type MessageKey = keyof typeof en`) so `t(key)` is compile-time
  checked and a missing translation in another locale is a type/test error.
- `t(key: MessageKey, params?): string` (`{name}` placeholders replaced from
  `params`), `setLocale(locale)` → persists choice to
  `kuraventure.locale` in localStorage and emits `locale:changed` on the EventBus.
- Scenes re-render their texts on `locale:changed` (each scene owns its refresh).
- Font: Fusion Pixel 12px (see §2). `ui/fonts.ts` loads the active locale's flavor via
  the FontFace API (`display: swap`, cached per session), points the `--ui-font` CSS
  variable at it on `locale:changed`, and sets `<html lang>` so CSS line-breaking
  rules apply.
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

Rule of thumb: *if the camera moves and the text shouldn't → DOM; if the text belongs
to a game object → Phaser.* Keep every DOM element inside the `ui/domOverlay.ts`
container so scaling/positioning stays in one place.

**Keeping DOM text pixel-styled:** use a true pixel font at exact integer multiples of
its native grid — sizes go through the `--px` CSS variable in multiples of the 12px
font grid (12px, 24px, 36px — never 30px). Disable smoothing
(`-webkit-font-smoothing: none; font-smooth: never;` where supported), avoid
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
  Pickup triggers get immediate feedback instead (toast naming the items, consumed
  zone removed on the spot — the world never paused).
- For each `ExitDef`, create a door zone the same way. Walking in when every
  required trigger is complete AND the exit's `requiredItems` are held emits
  `stage:advance` (with the exit's `to`); otherwise a transient toast says what's
  missing (stage tasks vs. named items). Stages **with** exits never show the
  press-A "stage complete" prompt — the door is the way out; stages without exits
  keep the prompt.
- On resume after an activity, refresh trigger/map state from `ProgressService`
  (a just-completed `once` trigger disappears without reloading the map).
- Escape hatch (designed, **not yet implemented** — add only when a stage first needs
  it): optional per-stage `src/stages/<id>/script.ts` hooks (`onEnter(scene)`,
  per-trigger overrides) for behavior data can't express. Prefer data; keep scripts
  rare and small.

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

## 4. Milestones

**1–7 (framework): DONE** — scaffold, world core + input, activity flow, progress &
unlocking, i18n, subtitle engine, video activity. See git history (`feat: milestone N`)
for the details of each.

Remaining:

8. **Real stages & mini-games** — **TBD: ask the user for the stage list (spine +
   branches), maps, and mini-game designs.** Each stage/mini-game is a separate
   milestone using §3.2/§3.3; content only, no core changes.
   First real mini-game done: **Pizza Run** (`scenes/minigames/pizza-run/`, a port of
   github.com/scottxxx666/izone-pizza-game), triggered from the demo stage; its art is
   placeholder photos — see `public/assets/images/pizza-run/README.md` for
   replacement sizes.
9. **Polish** — responsive `Scale.FIT` tuning, transitions, audio, credits. TBD scope.

**Do not run build/test/lint scripts — the user runs them manually.** Write tests;
don't run them.

## 5. Open Questions (ask the user — do not assume)

- The actual stage list: the linear spine, which stages branch off it, and each stage's
  map contents/triggers.
- Which mini-games (gameplay, count) and which stages trigger them.
- Art direction: asset sources (including tilesets for the Tiled maps).
- Audio: music/SFX requirements; whether videos carry their own audio.
- Mobile orientation: lock to landscape (assumed — matches joystick-left/buttons-right
  layout) or also support portrait?
- Autoplay-with-sound after a trigger gesture still needs a real-browser check (§3.6).
