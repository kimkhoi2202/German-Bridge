import { chooseBid, chooseCard, handEquity } from "../bot";
import { createObservation } from "../botObservation";
import { buildShoe, rankVal, type Card, type Suit } from "../cards";
import {
  championSnapshotId,
  scoreChampionBidActions,
  scoreChampionCardActions,
} from "./championSnapshot";
import {
  placeBid,
  playCard,
  settleTrick,
  type GameState,
} from "../game";
import { score as scoreRound } from "../scoring";
import type { SeededRng } from "./rng";

export interface BidContext {
  state: GameState;
  playerIdx: number;
  rng: SeededRng;
}

export interface PlayContext {
  state: GameState;
  playerIdx: number;
  rng: SeededRng;
}

export interface BotPolicy {
  readonly id: string;
  bid: (context: BidContext) => number;
  play: (context: PlayContext) => Card;
  scoreBidActions?: (context: BidContext) => ScoredAction<number>[];
  scorePlayActions?: (context: PlayContext) => ScoredAction<Card>[];
}

export interface ScoredAction<TAction> {
  action: TAction;
  score: number;
}

export function createBaselinePolicy(id = "baseline"): BotPolicy {
  return {
    id,
    bid({ state, playerIdx }) {
      return chooseBid(createObservation(state, playerIdx));
    },
    play({ state, playerIdx }) {
      return chooseCard(createObservation(state, playerIdx));
    },
  };
}

export function createRandomLegalPolicy(id = "random-legal"): BotPolicy {
  return {
    id,
    bid({ state, playerIdx, rng }) {
      return rng.pick(createObservation(state, playerIdx).legalBids);
    },
    play({ state, playerIdx, rng }) {
      return rng.pick(createObservation(state, playerIdx).legalCards);
    },
  };
}

export function createChampionSnapshotPolicy(id = `champion:${championSnapshotId}`): BotPolicy {
  const fallback = createBaselinePolicy("champion-fallback");
  return {
    id,
    bid({ state, playerIdx, rng }) {
      const observation = createObservation(state, playerIdx);
      const best = scoreChampionBidActions(observation)[0];
      return best?.bid ?? fallback.bid({ state, playerIdx, rng });
    },
    play({ state, playerIdx, rng }) {
      const observation = createObservation(state, playerIdx);
      const best = scoreChampionCardActions(observation)[0];
      return best?.card ?? fallback.play({ state, playerIdx, rng });
    },
  };
}

export interface RolloutSearchOptions {
  id?: string;
  rolloutsPerMove?: number;
  depthTricks?: number;
  bidRolloutsPerCandidate?: number;
  bidDepthTricks?: number;
  fallback?: BotPolicy;
  utilityMode?: "legacy" | "scored";
}

export function createRolloutSearchPolicy(options: RolloutSearchOptions = {}): BotPolicy {
  const config = normalizeRolloutSearchOptions(options);

  return {
    id: options.id ?? `rollout-${config.rolloutsPerMove}x${config.depthTricks}`,
    bid(context) {
      return scoreRolloutBidActions(context, config)[0]?.action ?? config.fallback.bid(context);
    },
    play(context) {
      return scoreRolloutCardActions(context, config)[0]?.action ?? config.fallback.play(context);
    },
    scoreBidActions(context) {
      return scoreRolloutBidActions(context, config);
    },
    scorePlayActions(context) {
      return scoreRolloutCardActions(context, config);
    },
  };
}

interface NormalizedRolloutSearchOptions {
  rolloutsPerMove: number;
  depthTricks: number;
  bidRolloutsPerCandidate: number;
  bidDepthTricks: number;
  fallback: BotPolicy;
  utilityMode: "legacy" | "scored";
}

function normalizeRolloutSearchOptions(options: RolloutSearchOptions): NormalizedRolloutSearchOptions {
  return {
    rolloutsPerMove: options.rolloutsPerMove ?? 16,
    depthTricks: options.depthTricks ?? 2,
    bidRolloutsPerCandidate: options.bidRolloutsPerCandidate ?? 0,
    bidDepthTricks: options.bidDepthTricks ?? Number.POSITIVE_INFINITY,
    fallback: options.fallback ?? createBaselinePolicy("rollout-fallback"),
    utilityMode: options.utilityMode ?? "legacy",
  };
}

export function scoreRolloutBidActions(
  { state, playerIdx, rng }: BidContext,
  options: RolloutSearchOptions = {},
): ScoredAction<number>[] {
  const config = normalizeRolloutSearchOptions(options);
  const observation = createObservation(state, playerIdx);
  const candidates = observation.legalBids;
  if (candidates.length <= 1 || config.bidRolloutsPerCandidate <= 0) {
    return [];
  }

  const fallbackBid = config.fallback.bid({
    state,
    playerIdx,
    rng: rng.fork(`bid-fallback:${state.round}:${playerIdx}`),
  });
  const scored = candidates.map((bid) => {
    let total = 0;
    for (let i = 0; i < config.bidRolloutsPerCandidate; i++) {
      const rolloutRng = rng.fork(`bid:${state.round}:${playerIdx}:${bid}:${i}`);
      const sampled = sampleBeliefState(state, playerIdx, rolloutRng);
      const afterBid = placeBid(sampled, playerIdx, bid);
      const finished = rolloutBiddingAndPlay(
        afterBid,
        playerIdx,
        rolloutRng,
        config.bidDepthTricks,
        config.fallback,
      );
      total += utilityForPlayer(finished, playerIdx, config.utilityMode);
    }
    return { action: bid, score: total / config.bidRolloutsPerCandidate };
  });

  return scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (bidTieBreaksBetter(a.action, b.action, fallbackBid)) return -1;
    if (bidTieBreaksBetter(b.action, a.action, fallbackBid)) return 1;
    return a.action - b.action;
  });
}

export function scoreRolloutCardActions(
  { state, playerIdx, rng }: PlayContext,
  options: RolloutSearchOptions = {},
): ScoredAction<Card>[] {
  const config = normalizeRolloutSearchOptions(options);
  const observation = createObservation(state, playerIdx);
  const candidates = observation.legalCards;
  if (candidates.length <= 1 || config.rolloutsPerMove <= 0 || config.depthTricks <= 0) {
    return [];
  }

  const scored = candidates.map((card) => {
    let total = 0;
    for (let i = 0; i < config.rolloutsPerMove; i++) {
      const rolloutRng = rng.fork(`${state.round}:${state.trickIdx}:${playerIdx}:${card.key}:${i}`);
      const sampled = sampleBeliefState(state, playerIdx, rolloutRng);
      const after = playCard(sampled, playerIdx, card);
      const finished = rolloutForward(after, playerIdx, rolloutRng, config.depthTricks, config.fallback);
      total += utilityForPlayer(finished, playerIdx, config.utilityMode);
    }
    return { action: card, score: total / config.rolloutsPerMove };
  });

  return scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return cardStrength(a.action) - cardStrength(b.action);
  });
}

function sampleBeliefState(state: GameState, playerIdx: number, rng: SeededRng): GameState {
  const observation = createObservation(state, playerIdx);
  const knownKeys = new Set([
    ...observation.ownHand.map((card) => card.key),
    ...observation.currentTrick.map((play) => play.card.key),
    ...(observation.trumpCard ? [observation.trumpCard.key] : []),
    ...observation.playLog.map((entry) => entry.card.key),
  ]);
  const unknownCards = buildShoe(state.decks).filter((card) => !knownKeys.has(card.key));
  const voidSuits = inferVoidSuits(observation.playLog);

  const shuffled = [...unknownCards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const pool = shuffled;
  const hands = state.hands.map((hand, idx) => {
    if (idx === playerIdx) return [...hand];
    const hiddenCount = hand.length;
    const hidden: Card[] = [];
    while (hidden.length < hiddenCount && pool.length > 0) {
      const voided = voidSuits[idx];
      const compatibleIndex = voided
        ? pool.findIndex((card) => !voided.has(card.s))
        : 0;
      const pickIndex = compatibleIndex >= 0 ? compatibleIndex : 0;
      hidden.push(pool.splice(pickIndex, 1)[0]);
    }
    return hidden;
  });

  return { ...state, hands };
}

function inferVoidSuits(playLog: readonly { trick: number; order: number; playerIdx: number; card: Card }[]) {
  const voidSuits: Record<number, Set<Suit>> = {};
  const leadByTrick = new Map<number, Suit>();

  for (const entry of playLog) {
    if (entry.order === 1) {
      leadByTrick.set(entry.trick, entry.card.s);
      continue;
    }
    const leadSuit = leadByTrick.get(entry.trick);
    if (leadSuit && entry.card.s !== leadSuit) {
      voidSuits[entry.playerIdx] ??= new Set<Suit>();
      voidSuits[entry.playerIdx].add(leadSuit);
    }
  }
  return voidSuits;
}

function rolloutForward(
  state: GameState,
  targetIdx: number,
  rng: SeededRng,
  depthTricks: number,
  policy: BotPolicy,
): GameState {
  let current = state;
  const stopAfterTrick = state.trickIdx + depthTricks;

  while (current.phase !== "round-end" && current.trickIdx < stopAfterTrick) {
    if (current.phase === "trick-end") {
      current = settleTrick(current);
      continue;
    }
    if (current.phase !== "playing") break;
    const turn = current.turnIdx;
    const card = policy.play({
      state: current,
      playerIdx: turn,
      rng: rng.fork(`p${turn}:${current.trickIdx}:${current.currentTrick.length}:${current.hands[turn].length}`),
    });
    current = playCard(current, turn, card);
  }
  return current;
}

function rolloutBiddingAndPlay(
  state: GameState,
  targetIdx: number,
  rng: SeededRng,
  depthTricks: number,
  policy: BotPolicy,
): GameState {
  let current = state;

  while (current.phase === "bidding") {
    const turn = current.bidTurn;
    const bid = policy.bid({
      state: current,
      playerIdx: turn,
      rng: rng.fork(`b${turn}:${current.round}:${current.bids.filter((b) => b != null).length}`),
    });
    current = placeBid(current, turn, bid);
  }

  if (current.phase !== "playing") return current;
  return rolloutForward(current, targetIdx, rng, depthTricks, policy);
}

function utilityForPlayer(
  state: GameState,
  playerIdx: number,
  utilityMode: "legacy" | "scored",
): number {
  const bid = state.bids[playerIdx] ?? 0;
  const won = state.won[playerIdx];
  const remaining = Math.max(0, state.tricksTotal - state.trickIdx);
  if (utilityMode === "legacy") {
    const need = bid - won;
    const made = need === 0 ? 12 : -Math.abs(need) * 2;
    const possible = need > 0 && need <= remaining ? 2 : need <= 0 ? 1 : -3;
    return made + possible;
  }

  if (state.phase === "round-end" || state.phase === "match-end" || remaining === 0) {
    return scoreRound(bid, won);
  }

  const trumpSuit = state.trumpCard?.s ?? null;
  const projectedWon = Math.max(
    won,
    Math.min(won + remaining, won + handEquity(state.hands[playerIdx] ?? [], trumpSuit)),
  );
  const roundedProjection = Math.max(won, Math.min(won + remaining, Math.round(projectedWon)));
  const exactStillPossible = bid >= won && bid <= won + remaining;
  const distance = Math.abs(bid - projectedWon);
  const currentMissDistance =
    bid < won ? won - bid : bid > won + remaining ? bid - (won + remaining) : 0;

  return (
    scoreRound(bid, roundedProjection) -
    distance * 0.75 -
    currentMissDistance * currentMissDistance * 2 +
    (exactStillPossible ? 2 : -4)
  );
}

function cardStrength(card: Card): number {
  return rankVal(card.r) + card.d * 0.01;
}

function bidTieBreaksBetter(candidate: number, current: number, fallbackBid: number): boolean {
  const candidateDistance = Math.abs(candidate - fallbackBid);
  const currentDistance = Math.abs(current - fallbackBid);
  if (candidateDistance !== currentDistance) return candidateDistance < currentDistance;
  return candidate < current;
}

export function bidInTurn(state: GameState, policy: BotPolicy, rng: SeededRng): GameState {
  const playerIdx = state.bidTurn;
  return placeBid(state, playerIdx, policy.bid({ state, playerIdx, rng }));
}

export function playInTurn(state: GameState, policy: BotPolicy, rng: SeededRng): GameState {
  const playerIdx = state.turnIdx;
  return playCard(state, playerIdx, policy.play({ state, playerIdx, rng }));
}
