# Bone Heist art

The current files are **non-pixel-art placeholders** copied from the
cart-carry / flappy folders (photo images). The code fits each sprite to a
fixed logical size with `setDisplaySize`, so real pixel art can be dropped in
under the same file names with no code changes.

Recommended native sizes for real art (native canvas is 1280×720 —
author at exactly these sizes, no upscaling):

| file | canvas size | notes |
|---|---|---|
| `dog.png` | 220×180 | sleeping dog, top-center; tinted yellow (stir) / red (awake) and tween-animated at runtime — author it asleep |
| `bone.png` | 150×70 | draggable obstacle bone; logic circle r=60, grab circle 1.4× |
| `ball.png` | 80×80 | the loot; logic circle r=34, grab circle 1.4×; shrinks into the basket when delivered |
| `basket.png` | 200×160 | drop zone, bottom-right; delivered balls tuck behind it |

The dog's danger zone and the noise bar are code-drawn (no art needed). The
fail video lives at `public/assets/video/bone-heist-ending.mp4` (currently a
copy of flappy's; 1280×720 recommended — any 16:9 works, it is
letterbox-fitted to the canvas).
