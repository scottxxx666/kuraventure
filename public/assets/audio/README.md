# Audio assets

| File | Used by | Notes |
| --- | --- | --- |
| `dance.mp3` | Dance Beat (`src/scenes/minigames/dance/`) | **Not committed yet — drop any track here.** ~60 s is ideal (longer tracks are cut at 60 s, shorter ones shorten the run). The beat grid assumes the `BPM` const in `src/scenes/minigames/dance/beatmap.ts` (currently 100) — retune it to the real song. Until the file exists the mini-game runs silent on the frame clock. |
| `time-to-shine.mp3` | Time to Shine (`src/scenes/minigames/time-to-shine/`) | **Not committed yet — drop any track here.** ≥ ~72 s is ideal (the chart runs ~70 s; a shorter track hands the clock back to the frame timer when it ends). The beat grid assumes the `BPM` const in `src/scenes/minigames/time-to-shine/rounds.ts` (currently 100) — retune it to the real song. Without the file the synthesized metronome/lane tones (`sound.ts`) carry the beat; while a track plays the metronome mutes itself. |

Playback always starts from a user gesture (the A press that starts a run), so
browser autoplay policies never block it.
