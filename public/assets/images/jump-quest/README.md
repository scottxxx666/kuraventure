# Jump Quest art

The current files are **non-pixel-art placeholders** copied from the flappy /
cart-carry folders (photo images). The code fits each sprite to a fixed
logical size with `setDisplaySize` (platforms via `tileScale`), so real IZONE
images can be dropped in under the same file names with no code changes.

Recommended native sizes for real art (native canvas is 1280×720 —
author at exactly these sizes, no upscaling):

| file | canvas size | notes |
|---|---|---|
| `player.png` | 96×96 | the climber; hitbox is 70% of the sprite; flipped to face travel |
| `monster.png` | 80×80 | platform patroller; flipped to face travel |
| `flyer.png` | 88×88 | horizontal crossing hazard |
| `platform.png` | 128×32 | one platform segment, **tiled horizontally** — author it seamless |
| `platform-timed.png` | 128×32 | disappearing platform — give it a clearly distinct look |
| `goal.png` | 128×128 | flag/marker at the summit |

There is no ending video: this mini-game has no fail state (a hit only knocks
the player down — classic Forest-of-Patience patience).
