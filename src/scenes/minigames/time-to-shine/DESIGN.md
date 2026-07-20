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

The game is a **light memory game**, not a timing test — the beat is flavor.
Still, the response phase needs to signal *when* each remembered pose is due
(without revealing *which* — that stays in memory).

**Implemented — approach ring (visual).** `driveTelegraph()` draws a shrinking
ring (`noteRing`) that converges onto the next pending response dot and closes
exactly at its hit time (osu!-style approach circle), plus a `DOT_READY`
brighten on the active dot. One-beat lead (`TELEGRAPH_LEAD_MS = BEAT_MS`, ==
`MIN_NOTE_GAP_MS`) so a double never shows two rings. Ring math is the pure
`approachFrac` in `judgment.ts`. Reuses the radial-gauge idea from
`jump-rope/JumpRopeMiniGame.ts`.

**Planned — response-beat audio cue (Option B).** Complements the ring for
muted/touch play and gives the Rhythm-Heaven "play by ear" feel. Today
`driveBeats()` ticks every beat identically; instead give the beats that carry a
*response* note a distinct accent/pitch — a "call" tone via `ShineSynth`
(`sound.ts`) — so the ear leads the press. Independent of Option A; can layer on
top. Keep it muted while a real music track plays (same rule as the metronome,
`driveBeats`).
