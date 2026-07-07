# Pizza Run art

The current files are **non-pixel-art placeholders** copied from
https://github.com/scottxxx666/izone-pizza-game (photo images). The code fits
each sprite to a fixed logical size with `setDisplaySize`, so replacements can
be dropped in under the same file names with no code changes.

Recommended native sizes for real pixel art (logical canvas is 320×180 —
author at exactly these sizes, no upscaling):

| file | logical size | notes |
|---|---|---|
| `player.png` | 16×24 | faces right; the code flips it for leftward movement |
| `dumpling.png` | 12×12 | collectible — fills the progress bar |
| `pizza.png` | 14×14 | hazard — touching it fails the run |
| `boss.png` | 32×32 | patrols the top of the screen, deflects pizzas |

The fail video lives at `public/assets/video/pizza-run-ending.mp4`
(320×180 recommended; any 16:9 works — it is letterbox-fitted to the canvas).
