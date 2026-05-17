import type { BotObservation } from "../botObservation";
import { RANKS, SUITS, type Card } from "../cards";
import snapshotWeights from "./championSnapshotWeights.json";

const MAX_PLAYERS = 12;
const MAX_TRICKS_2_DECK = 25;
const CARD_COUNT = 104;
const CARD_ACTION_OFFSET = MAX_TRICKS_2_DECK + 1;
const OPPONENT_PROFILE_FEATURES = 18;

interface SnapshotModelWeights {
  checkpointId: string;
  architecture: {
    architectureVersion?: number;
    featureDim: number;
    hiddenDim: number;
    actionDim: number;
    bidTrickDim?: number;
    auxiliaryHeadsTrained?: boolean;
  };
  layers: {
    encoder0Weight: number[][];
    encoder0Bias: number[];
    encoder2Weight: number[][];
    encoder2Bias: number[];
    policyWeight: number[][];
    policyBias: number[];
    actionValueWeight?: number[][];
    actionValueBias?: number[];
    bidTricksWeight?: number[][];
    bidTricksBias?: number[];
  };
}

interface SnapshotPortfolioWeights {
  checkpointId: string;
  createdBy?: string;
  trainingMode?: string;
  notes?: string;
  portfolio: {
    selectorMetric?: string;
    baselineCheckpointId?: string;
    regularization?: unknown;
    selection: {
      playerCount: number;
      tricksPerHand: number;
      checkpointId: string;
    }[];
    models: Record<string, SnapshotModelWeights>;
  };
}

type SnapshotWeights = SnapshotModelWeights | SnapshotPortfolioWeights;

const SNAPSHOT = snapshotWeights as SnapshotWeights;

export const championSnapshotId = SNAPSHOT.checkpointId;

export interface ChampionActionScore {
  actionIndex: number;
  label: string;
  score: number;
  bid?: number;
  card?: Card;
}

export function chooseChampionBid(observation: BotObservation): number | null {
  return scoreChampionBidActions(observation)[0]?.bid ?? null;
}

export function chooseChampionCard(observation: BotObservation): Card | null {
  return scoreChampionCardActions(observation)[0]?.card ?? null;
}

export function scoreChampionBidActions(observation: BotObservation): ChampionActionScore[] {
  if (!canUseChampionSnapshot(observation) || observation.legalBids.length === 0) return [];
  const model = selectSnapshotModel(observation);
  if (!model) return [];
  const output = forward(encodeObservation(observation), model);
  return observation.legalBids
    .flatMap((bid) => {
      if (bid < 0 || bid > MAX_TRICKS_2_DECK) return [];
      const policyScore = output.policyLogits[bid];
      const calibratedScore =
        output.bidTrickLogits && model.architecture.auxiliaryHeadsTrained
          ? expectedBidScore(output.bidTrickLogits, bid, observation.tricksTotal)
          : null;
      const score = calibratedScore == null ? policyScore : calibratedScore + 0.01 * policyScore;
      if (!Number.isFinite(score)) return [];
      return [{ actionIndex: bid, label: `Bid ${bid}`, score, bid }];
    })
    .sort((a, b) => b.score - a.score);
}

export function scoreChampionCardActions(observation: BotObservation): ChampionActionScore[] {
  if (!canUseChampionSnapshot(observation) || observation.legalCards.length === 0) return [];
  const model = selectSnapshotModel(observation);
  if (!model) return [];
  const output = forward(encodeObservation(observation), model);
  return observation.legalCards
    .flatMap((card) => {
      const index = cardIndex(card);
      if (index == null) return [];
      const actionIndex = CARD_ACTION_OFFSET + index;
      const policyScore = output.policyLogits[actionIndex];
      const actionValueScore =
        output.actionValues && model.architecture.auxiliaryHeadsTrained ? output.actionValues[actionIndex] : null;
      const score = actionValueScore == null ? policyScore : actionValueScore + 0.01 * policyScore;
      if (!Number.isFinite(score)) return [];
      return [
        {
          actionIndex,
          label: cardLabel(card),
          score,
          card,
        },
      ];
    })
    .sort((a, b) => b.score - a.score);
}

export function canUseChampionSnapshot(observation: BotObservation): boolean {
  return (
    observation.decks === 2 &&
    observation.playerCount >= 4 &&
    observation.playerCount <= MAX_PLAYERS &&
    observation.tricksTotal >= 1 &&
    observation.tricksTotal <= MAX_TRICKS_2_DECK &&
    selectSnapshotModel(observation) != null
  );
}

function cardLabel(card: Card): string {
  return `${card.r}${card.s.toUpperCase()} deck ${card.d + 1}`;
}

interface SnapshotForward {
  policyLogits: number[];
  actionValues?: number[];
  bidTrickLogits?: number[];
}

function forward(features: number[], model: SnapshotModelWeights): SnapshotForward {
  const adapted = adaptFeatures(features, model.architecture.featureDim);
  const hidden0 = relu(linear(adapted, model.layers.encoder0Weight, model.layers.encoder0Bias));
  const hidden1 = relu(linear(hidden0, model.layers.encoder2Weight, model.layers.encoder2Bias));
  const policyLogits = linear(hidden1, model.layers.policyWeight, model.layers.policyBias);
  const actionValues =
    model.layers.actionValueWeight && model.layers.actionValueBias
      ? linear(hidden1, model.layers.actionValueWeight, model.layers.actionValueBias)
      : undefined;
  const bidTrickLogits =
    model.layers.bidTricksWeight && model.layers.bidTricksBias
      ? linear(hidden1, model.layers.bidTricksWeight, model.layers.bidTricksBias)
      : undefined;
  return { policyLogits, actionValues, bidTrickLogits };
}

function selectSnapshotModel(observation: BotObservation): SnapshotModelWeights | null {
  if (!isPortfolioSnapshot(SNAPSHOT)) return SNAPSHOT;
  const checkpointId = selectPortfolioCheckpointId(observation);
  if (checkpointId && SNAPSHOT.portfolio.models[checkpointId]) {
    return SNAPSHOT.portfolio.models[checkpointId];
  }
  const fallbackId = SNAPSHOT.portfolio.baselineCheckpointId;
  if (fallbackId && SNAPSHOT.portfolio.models[fallbackId]) {
    return SNAPSHOT.portfolio.models[fallbackId];
  }
  return Object.values(SNAPSHOT.portfolio.models)[0] ?? null;
}

function selectPortfolioCheckpointId(observation: BotObservation): string | null {
  if (!isPortfolioSnapshot(SNAPSHOT)) return null;
  const exact = SNAPSHOT.portfolio.selection.find(
    (row) => row.playerCount === observation.playerCount && row.tricksPerHand === observation.tricksPerHand,
  );
  if (exact) return exact.checkpointId;
  const closest = [...SNAPSHOT.portfolio.selection].sort((a, b) => {
    const aDistance =
      Math.abs(a.playerCount - observation.playerCount) + Math.abs(a.tricksPerHand - observation.tricksPerHand);
    const bDistance =
      Math.abs(b.playerCount - observation.playerCount) + Math.abs(b.tricksPerHand - observation.tricksPerHand);
    return aDistance - bDistance || a.playerCount - b.playerCount || a.tricksPerHand - b.tricksPerHand;
  })[0];
  return closest?.checkpointId ?? null;
}

function isPortfolioSnapshot(snapshot: SnapshotWeights): snapshot is SnapshotPortfolioWeights {
  return "portfolio" in snapshot;
}

function encodeObservation(observation: BotObservation): number[] {
  const own = cardBag(observation.ownHand);
  const legal = cardBag(observation.legalCards);
  const current = cardBag(observation.currentTrick.map((play) => play.card));
  const played = cardBag(observation.playLog.map((entry) => entry.card));
  const trumpSuit = observation.trumpSuit ? oneHot(SUITS.indexOf(observation.trumpSuit), SUITS.length) : zeros(4);
  const trumpRank = observation.trumpCard ? oneHot(RANKS.indexOf(observation.trumpCard.r), RANKS.length) : zeros(13);
  const bids = padNormalized(
    observation.bids.map((bid) => (bid == null ? -1 : bid)),
    MAX_PLAYERS,
    MAX_TRICKS_2_DECK,
  );
  const won = padNormalized(observation.won, MAX_PLAYERS, MAX_TRICKS_2_DECK);
  const handCounts = padNormalized(observation.remainingHandCounts, MAX_PLAYERS, MAX_TRICKS_2_DECK);
  const scalars = [
    observation.playerIdx / (MAX_PLAYERS - 1),
    observation.playerCount / MAX_PLAYERS,
    observation.tricksPerHand / MAX_TRICKS_2_DECK,
    observation.tricksTotal / MAX_TRICKS_2_DECK,
    observation.leadIdx / (MAX_PLAYERS - 1),
    observation.turnIdx / (MAX_PLAYERS - 1),
    observation.bidTurn / (MAX_PLAYERS - 1),
  ];
  const kind = [observation.legalBids.length ? 1 : 0, observation.legalCards.length ? 1 : 0];
  return [
    ...own,
    ...legal,
    ...current,
    ...played,
    ...trumpSuit,
    ...trumpRank,
    ...bids,
    ...won,
    ...handCounts,
    ...scalars,
    ...kind,
    ...opponentProfileFeatures(observation),
  ];
}

function opponentProfileFeatures(observation: BotObservation): number[] {
  const byPlayer = new Map(
    (observation.opponentProfiles ?? []).map((profile, index) => [
      profile.playerIdx ?? index,
      profile,
    ]),
  );
  const out: number[] = [];
  for (let playerIdx = 0; playerIdx < MAX_PLAYERS; playerIdx += 1) {
    const profile = byPlayer.get(playerIdx);
    if (!profile) {
      out.push(...zeros(OPPONENT_PROFILE_FEATURES));
      continue;
    }
    const priorRounds = profile.priorRounds || 0;
    out.push(
      (profile.currentBid == null ? -1 : profile.currentBid) / MAX_TRICKS_2_DECK,
      profile.currentWon / MAX_TRICKS_2_DECK,
      profile.currentBidGap / MAX_TRICKS_2_DECK,
      profile.cardsPlayed / MAX_TRICKS_2_DECK,
      profile.tricksWon / MAX_TRICKS_2_DECK,
      profile.leadCount / MAX_TRICKS_2_DECK,
      profile.trumpPlayed / MAX_TRICKS_2_DECK,
      profile.offSuitDiscards / MAX_TRICKS_2_DECK,
      profile.voidSuits.s ? 1 : 0,
      profile.voidSuits.h ? 1 : 0,
      profile.voidSuits.d ? 1 : 0,
      profile.voidSuits.c ? 1 : 0,
      priorRounds / 10,
      profile.priorBidTotal / Math.max(1, priorRounds * MAX_TRICKS_2_DECK),
      profile.priorWonTotal / Math.max(1, priorRounds * MAX_TRICKS_2_DECK),
      profile.priorMadeBidCount / Math.max(1, priorRounds),
      (profile.priorOverBidCount - profile.priorUnderBidCount) / Math.max(1, priorRounds),
      profile.priorScoreTotal / Math.max(1, priorRounds * 25),
    );
  }
  return out;
}

function cardBag(cards: readonly Card[]): number[] {
  const out = zeros(CARD_COUNT);
  for (const card of cards) {
    const index = cardIndex(card);
    if (index != null) out[index] += 1;
  }
  return out;
}

function cardIndex(card: Card): number | null {
  if (card.d < 0 || card.d > 1) return null;
  const suitIndex = SUITS.indexOf(card.s);
  const rankIndex = RANKS.indexOf(card.r);
  if (suitIndex < 0 || rankIndex < 0) return null;
  return card.d * 52 + suitIndex * 13 + rankIndex;
}

function oneHot(index: number, size: number): number[] {
  const out = zeros(size);
  if (index >= 0 && index < size) out[index] = 1;
  return out;
}

function padNormalized(values: readonly number[], size: number, divisor: number): number[] {
  return Array.from({ length: size }, (_, index) => (values[index] ?? 0) / divisor);
}

function adaptFeatures(features: number[], size: number): number[] {
  if (features.length === size) return features;
  if (features.length > size) return features.slice(0, size);
  return [...features, ...zeros(size - features.length)];
}

function linear(input: number[], weight: number[][], bias: number[]): number[] {
  return weight.map((row, rowIndex) => {
    let total = bias[rowIndex] ?? 0;
    for (let i = 0; i < input.length; i += 1) {
      total += (row[i] ?? 0) * input[i];
    }
    return total;
  });
}

function relu(values: number[]): number[] {
  return values.map((value) => Math.max(0, value));
}

function zeros(size: number): number[] {
  return Array.from({ length: size }, () => 0);
}

function expectedBidScore(bidTrickLogits: number[], bid: number, tricksTotal: number): number {
  const maxWon = Math.max(0, Math.min(MAX_TRICKS_2_DECK, tricksTotal, bidTrickLogits.length - 1));
  const probabilities = softmax(bidTrickLogits.slice(0, maxWon + 1));
  return probabilities.reduce((total, probability, won) => total + probability * scoreBidOutcome(bid, won), 0);
}

function scoreBidOutcome(bid: number, won: number): number {
  return bid === won ? 10 + won * won : -(Math.abs(bid - won) ** 2);
}

function softmax(values: number[]): number[] {
  const peak = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - peak));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}
