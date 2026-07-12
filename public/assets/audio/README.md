# Audio assets

| File | Used by | Notes |
| --- | --- | --- |
| `dance.mp3` | Dance Beat (`src/scenes/minigames/dance/`) | **Not committed yet — drop any track here.** ~60 s is ideal (longer tracks are cut at 60 s, shorter ones shorten the run). The beat grid assumes the `BPM` const in `src/scenes/minigames/dance/beatmap.ts` (currently 100) — retune it to the real song. Until the file exists the mini-game runs silent on the frame clock. |

Playback always starts from a user gesture (the A press that starts a run), so
browser autoplay policies never block it.
