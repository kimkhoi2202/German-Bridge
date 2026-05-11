import { type Card, type Suit, rankVal } from "./cards";

export interface Play {
  playerIdx: number;
  card: Card;
}

/**
 * Resolve a completed trick.
 *
 * Multi-deck rule: when two plays have the same rank in the same tier
 * (both trump, or both lead-suit), the LATER-played card wins.
 * This is implemented by using `>=` instead of `>` when comparing ranks
 * within the same tier — every later equal-or-higher card overwrites the
 * provisional winner.
 */
export function resolveTrick(
  plays: readonly Play[],
  leadSuit: Suit,
  trumpSuit: Suit | null,
): Play {
  if (plays.length === 0) {
    throw new Error("resolveTrick: empty trick");
  }
  let winner: Play = plays[0];
  let bestVal = -1;
  let bestTier = -1;

  for (const p of plays) {
    let tier = -1;
    if (trumpSuit && p.card.s === trumpSuit) tier = 2;
    else if (p.card.s === leadSuit) tier = 1;

    if (tier > bestTier || (tier === bestTier && rankVal(p.card.r) >= bestVal)) {
      winner = p;
      bestTier = tier;
      bestVal = rankVal(p.card.r);
    }
  }
  return winner;
}
