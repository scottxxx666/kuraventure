# Flappy Flight art

The current files are **non-pixel-art placeholders** copied from the pizza-run
folder (photo images). The code fits each sprite to a fixed logical size with
`setDisplaySize`, so real IZONE images can be dropped in under the same file
names with no code changes.

Recommended native sizes for real art (native canvas is 1280×720 —
author at exactly these sizes, no upscaling):

| file | canvas size | notes |
|---|---|---|
| `player.png` | 96×96 | the flapping player; hitbox is 70% of the sprite |
| `pipe.png` | 128×128 | one segment of a gate column (tiled vertically) |
| `floater.png` | 96×96 | free-floating obstacle; some bob up/down |
| `sweeper.png` | 128×128 | diagonal sweeper from the top/bottom-right corner |

The fail video lives at `public/assets/video/flappy-ending.mp4` (currently a
copy of pizza-run's; 1280×720 recommended — any 16:9 works, it is
letterbox-fitted to the canvas).
