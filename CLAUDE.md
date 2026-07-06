# Kuraventure

Pixel RPG web game built with Phaser 3.90 + TypeScript + Vite.

**Start here: read `PLAN.md`** — it is the source of truth for architecture, confirmed
product decisions, implementation milestones, and open questions. Where PLAN.md marks
something **TBD**, ask the user; do not guess.

Status: milestone 4 (progress & unlocking) done — `ProgressService` persists
completion flags to localStorage (`kuraventure.progress.v1`, in-memory fallback on
storage failure) and derives unlocked stages from the registry (`next` chain +
`unlockedBy`); the menu opens `StageSelectScene` (unlocked stages, completed marked,
replayable); finishing a stage's required triggers shows an advance prompt in
`WorldScene` (A → `next` stage, or stage select at the end of the spine). Demo
content: `demo` → `demo-2` spine plus `demo-branch` (`unlockedBy: ['demo']`).
Next: PLAN.md milestone 5 (i18n) — **confirm the pixel font with the user first**
(PLAN.md §3.7 / §5).

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
