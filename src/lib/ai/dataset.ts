import type { BotObservation } from "../botObservation";
import type { Card, Suit } from "../cards";
import { ranksFromScores } from "./ratings";
import {
  replayableSummary,
  runHeadlessMatch,
  type HeadlessDecisionKind,
  type TrainingMatchConfig,
} from "./headless";

export interface DatasetConfig extends Omit<TrainingMatchConfig, "seed"> {
  seed: string | number;
  matches: number;
}

export interface SerializedCard {
  r: Card["r"];
  s: Card["s"];
  d: number;
  key: string;
}

export interface SerializedObservation {
  playerIdx: number;
  playerCount: number;
  decks: number;
  tricksPerHand: number;
  tricksTotal: number;
  trumpCard: SerializedCard | null;
  trumpSuit: Card["s"] | null;
  ownHand: SerializedCard[];
  bids: (number | null)[];
  won: number[];
  currentTrick: Array<{ playerIdx: number; card: SerializedCard }>;
  playLog: Array<{
    trick: number;
    order: number;
    playerIdx: number;
    card: SerializedCard;
    winner?: boolean;
  }>;
  legalBids: number[];
  legalCards: SerializedCard[];
  remainingHandCounts: number[];
  leadIdx: number;
  turnIdx: number;
  bidTurn: number;
  opponentProfiles: Array<{
    playerIdx: number;
    currentBid: number | null;
    currentWon: number;
    currentBidGap: number;
    cardsPlayed: number;
    tricksWon: number;
    leadCount: number;
    trumpPlayed: number;
    offSuitDiscards: number;
    voidSuits: Record<Suit, boolean>;
    priorRounds: number;
    priorBidTotal: number;
    priorWonTotal: number;
    priorMadeBidCount: number;
    priorOverBidCount: number;
    priorUnderBidCount: number;
    priorScoreTotal: number;
  }>;
}

export interface TrainingExample {
  id: string;
  matchIndex: number;
  decisionIndex: number;
  seed: string;
  kind: HeadlessDecisionKind;
  policyId: string;
  playerIdx: number;
  round: number;
  trick: number;
  order: number;
  observation: SerializedObservation;
  action: number | SerializedCard;
  actionValueTargets?: Array<{
    action: number | SerializedCard;
    value: number;
  }>;
  outcome: {
    finalScore: number;
    finalRank: number;
    winner: boolean;
    bid: number;
    won: number;
    madeBid: boolean;
  };
}

export interface DatasetManifest {
  seed: string;
  matches: number;
  examples: number;
  config: {
    decks: 2;
    playerCount: number;
    tricksPerHand: number;
    maxRounds: number;
  };
  policyIds: string[];
  replaySummaries: ReturnType<typeof replayableSummary>[];
}

export interface GeneratedDataset {
  manifest: DatasetManifest;
  examples: TrainingExample[];
}

export interface GeneratedDatasetMatch {
  matchIndex: number;
  seed: string;
  examples: TrainingExample[];
  manifestConfig: DatasetManifest["config"];
  policyIds: string[];
  replaySummary: ReturnType<typeof replayableSummary>;
}

export function* generateTrainingDatasetMatches(config: DatasetConfig): Generator<GeneratedDatasetMatch> {
  if (!Number.isInteger(config.matches) || config.matches < 1) {
    throw new Error(`Dataset matches must be a positive integer, got ${config.matches}`);
  }

  for (let matchIndex = 0; matchIndex < config.matches; matchIndex += 1) {
    const result = runHeadlessMatch({
      ...config,
      seed: `${config.seed}:dataset:${matchIndex}`,
    });
    const ranks = ranksFromScores(result.cumulative);
    const manifestConfig: DatasetManifest["config"] = {
      decks: 2,
      playerCount: result.config.playerCount,
      tricksPerHand: result.config.tricksPerHand,
      maxRounds: result.config.maxRounds,
    };
    const examples = result.decisions.map((decision, decisionIndex) => {
      const playerIdx = decision.playerIdx;
      const decisionRound = result.rounds.find((round) => round.round === decision.round) ?? result.rounds.at(-1);
      const bid = decisionRound?.bids[playerIdx] ?? result.finalState.bids[playerIdx] ?? 0;
      const won = decisionRound?.won[playerIdx] ?? result.finalState.won[playerIdx] ?? 0;
      return {
        id: `${result.seed}:${decisionIndex}`,
        matchIndex,
        decisionIndex,
        seed: result.seed,
        kind: decision.kind,
        policyId: decision.policyId,
        playerIdx,
        round: decision.round,
        trick: decision.trick,
        order: decision.order,
        observation: serializeObservation(decision.observation),
        action: typeof decision.action === "number" ? decision.action : serializeCard(decision.action),
        actionValueTargets: decision.actionValueTargets?.map((target) => ({
          action: typeof target.action === "number" ? target.action : serializeCard(target.action),
          value: target.score,
        })),
        outcome: {
          finalScore: result.cumulative[playerIdx],
          finalRank: ranks[playerIdx],
          winner: result.winnerIdx === playerIdx,
          bid,
          won,
          madeBid: bid === won,
        },
      };
    });
    yield {
      matchIndex,
      seed: result.seed,
      examples,
      manifestConfig,
      policyIds: result.policyIds,
      replaySummary: replayableSummary(result),
    };
  }
}

export function generateTrainingDataset(config: DatasetConfig): GeneratedDataset {
  const examples: TrainingExample[] = [];
  const replaySummaries: ReturnType<typeof replayableSummary>[] = [];
  let firstConfig: DatasetManifest["config"] | null = null;
  let policyIds: string[] = [];

  for (const match of generateTrainingDatasetMatches(config)) {
    examples.push(...match.examples);
    replaySummaries.push(match.replaySummary);
    firstConfig ??= match.manifestConfig;
    policyIds = match.policyIds;
  }

  return {
    manifest: {
      seed: String(config.seed),
      matches: config.matches,
      examples: examples.length,
      config: firstConfig ?? {
        decks: 2,
        playerCount: config.playerCount,
        tricksPerHand: config.tricksPerHand,
        maxRounds: config.maxRounds ?? config.tricksPerHand,
      },
      policyIds,
      replaySummaries,
    },
    examples,
  };
}

export function serializeObservation(observation: BotObservation): SerializedObservation {
  return {
    playerIdx: observation.playerIdx,
    playerCount: observation.playerCount,
    decks: 2,
    tricksPerHand: observation.tricksPerHand,
    tricksTotal: observation.tricksTotal,
    trumpCard: observation.trumpCard ? serializeCard(observation.trumpCard) : null,
    trumpSuit: observation.trumpSuit,
    ownHand: observation.ownHand.map(serializeCard),
    bids: observation.bids,
    won: observation.won,
    currentTrick: observation.currentTrick.map((play) => ({
      playerIdx: play.playerIdx,
      card: serializeCard(play.card),
    })),
    playLog: observation.playLog.map((entry) => ({
      trick: entry.trick,
      order: entry.order,
      playerIdx: entry.playerIdx,
      card: serializeCard(entry.card),
      winner: entry.winner,
    })),
    legalBids: observation.legalBids,
    legalCards: observation.legalCards.map(serializeCard),
    remainingHandCounts: observation.remainingHandCounts,
    leadIdx: observation.leadIdx,
    turnIdx: observation.turnIdx,
    bidTurn: observation.bidTurn,
    opponentProfiles: observation.opponentProfiles.map((profile) => ({
      ...profile,
      voidSuits: { ...profile.voidSuits },
    })),
  };
}

export function serializeCard(card: Card): SerializedCard {
  return {
    r: card.r,
    s: card.s,
    d: card.d,
    key: card.key,
  };
}

export function examplesToJsonl(examples: readonly TrainingExample[]): string {
  return examples.map((example) => JSON.stringify(example)).join("\n") + "\n";
}

export function manifestToJson(manifest: DatasetManifest): string {
  return JSON.stringify(manifest, null, 2) + "\n";
}
