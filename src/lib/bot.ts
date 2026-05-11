// German Bridge — bot decision logic
//
// `Personality` shifts the equity estimate up/down so aggressive bots
// over-bid relative to their hand strength and cautious bots under-bid.

import { type Card, type Suit, rankVal } from "./cards";
import { legalCards } from "./cards";
import { resolveTrick, type Play } from "./trick";
import type { BotObservation } from "./botObservation";

export type Personality = "cautious" | "mixed" | "aggressive";

function personalityFor(observation: BotObservation): Personality {
  return observation.players[observation.playerIdx]?.personality ?? "mixed";
}

/** Heuristic count of "expected tricks" in a hand given the trump suit. */
export function handEquity(hand: readonly Card[], trump: Suit | null): number {
  let eq = 0;
  for (const c of hand) {
    if (trump && c.s === trump) {
      const v = rankVal(c.r);
      eq += 0.55 + Math.max(0, v - 6) * 0.06;
    } else if (c.r === "A") eq += 0.55;
    else if (c.r === "K") eq += 0.30;
    else if (c.r === "Q") eq += 0.12;
  }
  return eq;
}

export function botBid(args: {
  hand: readonly Card[];
  trumpSuit: Suit | null;
  personality: Personality;
  tricksTotal: number;
  isLast: boolean;
  /** Bid value the last bidder is forbidden to choose, or null. */
  restricted: number | null;
}): number {
  const { hand, trumpSuit, personality, tricksTotal, isLast, restricted } = args;
  let eq = handEquity(hand, trumpSuit);
  if (personality === "aggressive") eq *= 1.2;
  else if (personality === "cautious") eq *= 0.78;

  let bid = Math.max(0, Math.min(tricksTotal, Math.round(eq)));
  if (isLast && restricted != null && bid === restricted) {
    const tries = [bid - 1, bid + 1, bid - 2, bid + 2, 0, tricksTotal];
    for (const cand of tries) {
      if (cand >= 0 && cand <= tricksTotal && cand !== restricted) {
        bid = cand;
        break;
      }
    }
  }
  return bid;
}

export function chooseBid(observation: BotObservation): number {
  const legal = observation.legalBids;
  if (legal.length === 0) {
    throw new Error("chooseBid: no legal bids in observation");
  }

  let eq = handEquity(observation.ownHand, observation.trumpSuit);
  const personality = personalityFor(observation);
  if (personality === "aggressive") eq *= 1.2;
  else if (personality === "cautious") eq *= 0.78;

  const preferred = Math.max(
    0,
    Math.min(observation.tricksTotal, Math.round(eq)),
  );
  if (legal.includes(preferred)) return preferred;

  const fallbackOrder = [
    preferred - 1,
    preferred + 1,
    preferred - 2,
    preferred + 2,
    0,
    observation.tricksTotal,
  ];
  return fallbackOrder.find((bid) => legal.includes(bid)) ?? legal[0];
}

export function botPlay(args: {
  hand: readonly Card[];
  currentTrick: readonly Play[];
  trumpSuit: Suit | null;
  bid: number;
  won: number;
  /** When true, prefer winning the trick. When false, prefer losing it. */
  // (we derive `wantWin` internally from bid vs. won)
}): Card {
  const { hand, currentTrick, trumpSuit, bid, won } = args;
  const leadSuit = currentTrick.length ? currentTrick[0].card.s : null;
  const legal = legalCards(hand, leadSuit);
  const sorted = [...legal].sort((a, b) => rankVal(a.r) - rankVal(b.r));
  const need = bid - won;
  const wantWin = need > 0;

  if (currentTrick.length === 0) {
    if (wantWin) {
      const offsuit = sorted.filter((c) => trumpSuit == null || c.s !== trumpSuit);
      if (offsuit.length) {
        const top = offsuit[offsuit.length - 1];
        if (rankVal(top.r) >= rankVal("K")) return top;
      }
      return sorted[sorted.length - 1];
    }
    return sorted[0];
  }

  const provisionalWinner = resolveTrick(currentTrick, currentTrick[0].card.s, trumpSuit);
  const winningCard = provisionalWinner.card;
  const winningTier =
    trumpSuit && winningCard.s === trumpSuit ? 2 : winningCard.s === leadSuit ? 1 : 0;

  const beats = sorted.filter((c) => {
    const tier =
      trumpSuit && c.s === trumpSuit ? 2 : c.s === leadSuit ? 1 : 0;
    if (tier > winningTier) return true;
    if (tier < winningTier) return false;
    // Same tier — second-card-wins rule means equal rank also beats provisional.
    return rankVal(c.r) >= rankVal(winningCard.r);
  });

  if (wantWin && beats.length) return beats[0];
  if (!wantWin) {
    const losers = sorted.filter((c) => !beats.includes(c));
    if (losers.length) return losers[losers.length - 1];
  }
  return sorted[0];
}

export function chooseCard(observation: BotObservation): Card {
  const legal = observation.legalCards.length
    ? observation.legalCards
    : legalCards(
        observation.ownHand,
        observation.currentTrick.length ? observation.currentTrick[0].card.s : null,
      );
  if (legal.length === 0) {
    throw new Error("chooseCard: no legal cards in observation");
  }

  return botPlay({
    hand: legal,
    currentTrick: observation.currentTrick,
    trumpSuit: observation.trumpSuit,
    bid: observation.bids[observation.playerIdx] ?? 0,
    won: observation.won[observation.playerIdx] ?? 0,
  });
}
