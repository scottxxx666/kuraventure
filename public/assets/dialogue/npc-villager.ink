// Demo flavor NPC (PLAN.md §3.11): small charming chat exercising the talk
// system's full feature set — hasItem branching, two speakers, and a choice
// where only one branch calls complete() (the other just ends, no flag
// recorded — the trigger stays replayable either way since `once: false`).
EXTERNAL hasItem(itemId)
EXTERNAL complete()

Oh, hello there! Lovely day for a stroll around the village, isn't it? # id:npc-villager.greet # speaker:villager
{ hasItem("demo-key"):
    Ooh, is that a demo key I spy? Careful with that thing — it opens the way out of here! # id:npc-villager.key-seen # speaker:villager
- else:
    You look like you're still finding your way around these parts. # id:npc-villager.key-missing # speaker:villager
}
Got any advice for a traveler like me? # id:npc-villager.player-ask # speaker:player
*   [Sure, let's hear it! # id:npc-villager.chat.yes]
    Keep an eye out for shiny things on the ground — they're rarely just decoration. # id:npc-villager.tip # speaker:villager
    ~ complete()
    -> DONE
*   [No thanks, just passing through. # id:npc-villager.chat.no]
    Suit yourself. Safe travels, then! # id:npc-villager.bye # speaker:villager
    -> DONE
