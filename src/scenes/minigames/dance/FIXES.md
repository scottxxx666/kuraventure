# Dance Mini-Game — deviations from rhythm-game common practice

Review findings for `src/scenes/minigames/dance/` (2026-07-13). Each item states
the problem, the genre convention, and a suggested fix. Ordered by impact.
Items marked **[needs user decision]** must be confirmed with the user before
implementing (per CLAUDE.md: where things are TBD, ask — do not guess).

Context for the reviewer/fixer:

- Files: `DanceMiniGame.ts` (scene), `beatmap.ts` (note generation),
  `judgment.ts` (timing windows/score), `lanes.ts` (lane model; presses come
  from `InputService.onLanePress` — lane mode, PLAN.md §3.10).
- Tests: `tests/danceBeatmap.test.ts`, `tests/danceJudgment.test.ts`.
  The user runs tests manually — write/update tests, do not run them.
- Project constraints that shaped the current code: no text rendered inside
  Phaser (PLAN.md §3.8 — DOM overlay or shapes only), input abstracted through
  `InputService` (virtual joystick on touch, PLAN.md §3.10).

---

## 1. Beatmap is random noise, not charted to the music — **[needs user decision]**

**Where:** `beatmap.ts` (all of it), consumed in `DanceMiniGame.startRun`.

**Problem:** `BPM = 100` is hardcoded and notes are dice-rolls per half-beat,
seeded with `Date.now()`. Unless `assets/audio/dance.mp3` is exactly 100 BPM
with beat 1 at `LEAD_IN_MS` (2400 ms), every note is off the music's beat for
the whole run. Even with a matching grid, random placement ignores the song's
rhythm and accents — the core of what makes a rhythm game feel right.

**Common practice:** a per-song authored chart (hand-placed note list) with the
track's measured BPM and first-beat offset.

**Decision needed:** authored chart per song vs. keeping procedural generation
(and just measuring the real track's BPM + offset). Authored is the genre
standard; procedural keeps replay variety and zero content-authoring cost.
Minimum viable authored format: a JSON/TS array of `{ timeMs, lane }` (the
existing `Note` shape) loaded instead of `generateBeatMap`.

## 2. No latency calibration

**Where:** `judgment.ts` (windows), `DanceMiniGame.advanceClock` /
`onLanePress` (no offset applied anywhere).

**Problem:** there is no audio-offset or input-offset compensation. Mobile
browsers commonly have 100–250 ms audio output latency (more on Bluetooth).
With a ±60 ms perfect window, an uncalibrated phone player can never score
perfect by playing on the beat. Syncing to `music.seek` matches the *decoded*
position, not what the player *hears*.

**Fix:** add a signed `calibrationOffsetMs` applied when comparing press time
to note time (i.e. judge `note.timeMs - (songTimeMs - offset)`). Minimum: a
constant per platform (touch vs. desktop). Better: a simple calibration step
(play a metronome, player taps, take median offset) — but a constant is an
acceptable first pass. Store in the existing settings/progress persistence if
one exists; otherwise a module constant with a TODO.

## 3. Joystick-flick input instead of per-lane inputs — **[RESOLVED 2026-07-13]**

**Where (was):** `lanes.ts` `directionToLane`, `DanceMiniGame.detectLanePress`.

**Problem (was):** input was the quantized analog direction, edge-triggered on
lane change — chords impossible, rolling between directions could fire a
spurious intermediate lane, touch players flicked a virtual joystick.

**Decision & fix applied:** per-lane inputs via a new `InputService` **lane
mode** (PLAN.md §3.10, same signed-off-exception shape as cart-carry's
twin-stick): keyboard arrows/WASD become four discrete lane keys (chords work,
event-edge-triggered), and on touch the virtual pad swaps joystick + A/B for
four tap zones aligned under the lanes (`.vpad-lanes`, canvas-aligned CSS).
The scene enables lane mode for the run and switches it off on end/fail/
shutdown (A button needed for the fail flow). `directionToLane` was deleted.
Judgment windows were deliberately **kept** at ±60/±150 — item 9 stays
deferred until latency calibration (item 2) lands.

## 4. Stray presses are free = mash exploit

**Where:** `DanceMiniGame.onLanePress` (the `if (!best) return;` no-penalty
path).

**Problem:** mashing all four lane keys / tap zones fires rapid presses across
every lane (item 3's per-lane input made this easier, not harder — chords are
now legal input); with no cost for empty hits and ±150 ms good windows, this
auto-hits nearly every note. The win threshold (60 % of max) is reachable
without playing.

**Fix (genre convention):** make empty hits cost something — subtract a small
score amount, or add a combo system (item 8) where an empty hit breaks combo
and combo feeds score. Keep it gentle (family-friendly product decision is
documented in `judgment.ts`), but it must be enough that stick-spinning scores
below `WIN_RATIO`. Add a unit test: simulated constant-mash input over a
generated map must not reach `winScore`.

## 5. Input is frame-polled, not event-timestamped

**Where:** `DanceMiniGame.onLanePress` (via `inputService.onLanePress`).

**Problem:** item 3's fix made presses event-driven (keydown/pointerdown fire
the lane callback immediately), but the hit is still judged against
`songTimeMs` as of the last `update()` — up to ~16 ms stale at 60 fps, worse
on slow devices, and the error is one-sided (the clock reads early, so
presses judge late).

**Fix:** extrapolate the song time to the press moment — record
`performance.now()` when `advanceClock` runs and judge against
`songTimeMs + (performance.now() - lastClockStamp)`, or use the input event's
own timestamp. Smaller alternative: judge against `songTimeMs + halfFrame` to
center the error.

## 6. Raw forward-only `music.seek` as the song clock

**Where:** `DanceMiniGame.advanceClock`.

**Problem:** audio position updates in coarse chunks (`HTML5AudioSound`
especially — `currentTime` may tick only a few times/second). The forward-only
guard turns that jitter into freeze-then-jump note movement. Soft-lock edge:
if the track stalls with `isPlaying === true` and seek frozen, `songTimeMs`
never reaches `endMs` and the run never finishes.

**Fix (standard pattern):** hybrid clock — advance `songTimeMs` by frame delta
every frame, and gently correct toward the audio position (e.g. nudge a few ms
per frame, or resync when drift exceeds a threshold). This keeps motion smooth
and stays anchored to the music. Also fixes the stall soft-lock (frame clock
keeps advancing).

## 7. Up-scroll with receptors at the top — **[RESOLVED 2026-07-13]**

**Where:** `DanceMiniGame.ts` — `HIT_Y`, `SPAWN_Y`, `driveNotes` position math.

**Problem (was):** notes rose to receptors at the top. That's
arcade-DDR-authentic, but the cross-platform PC+mobile convention is
down-scroll with the judgment line near the bottom (thumb ergonomics, hands
don't occlude incoming notes).

**Decision & fix applied:** mirrored to down-scroll — receptors at
`HIT_Y = GAME_HEIGHT - 32` (genre-standard 15–20% band above the bottom edge;
no tap-zone strip reserved — if item 3 lands, tap zones become
receptor-centered hitboxes), notes spawn at `SPAWN_Y = -8`. Per user decision
the score bar (and its win-threshold tick) was removed entirely, replaced by
a plain score number top-center on the DOM overlay (`.dance-score`, §3.8);
the win threshold is no longer visualized.

## 8. No per-hit judgment feedback or combo counter

**Where:** `DanceMiniGame.onLanePress` / `flashReceptor` — feedback is only a
120 ms receptor tint.

**Common practice:** a judgment indicator at the receptor per hit
(perfect/good/miss) plus a combo counter — this feedback loop is most of the
genre's feel.

**Fix within the no-text constraint (§3.8):** shape/icon-based feedback —
e.g. a brief scale-pop + colored ring on the receptor sized by judgment, and a
combo meter as a growing bar or pip row (or DOM-overlay text, which §3.8
permits, if numbers are wanted). If item 4 adds combo-based scoring, this is
its visualization.

## 9. Only two judgment tiers (minor / optional)

**Where:** `judgment.ts` — `perfect` (±60 ms) / `good` (±150 ms) / implicit miss.

Defensible for a casual mini-game; genre standard is 3–5 tiers for a skill
gradient. Item 3 landed (precise per-lane input would allow tighter windows,
e.g. ±40/±90/±150) but the user chose to keep ±60/±150 until latency
calibration (item 2) exists — tightening first would punish mobile players.
If windows change, update `tests/danceJudgment.test.ts` boundary cases.

## 10. Dead code (trivial)

**Where:** `DanceMiniGame.onLanePress` — the `if (!judgment)` branch
(`DanceMiniGame.ts:227`).

`best` is pre-filtered to `delta <= GOOD_WINDOW_MS`, so `judge()` cannot
return null there. Either delete the branch or drop the pre-filter and let
`judge()` be the single source of truth (preferred — one place defines
hittability).

---

## Suggested order of work

1. Items 6, 5, 10 — internal timing/cleanup, no user-visible design change.
2. Item 2 — calibration constant (small, high player impact).
3. Item 4 (+8 for its visualization) — closes the mash exploit.
4. Item 1 — ask the user first; a product decision on charting. (Item 7 is
   done: down-scroll, score number instead of bar. Item 3 is done: per-lane
   inputs via InputService lane mode — see the entries above.)

After code changes: update `tests/danceBeatmap.test.ts` /
`tests/danceJudgment.test.ts` (and add the mash test from item 4). Do not run
tests or builds — the user runs them manually.
