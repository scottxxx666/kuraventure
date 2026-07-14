# Kuraventure

Pixel RPG web game built with Phaser 3.90 + TypeScript + Vite.

**Start here: read `PLAN.md`** — it is the source of truth for architecture,
conventions (how to add stages/mini-games/videos — §3), confirmed product decisions,
and open questions. Where PLAN.md marks something **TBD**, ask the user; do not guess.

Status: the framework (PLAN.md milestones 1–7) is **complete** — world/stages,
activity flow, progress & unlocking, i18n, subtitles, video cutscenes all work,
exercised by three demo stages (`demo`, `demo-2`, `demo-branch`) with placeholder
assets. Since then, interactive NPC talk (Ink/inkjs — PLAN.md §3.11) was added as
a framework capability alongside timed dialogue. Next: milestone 8 (real stages &
mini-games — **TBD: ask the user** for the stage list, maps, and mini-game
designs; content only, no core changes).

## Dev notes

- Package manager is **yarn** (enforced by a hook — `npm`/`npx` commands are blocked).
- `yarn dev` serves on port 8080 with `host: true` so a phone on the same LAN can
  connect for touch testing. Other scripts: `yarn build`, `yarn preview`,
  `yarn typecheck`, `yarn test` (vitest, tests in `tests/`). **The user runs all
  scripts manually — never run them yourself.**
- Engine is **Phaser 3.90.0** (pinned; user re-confirmed staying on 3.x over the now
  stable Phaser 4). The game renders at a **native 1280×720 smooth-art canvas**:
  world coordinates == canvas coordinates, no camera zoom, `pixelArt: false`. There
  is no per-scene camera setup and no `pixelCamera.ts`; `setScrollFactor(0)` HUD
  objects use plain screen coordinates. `Scale.FIT` (`src/config/gameConfig.ts`,
  PLAN.md §2, `docs/option-b-smooth-art.md`). The DOM overlay's `--px` scale is
  still computed from a 320×180 pixel-font grid (`UI_GRID_*` in
  `src/config/dimensions.ts`).
- Every Phaser scene is registered in `src/main.ts`; scene keys live in
  `src/scenes/keys.ts` — never use raw scene-key strings.
