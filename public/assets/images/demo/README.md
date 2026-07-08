# demo stage art (placeholders)

Generated placeholder portraits for the demo stage's dialogue
(`src/stages/demo/config.ts` → `portraits`). Replace with real art:

| File | Used as | Size |
|---|---|---|
| `npc-guide.png` | guide NPC dialogue portrait | 32×32 px |
| `player.png` | player dialogue portrait | 32×32 px |

Portraits render via the DOM overlay (`.dialogue-portrait`,
`image-rendering: pixelated`), so keep them square pixel art; 32×32 is the
styled size but any square power-of-two works.
