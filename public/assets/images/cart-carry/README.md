# Cart Carry art

The current files are **non-pixel-art placeholders** copied from the flappy
folder (photo images). The code fits each sprite to a fixed logical size with
`setDisplaySize`, so real pixel art can be dropped in under the same file
names with no code changes.

Recommended native sizes for real art (native canvas is 1280×720 —
author at exactly these sizes, no upscaling):

| file | canvas size | notes |
|---|---|---|
| `carrier.png` | 80×80 | drawn twice (back + front carrier); hitbox is 70% of the sprite |
| `cart.png` | 448×32 | author horizontal; rotated + stretched (352–544 px, loose grip) between the carriers at runtime |
| `spike.png` | 64×256 | floor stalagmite; stretched to 160–416 px tall, `setFlipY` for the ceiling variant |
| `pipe.png` | 64×80 | piranha warp pipe, sits on the floor |
| `plant.png` | 48×144 | piranha plant; only the top 32 px show during the warning peek |

The fail video lives at `public/assets/video/cart-carry-ending.mp4` (currently
a copy of flappy's; 1280×720 recommended — any 16:9 works, it is
letterbox-fitted to the canvas).
