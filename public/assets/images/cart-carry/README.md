# Cart Carry art

The current files are **non-pixel-art placeholders** copied from the flappy
folder (photo images). The code fits each sprite to a fixed logical size with
`setDisplaySize`, so real pixel art can be dropped in under the same file
names with no code changes.

Recommended native sizes for real pixel art (logical canvas is 320×180 —
author at exactly these sizes, no upscaling):

| file | logical size | notes |
|---|---|---|
| `carrier.png` | 20×20 | drawn twice (back + front carrier); hitbox is 70% of the sprite |
| `cart.png` | 112×8 | author horizontal; rotated/stretched between the carriers at runtime |
| `spike.png` | 16×64 | floor stalagmite; stretched to 40–104 px tall, `setFlipY` for the ceiling variant |
| `pipe.png` | 16×20 | piranha warp pipe, sits on the floor |
| `plant.png` | 12×36 | piranha plant; only the top 8 px show during the warning peek |

The fail video lives at `public/assets/video/cart-carry-ending.mp4` (currently
a copy of flappy's; 320×180 recommended — any 16:9 works, it is
letterbox-fitted to the canvas).
