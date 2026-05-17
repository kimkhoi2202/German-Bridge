// German Bridge — bot decision logic
//
// `Personality` shifts the equity estimate up/down so aggressive bots
// over-bid relative to their hand strength and cautious bots under-bid.

import { type Card, type Suit, rankVal } from "./cards";
import { legalCards } from "./cards";
import { resolveTrick, type Play } from "./trick";
import type { BotObservation } from "./botObservation";
import {
  canUseChampionSnapshot,
  championSnapshotId,
  scoreChampionBidActions,
  scoreChampionCardActions,
  type ChampionActionScore,
} from "./ai/championSnapshot";

export type Personality = "cautious" | "mixed" | "aggressive" | "champion" | "gpt";

type BidDecisionAction = {
  kind: "bid";
  bid: number;
  label: string;
};

type CardDecisionAction = {
  kind: "card";
  card: Card;
  cardKey: string;
  label: string;
};

export type BotDecisionAction = BidDecisionAction | CardDecisionAction;

export type BotActionTrace = BotDecisionAction & {
  actionIndex?: number;
  score?: number;
  isChosen?: boolean;
};

export interface BotDecisionTrace {
  version: 1;
  decisionKind: "bid" | "card";
  personality: Personality;
  policyId: string;
  requestedPolicyId: string;
  checkpointId?: string;
  fallback: boolean;
  fallbackReason?: string;
  chosenAction: BotDecisionAction;
  legalActionCount: number;
  legalActions: BotActionTrace[];
  topActions: BotActionTrace[];
  heuristic?: Record<string, number | boolean | string | null>;
}

export interface BotDecisionResult<TAction> {
  action: TAction;
  trace: BotDecisionTrace;
}

const TRACE_TOP_ACTIONS = 5;

function personalityFor(observation: BotObservation): Personality {
  return observation.players[observation.playerIdx]?.personality ?? "mixed";
}

function cardLabel(card: Card): string {
  return `${card.r}${card.s.toUpperCase()} deck ${card.d + 1}`;
}

function cardAction(card: Card): CardDecisionAction {
  return {
    kind: "card",
    card,
    cardKey: card.key,
    label: cardLabel(card),
  };
}

function bidAction(bid: number): BidDecisionAction {
  return { kind: "bid", bid, label: `Bid ${bid}` };
}

function finiteScore(score: number) {
  return Number.isFinite(score) ? Number(score.toFixed(6)) : 0;
}

function policyIdFor(personality: Personality) {
  return personality === "champion" ? `champion:${championSnapshotId}` : `heuristic:${personality}`;
}

function adjustedEquity(observation: BotObservation, personality: Personality) {
  const rawEquity = handEquity(observation.ownHand, observation.trumpSuit);
  let adjusted = rawEquity;
  if (personality === "aggressive") adjusted *= 1.2;
  else if (personality === "cautious") adjusted *= 0.78;
  const preferred = Math.max(0, Math.min(observation.tricksTotal, Math.round(adjusted)));
  return { rawEquity, adjusted, preferred };
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

function championActionTrace(score: ChampionActionScore, chosenAction: BotDecisionAction): BotActionTrace {
  if (score.bid != null) {
    return {
      ...bidAction(score.bid),
      actionIndex: score.actionIndex,
      score: finiteScore(score.score),
      isChosen: chosenAction.kind === "bid" && score.bid === chosenAction.bid,
    };
  }
  if (!score.card) {
    return {
      ...chosenAction,
      actionIndex: score.actionIndex,
      score: finiteScore(score.score),
      isChosen: true,
    };
  }
  return {
    ...cardAction(score.card),
    actionIndex: score.actionIndex,
    score: finiteScore(score.score),
    isChosen: chosenAction.kind === "card" && score.card.key === chosenAction.cardKey,
  };
}

function chooseHeuristicBid(
  observation: BotObservation,
  args?: { fallback?: boolean; fallbackReason?: string; requestedPolicyId?: string },
): BotDecisionResult<number> {
  const legal = observation.legalBids;
  if (legal.length === 0) {
    throw new Error("chooseBid: no legal bids in observation");
  }

  const personality = personalityFor(observation);
  const { rawEquity, adjusted, preferred } = adjustedEquity(observation, personality);
  let chosen = preferred;
  if (!legal.includes(preferred)) {
    const fallbackOrder = [
      preferred - 1,
      preferred + 1,
      preferred - 2,
      preferred + 2,
      0,
      observation.tricksTotal,
    ];
    chosen = fallbackOrder.find((bid) => legal.includes(bid)) ?? legal[0];
  }

  const chosenAction = bidAction(chosen);
  const legalActions = legal.map((bid) => ({
    ...bidAction(bid),
    score: finiteScore(-Math.abs(bid - preferred)),
    isChosen: bid === chosen,
  }));

  return {
    action: chosen,
    trace: {
      version: 1,
      decisionKind: "bid",
      personality,
      policyId: `heuristic:${personality}`,
      requestedPolicyId: args?.requestedPolicyId ?? policyIdFor(personality),
      fallback: args?.fallback ?? false,
      fallbackReason: args?.fallbackReason,
      chosenAction,
      legalActionCount: legal.length,
      legalActions,
      topActions: [...legalActions]
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.bid - b.bid)
        .slice(0, TRACE_TOP_ACTIONS),
      heuristic: {
        rawEquity: finiteScore(rawEquity),
        adjustedEquity: finiteScore(adjusted),
        preferredBid: preferred,
      },
    },
  };
}

export function chooseBidWithTrace(observation: BotObservation): BotDecisionResult<number> {
  const legal = observation.legalBids;
  if (legal.length === 0) {
    throw new Error("chooseBid: no legal bids in observation");
  }

  const personality = personalityFor(observation);
  if (personality === "champion") {
    const scores = scoreChampionBidActions(observation);
    const best = scores[0];
    if (best?.bid != null) {
      const chosenAction = bidAction(best.bid);
      return {
        action: best.bid,
        trace: {
          version: 1,
          decisionKind: "bid",
          personality,
          policyId: `champion:${championSnapshotId}`,
          requestedPolicyId: `champion:${championSnapshotId}`,
          checkpointId: championSnapshotId,
          fallback: false,
          chosenAction,
          legalActionCount: legal.length,
          legalActions: scores.map((score) => championActionTrace(score, chosenAction)),
          topActions: scores
            .slice(0, TRACE_TOP_ACTIONS)
            .map((score) => championActionTrace(score, chosenAction)),
        },
      };
    }
    return chooseHeuristicBid(observation, {
      fallback: true,
      fallbackReason: canUseChampionSnapshot(observation)
        ? "champion_snapshot_no_scored_legal_bid"
        : "champion_snapshot_unsupported_config",
      requestedPolicyId: `champion:${championSnapshotId}`,
    });
  }

  return chooseHeuristicBid(observation);
}

export function chooseBid(observation: BotObservation): number {
  return chooseBidWithTrace(observation).action;
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
  return chooseCardWithTrace(observation).action;
}

function chooseHeuristicCard(
  observation: BotObservation,
  args?: { fallback?: boolean; fallbackReason?: string; requestedPolicyId?: string },
): BotDecisionResult<Card> {
  const legal = observation.legalCards.length
    ? observation.legalCards
    : legalCards(
        observation.ownHand,
        observation.currentTrick.length ? observation.currentTrick[0].card.s : null,
      );
  if (legal.length === 0) {
    throw new Error("chooseCard: no legal cards in observation");
  }

  const personality = personalityFor(observation);
  const chosen = botPlay({
    hand: legal,
    currentTrick: observation.currentTrick,
    trumpSuit: observation.trumpSuit,
    bid: observation.bids[observation.playerIdx] ?? 0,
    won: observation.won[observation.playerIdx] ?? 0,
  });
  const chosenAction = cardAction(chosen);
  const leadSuit = observation.currentTrick.length ? observation.currentTrick[0].card.s : null;
  const need = (observation.bids[observation.playerIdx] ?? 0) - (observation.won[observation.playerIdx] ?? 0);
  const legalActions = legal.map((card) => ({
    ...cardAction(card),
    score: card.key === chosen.key ? 1 : 0,
    isChosen: card.key === chosen.key,
  }));
  return {
    action: chosen,
    trace: {
      version: 1,
      decisionKind: "card",
      personality,
      policyId: `heuristic:${personality}`,
      requestedPolicyId: args?.requestedPolicyId ?? policyIdFor(personality),
      fallback: args?.fallback ?? false,
      fallbackReason: args?.fallbackReason,
      chosenAction,
      legalActionCount: legal.length,
      legalActions,
      topActions: [...legalActions]
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || rankVal(b.card.r) - rankVal(a.card.r))
        .slice(0, TRACE_TOP_ACTIONS),
      heuristic: {
        bid: observation.bids[observation.playerIdx] ?? null,
        won: observation.won[observation.playerIdx] ?? 0,
        need,
        wantWin: need > 0,
        leadSuit,
      },
    },
  };
}

export function chooseCardWithTrace(observation: BotObservation): BotDecisionResult<Card> {
  const legal = observation.legalCards.length
    ? observation.legalCards
    : legalCards(
        observation.ownHand,
        observation.currentTrick.length ? observation.currentTrick[0].card.s : null,
      );
  if (legal.length === 0) {
    throw new Error("chooseCard: no legal cards in observation");
  }

  const personality = personalityFor(observation);
  if (personality === "champion") {
    const scores = scoreChampionCardActions({ ...observation, legalCards: legal });
    const best = scores[0];
    if (best?.card) {
      const chosenAction = cardAction(best.card);
      return {
        action: best.card,
        trace: {
          version: 1,
          decisionKind: "card",
          personality,
          policyId: `champion:${championSnapshotId}`,
          requestedPolicyId: `champion:${championSnapshotId}`,
          checkpointId: championSnapshotId,
          fallback: false,
          chosenAction,
          legalActionCount: legal.length,
          legalActions: scores.map((score) => championActionTrace(score, chosenAction)),
          topActions: scores
            .slice(0, TRACE_TOP_ACTIONS)
            .map((score) => championActionTrace(score, chosenAction)),
        },
      };
    }
    return chooseHeuristicCard(observation, {
      fallback: true,
      fallbackReason: canUseChampionSnapshot(observation)
        ? "champion_snapshot_no_scored_legal_card"
        : "champion_snapshot_unsupported_config",
      requestedPolicyId: `champion:${championSnapshotId}`,
    });
  }

  return chooseHeuristicCard(observation);
}
