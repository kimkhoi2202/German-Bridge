import {
  chooseBidWithTrace,
  chooseCardWithTrace,
  type BotActionTrace,
  type BotDecisionAction,
  type BotDecisionResult,
  type BotDecisionTrace,
  type Personality,
} from "../bot";
import type { Card } from "../cards";
import type { GameState } from "../game";
import { createObservation } from "../botObservation";
import type { ScoredAction } from "./policies";
import { createChampionSnapshotPolicy, createRolloutSearchPolicy } from "./policies";
import { createSeededRng } from "./rng";
import { championSnapshotId } from "./championSnapshot";

export const runtimeChampionPolicyId = "human-playstyle-champion-rollout-6x2-bid4-scored";
const TRACE_TOP_ACTIONS = 5;

const runtimeChampionPolicy = createRolloutSearchPolicy({
  id: runtimeChampionPolicyId,
  rolloutsPerMove: 6,
  depthTricks: 2,
  bidRolloutsPerCandidate: 4,
  bidDepthTricks: 2,
  utilityMode: "scored",
  fallback: createChampionSnapshotPolicy("theodore-hybrid-fallback"),
});

const BID_AMBITION_SCORE_WINDOW = 4;
const BID_AMBITION_MIN_TRICKS = 4;

export function chooseRuntimeBotBid(state: GameState, playerIdx: number): number {
  return chooseRuntimeBotBidWithTrace(state, playerIdx).action;
}

export function chooseRuntimeBotCard(state: GameState, playerIdx: number): Card {
  return chooseRuntimeBotCardWithTrace(state, playerIdx).action;
}

export function chooseRuntimeBotBidWithTrace(state: GameState, playerIdx: number): BotDecisionResult<number> {
  const observation = createObservation(state, playerIdx);
  if (personalityFor(state, playerIdx) !== "champion") {
    return chooseBidWithTrace(observation);
  }

  const rng = createSeededRng(runtimeDecisionSeed(state, playerIdx, "bid"));
  const scores = rankRuntimeBidScores(
    runtimeChampionPolicy.scoreBidActions?.({ state, playerIdx, rng }) ?? [],
    state,
  );
  const best = scores[0];
  if (best) {
    const chosenAction = bidAction(best.action);
    return {
      action: best.action,
      trace: runtimeTrace({
        decisionKind: "bid",
        personality: "champion",
        chosenAction,
        legalActionCount: observation.legalBids.length,
        legalActions: scores.map((score) => bidTrace(score, chosenAction)),
      }),
    };
  }

  return chooseBidWithTrace(observation);
}

export function chooseRuntimeBotCardWithTrace(state: GameState, playerIdx: number): BotDecisionResult<Card> {
  const observation = createObservation(state, playerIdx);
  if (personalityFor(state, playerIdx) !== "champion") {
    return chooseCardWithTrace(observation);
  }

  const rng = createSeededRng(runtimeDecisionSeed(state, playerIdx, "play"));
  const scores = runtimeChampionPolicy.scorePlayActions?.({ state, playerIdx, rng }) ?? [];
  const best = scores[0];
  if (best) {
    const chosenAction = cardAction(best.action);
    return {
      action: best.action,
      trace: runtimeTrace({
        decisionKind: "card",
        personality: "champion",
        chosenAction,
        legalActionCount: observation.legalCards.length,
        legalActions: scores.map((score) => cardTrace(score, chosenAction)),
      }),
    };
  }

  return chooseCardWithTrace(observation);
}

function runtimeDecisionSeed(state: GameState, playerIdx: number, kind: "bid" | "play"): string {
  const publicTrick = state.currentTrick
    .map((play) => `${play.playerIdx}:${play.card.key}`)
    .join(",");
  const bidCount = state.bids.filter((bid) => bid != null).length;
  return [
    "runtime-theodore",
    kind,
    `round:${state.round}`,
    `trick:${state.trickIdx}`,
    `player:${playerIdx}`,
    `bidTurn:${state.bidTurn}`,
    `turn:${state.turnIdx}`,
    `bids:${bidCount}`,
    `current:${publicTrick}`,
    `played:${state.playLog.length}`,
  ].join("|");
}

function personalityFor(state: GameState, playerIdx: number): Personality {
  return state.players[playerIdx]?.personality ?? "mixed";
}

function bidAction(bid: number): BotDecisionAction {
  return { kind: "bid", bid, label: `Bid ${bid}` };
}

function cardLabel(card: Card): string {
  return `${card.r}${card.s.toUpperCase()} deck ${card.d + 1}`;
}

function cardAction(card: Card): BotDecisionAction {
  return {
    kind: "card",
    card,
    cardKey: card.key,
    label: cardLabel(card),
  };
}

function finiteScore(score: number) {
  return Number.isFinite(score) ? Number(score.toFixed(6)) : 0;
}

function bidTrace(score: ScoredAction<number>, chosenAction: BotDecisionAction): BotActionTrace {
  return {
    ...bidAction(score.action),
    score: finiteScore(score.score),
    isChosen: chosenAction.kind === "bid" && score.action === chosenAction.bid,
  };
}

function rankRuntimeBidScores(scores: ScoredAction<number>[], state: GameState) {
  if (scores.length <= 1 || state.tricksTotal < BID_AMBITION_MIN_TRICKS) {
    return scores;
  }

  const bestScore = scores[0].score;
  return [...scores].sort((a, b) => {
    const aAmbitious = isAmbitiousBidCandidate(a, bestScore);
    const bAmbitious = isAmbitiousBidCandidate(b, bestScore);
    if (aAmbitious !== bAmbitious) return aAmbitious ? -1 : 1;
    if (aAmbitious && bAmbitious && a.action !== b.action) return b.action - a.action;
    if (b.score !== a.score) return b.score - a.score;
    return a.action - b.action;
  });
}

function isAmbitiousBidCandidate(score: ScoredAction<number>, bestScore: number) {
  return score.score > 0 && score.score >= bestScore - BID_AMBITION_SCORE_WINDOW;
}

function cardTrace(score: ScoredAction<Card>, chosenAction: BotDecisionAction): BotActionTrace {
  return {
    ...cardAction(score.action),
    score: finiteScore(score.score),
    isChosen: chosenAction.kind === "card" && score.action.key === chosenAction.cardKey,
  };
}

function runtimeTrace(args: {
  decisionKind: "bid" | "card";
  personality: Personality;
  chosenAction: BotDecisionAction;
  legalActionCount: number;
  legalActions: BotActionTrace[];
}): BotDecisionTrace {
  return {
    version: 1,
    decisionKind: args.decisionKind,
    personality: args.personality,
    policyId: runtimeChampionPolicyId,
    requestedPolicyId: `champion:${championSnapshotId}`,
    checkpointId: championSnapshotId,
    fallback: false,
    chosenAction: args.chosenAction,
    legalActionCount: args.legalActionCount,
    legalActions: args.legalActions,
    topActions: args.legalActions.slice(0, TRACE_TOP_ACTIONS),
    heuristic: {
      rolloutPolicy: runtimeChampionPolicyId,
      bidRolloutsPerCandidate: 4,
      bidAmbitionScoreWindow: BID_AMBITION_SCORE_WINDOW,
      rolloutsPerMove: 6,
      depthTricks: 2,
      utilityMode: "scored",
    },
  };
}
