# Time to Shine — design

Single-player call-and-response rhythm game. Inspiration: Super Mario Party's
*Time to Shine* (host poses on the beat, players copy with timing judgment),
Rhythm Tengoku (audio-first cues, rhythm echo), Headbangers *Fitness*
(growing sequences, pauses, direction onboarding).

## Core loop

A host on stage demonstrates a phrase of direction poses on the beat; the
player repeats it on the following beats. Demo arrows are hidden during the
response (light memory element). The whole run always plays out; only
Perfect/Nice score, and at the end `score >= winScore` passes, otherwise the
shared fail flow runs (same policy as dance).

## Timeline (all on one beat grid)

- BPM 100 (beat = 600 ms), slot = 2 beats = 1200 ms, fixed tempo all run.
- Lead-in 2400 ms. Phrase schedule `[1,1,2,2,3,3,4,4]` slots → 8 rounds,
  ~70 s total.
- Round of length L starting at t0: demo slot i at `t0 + i*SLOT_MS`, one rest
  slot ("your turn" count-in), response slot i at `t0 + (L+1+i)*SLOT_MS`
  (pure shift of the demo), one rest slot after.

## Judgment

- Windows: perfect ±100 ms, nice ±250 ms, binding cutoff ±450 ms. Score
  perfect 100 / nice 60, win ratio 0.6 of the all-perfect maximum.
- A press **binds to and consumes** the nearest pending response note within
  the cutoff (earlier wins ties), whatever the direction — wrong direction
  judges `wrong` (0). Without consumption, mashing all four lanes every slot
  would score 100%. Presses that bind to nothing (rests, demo phase) are
  ignored, no penalty.
- Invariant (tested): `NICE_WINDOW_MS < minNoteGap/2` (300 ms) so a scoring
  press always binds to the intended note.

## Feature toggles — `features.ts`

Each independently switchable via `SHINE_FEATURES`:

- `laneTones` — WebAudio-synthesized sound (no assets): a pitch per lane
  (← ↓ ↑ → = C5 E5 G5 C6) on both demo poses and player presses, metronome
  tick with a count-in before the response, judgment blips. This is what
  makes the game playable by ear; without a music file the game would
  otherwise be silent (frame-clock fallback). Metronome mutes itself while a
  music track is actually playing.
- `rhythmPatterns` — later rounds draw each slot from rhythm cells:
  `single` (note at 0), `double` (notes at 0 and 600 ms), `rest` (no note).
  Rounds 1–4 all single; 5–6 add doubles; 7–8 add doubles + rests. First
  slot of a phrase always sounds; at least half the slots sound. The
  response echoes the exact cell timing.
- `laneRamp` — rounds 1–2 draw lanes from {←, →} only, all four after.

## Input

Lane mode (PLAN.md §3.10), identical to dance: keyboard arrows/WASD as four
discrete keys; on touch, the existing four wide tap zones at the bottom.
Chosen over a virtual D-pad deliberately: timing games need big two-thumb
targets, and reuse keeps parity with dance. Lane mode is switched off on
shutdown and before the fail flow. All timing-critical visuals stay above
y≈560 (bottom strip belongs to the tap zones).

## Files

- `TimeToShineMiniGame.ts` — scene; state derived per-frame from
  `songTimeMs` vs the chart (no demo/response state machine), dance-style
  music-seek clock with frame fallback.
- `rounds.ts` — chart generation, seeded (mulberry32) and deterministic.
- `judgment.ts` — windows, scoring, `judgePress`.
- `sound.ts` — `ShineSynth`, oscillator-based cues.
- `lanes.ts` — lane constants (dance-identical; per-game copies stay local).
- Optional assets: `assets/audio/time-to-shine.mp3` (≥ ~72 s ideal),
  `assets/video/time-to-shine-ending.mp4` (fail ending).

## "When do I press?" cues

The game is a **memory + rhythm game**, not a per-note reaction test. The player
watched the host's rhythm during the demo, so the response is reproduced from
memory against the beat — no per-note "press now" telegraph. This mirrors
Headbangers *Rhythm Royale*: the "your turn" prompt teaches the hand-over **once**,
then the steady tempo (a predictable, always-on channel) carries every following
turn.

**Implemented — show-once hand-over + audio beat.** The only explicit cues are:

- **"Your turn" text, first round only.** `applyPhase()` shows `watch` then the
  first `your turn`; after the first hand-over the `turnHinted` flag keeps the
  cue silent for the rest of the run.
- **Spotlight swap** (`hostLight`/`playerLight` alpha) — ambient whose-turn
  staging, every round. Tells you the *phase*, not per-note timing.
- **Count-in metronome** (`driveBeats`/`countInStep`) — two synth beats in the
  rest slot before each response, plus the steady tick. The rhythmic channel the
  player presses against. Muted while a real music track plays.

Mistakes are still surfaced in full — wrong direction (`wrong`), off-timing
(`early`/`late`), and unhit notes (`miss`) all paint the dot and float a judgment
popup (`paintDot`/`showPopup`). The cue teaches; the judgment corrects.

**Removed — approach ring (`driveTelegraph`).** Previously a shrinking osu!-style
ring converged onto the next dot at its hit time. Dropped deliberately: it made
the game a follow-the-ring reaction test and hid the memory/rhythm skill the mode
is built around. `approachFrac` stays in `judgment.ts` (unused here) in case a
softer opt-in cue is wanted later.

**Possible later — response-beat audio accent.** For muted/touch play, give beats
that carry a *response* note a distinct accent/pitch via `ShineSynth` so the ear
leads the press, without any visual telegraph. Keep it muted while a real music
track plays (same rule as the metronome).
