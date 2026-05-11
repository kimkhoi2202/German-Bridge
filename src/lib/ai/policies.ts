import { chooseBid, chooseCard } from "../bot";
import { createObservation } from "../botObservation";
import { buildShoe, rankVal, type Card, type Suit } from "../cards";
import {
  placeBid,
  playCard,
  settleTrick,
  type GameState,
} from "../game";
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

export interface RolloutSearchOptions {
  id?: string;
  rolloutsPerMove?: number;
  depthTricks?: number;
  fallback?: BotPolicy;
}

export function createRolloutSearchPolicy(options: RolloutSearchOptions = {}): BotPolicy {
  const rolloutsPerMove = options.rolloutsPerMove ?? 16;
  const depthTricks = options.depthTricks ?? 2;
  const fallback = options.fallback ?? createBaselinePolicy("rollout-fallback");

  return {
    id: options.id ?? `rollout-${rolloutsPerMove}x${depthTricks}`,
    bid(context) {
      return fallback.bid(context);
    },
    play({ state, playerIdx, rng }) {
      const observation = createObservation(state, playerIdx);
      const candidates = observation.legalCards;
      if (candidates.length <= 1 || rolloutsPerMove <= 0 || depthTricks <= 0) {
        return fallback.play({ state, playerIdx, rng });
      }

      let best = candidates[0];
      let bestScore = -Infinity;
      for (const card of candidates) {
        let total = 0;
        for (let i = 0; i < rolloutsPerMove; i++) {
          const rolloutRng = rng.fork(`${state.round}:${state.trickIdx}:${playerIdx}:${card.key}:${i}`);
          const sampled = sampleBeliefState(state, playerIdx, rolloutRng);
          const after = playCard(sampled, playerIdx, card);
          const finished = rolloutForward(after, playerIdx, rolloutRng, depthTricks, fallback);
          total += utilityForPlayer(finished, playerIdx);
        }
        const score = total / rolloutsPerMove;
        if (score > bestScore || (score === bestScore && cardStrength(card) < cardStrength(best))) {
          best = card;
          bestScore = score;
        }
      }
      return best;
    },
  };
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

function utilityForPlayer(state: GameState, playerIdx: number): number {
  const bid = state.bids[playerIdx] ?? 0;
  const won = state.won[playerIdx];
  const remaining = state.tricksTotal - state.trickIdx;
  const need = bid - won;
  const made = need === 0 ? 12 : -Math.abs(need) * 2;
  const possible = need > 0 && need <= remaining ? 2 : need <= 0 ? 1 : -3;
  return made + possible;
}

function cardStrength(card: Card): number {
  return rankVal(card.r) + card.d * 0.01;
}

export function bidInTurn(state: GameState, policy: BotPolicy, rng: SeededRng): GameState {
  const playerIdx = state.bidTurn;
  return placeBid(state, playerIdx, policy.bid({ state, playerIdx, rng }));
}

export function playInTurn(state: GameState, policy: BotPolicy, rng: SeededRng): GameState {
  const playerIdx = state.turnIdx;
  return playCard(state, playerIdx, policy.play({ state, playerIdx, rng }));
}
