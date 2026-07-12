# Flappy Flight art

The current files are **non-pixel-art placeholders** copied from the pizza-run
folder (photo images). The code fits each sprite to a fixed logical size with
`setDisplaySize`, so real IZONE images can be dropped in under the same file
names with no code changes.

Recommended native sizes for real pixel art (logical canvas is 320×180 —
author at exactly these sizes, no upscaling):

| file | logical size | notes |
|---|---|---|
| `player.png` | 16×16 | the flapping player; hitbox is 70% of the sprite |
| `pipe.png` | 24×24 | one segment of a gate column (tiled vertically) |
| `floater.png` | 16×16 | free-floating obstacle; some bob up/down |
| `sweeper.png` | 24×24 | diagonal sweeper from the top/bottom-right corner |

The fail video lives at `public/assets/video/flappy-ending.mp4` (currently a
copy of pizza-run's; 320×180 recommended — any 16:9 works, it is
letterbox-fitted to the canvas).
