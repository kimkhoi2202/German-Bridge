# German Bridge AI Rating Protocol

This file defines what must be true before we can honestly call a checkpoint
`3000 Elo` or say it consistently beats humans.

## Current Status

The current AI ladder is an internal promotion ladder, not a human-calibrated
Elo ladder.

Promotion is based on corrected 2-deck, 4-12 player arena reports. The current
gate sorts checkpoints by:

1. higher arena win rate
2. lower average rank
3. higher score margin
4. higher dataset accuracy as a final tie-breaker

This is useful for choosing the deployed local champion, but it does not prove
human strength. It only proves strength relative to the current benchmark
opponents and previously evaluated checkpoints.

## Rating Definitions

### Internal Ladder Rating

Internal ladder ratings may be computed from bot-vs-bot tournaments, self-play
leagues, or checkpoint round robins. They are useful for training decisions and
promotion gates.

Internal ratings must be labeled as internal, for example:

```text
Internal German Bridge ladder rating: 2140
```

They must not be described as human Elo unless the calibration steps below are
complete.

### Human-Calibrated Elo

Human-calibrated Elo requires human match data from the same game variant:

- 2 decks
- 4-12 players
- same bidding, trick, scoring, and round rules as the deployed app
- no hidden-state advantage for the AI
- enough games to produce confidence intervals

Human-calibrated ratings must be labeled with the protocol and sample size, for
example:

```text
Human-calibrated German Bridge Elo: 1840 +/- 120, 960 rated hands
```

## Minimum Evidence For A 3000 Elo Claim

A checkpoint can only be called `3000 Elo` if all of the following are true:

1. The benchmark contains real human results or a public human ladder with a
   documented mapping to Elo.
2. The AI plays through the same public observation boundary exposed to a human.
3. The evaluation includes all supported player counts from 4 through 12, or the
   claim is explicitly limited to a narrower player-count range.
4. The rating report includes confidence intervals.
5. The lower confidence bound is at least 3000 under the human-calibrated
   protocol.
6. The AI beats the strongest available human cohort by a statistically
   meaningful margin, not just in a small exhibition match.

Until those requirements are met, use wording like `strongest known internal
checkpoint` or `current deployed champion`, not `3000 Elo`.

## Human Test Protocol

If no public German Bridge ladder exists, use a private human-calibration pool:

1. Create fixed match settings for 4, 6, 8, 10, and 12 players.
2. Record every completed hand with player ids, final scores, player counts,
   tricks per hand, bids, won tricks, and whether each seat was human or AI.
3. Mix humans, heuristic bots, and AI checkpoints without revealing which bot is
   the candidate model.
4. Rate all seats with the same multiplayer rating update.
5. Require at least 200 completed hands per tested player-count bucket before
   making any broad human-strength claim.
6. Preserve raw match logs so the rating can be recomputed.

## Near-Term Engineering Path

The next useful work before a human-calibrated claim is:

1. Keep a reproducible internal rating report from existing arena outputs:
   `pnpm ai:rating:internal`.
2. Add a human match export path from Convex/local games into the AI evaluation
   format.
3. Build a blind human benchmark queue that can seat the deployed champion
   against consenting humans and baseline bots.
4. Move beyond flat behavior cloning with search or recurrent public-history
   modeling, while preserving the fair-observation boundary.

## Guardrail

No agent should claim a 3000-Elo German Bridge AI from the current promotion
leaderboard alone. The leaderboard is a checkpoint-selection tool; a human Elo
claim requires human calibration data.
