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

- ~109 BPM (beat = 550 ms, integer grid), slot = 2 beats = 1100 ms, fixed
  tempo all run. `BEAT_MS` is the authoritative constant; must stay > 500 ms
  (judgment invariant `NICE_WINDOW_MS < MIN_NOTE_GAP_MS/2`).
- Lead-in 2400 ms. Phrase schedule `[1,1,2,2,3,3,4,4]` slots → 8 rounds,
  ~70 s total.
- Round of length L starting at t0: demo slot i at `t0 + i*SLOT_MS`, one rest
  slot (hand-over — the spotlight swaps to the player here), response slot i at
  `t0 + (L+1+i)*SLOT_MS` (pure shift of the demo), one rest slot after.

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
  (← ↓ ↑ → = C5 E5 G5 C6) on both demo poses and player presses, a constant
  whistle on every beat that keeps the tempo, judgment blips. This is what
  makes the game playable by ear; without a music file the game would
  otherwise be silent (frame-clock fallback). The whistle plays on **every**
  beat, including over a real music track (it's the timing cue, not ambience).
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

The game is a **memory + rhythm game**. The player watched the host's rhythm
*and directions* during the demo, then reproduces the phrase against the beat.
The response ring now marks *which* progress circle and *when* (timing is
guided), but the **direction** each pose needs still comes from memory — it is
only revealed after you get one wrong.

This builds on the **Super Mario Party model** (verified against the Mario
Wiki): in SMP's *Time to Shine* the timing is indicated by "the light underneath
all characters and a whistling noise" — a constant whistle keeping the beat plus
a spotlight for whose turn. We mirror both, on every beat, and add a per-note
ring on the progress circles:

- **Constant whistle** (`ShineSynth.whistle` via `driveBeats`) — a bright,
  loud, trilled "wheet" on **every beat, all phases, over the music too** (it's
  the timing cue, not ambience, so it rides on top of a track rather than
  yielding to it). Synthesized (LFO warble on a ~2.1 kHz sine), no asset.
- **Per-note ring on the progress circle** (`driveNoteRing`) — during the
  response phase a ring fades in large on the next unhit progress circle two
  beats out and shrinks to close on that note's beat (osu!-style approach circle,
  `approachFrac` with a 2-beat lead + a short alpha fade-in so it doesn't pop).
  It tells you *which* circle is next and *when* to press, but never *which
  direction* — that stays in memory. Nothing is drawn until the approach window
  opens.
- **Spotlight swap** (`hostLight`/`playerLight` alpha) — ambient whose-turn
  staging. Tells you the *phase*, not per-note timing. Flips to the player one
  slot before their notes start, giving a get-ready lead (SMP's "light").
- **"Your turn" text, every round** (`applyPhase`) — `watch` during the demo,
  `your turn` for every response phase.

Mistakes are still surfaced in full — wrong direction (`wrong`), off-timing
(`early`/`late`), and unhit notes (`miss`) all paint the circle and float a
judgment popup (`paintDot`/`showPopup`). On a **miss or wrong direction**, the
circle also reveals the correct arrow (`LANE_ROTATION`) so you learn the pose you
should have struck; off-timing hits (`early`/`late`) stay colour-only since the
direction was already right. The cues pace; the judgment corrects.

**History.** An earlier per-note approach ring on the progress dots
(`driveTelegraph`) was removed for being a follow-the-cue reaction test that
gave away the whole phrase. `driveNoteRing` reinstates the per-note ring on the
now-enlarged circles, but only the *timing* is guided: the **direction stays in
memory** until an error reveals it, so the memory element lives in *which arrow*,
not *when*.
