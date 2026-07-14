# Pizza Run art

The current files are **non-pixel-art placeholders** copied from
https://github.com/scottxxx666/izone-pizza-game (photo images). The code fits
each sprite to a fixed logical size with `setDisplaySize`, so replacements can
be dropped in under the same file names with no code changes.

Recommended native sizes for real art (native canvas is 1280×720 —
author at exactly these sizes, no upscaling):

| file | canvas size | notes |
|---|---|---|
| `player.png` | 64×96 | faces right; the code flips it for leftward movement |
| `dumpling.png` | 48×48 | collectible — fills the progress bar |
| `pizza.png` | 56×56 | hazard — touching it fails the run |
| `boss.png` | 128×128 | patrols the top of the screen, deflects pizzas |

The fail video lives at `public/assets/video/pizza-run-ending.mp4`
(1280×720 recommended; any 16:9 works — it is letterbox-fitted to the canvas).
