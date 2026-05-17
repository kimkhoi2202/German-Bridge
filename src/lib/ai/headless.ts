import { maxTricks, type Card } from "../cards";
import {
  cumulativeScores,
  initialState,
  nextRound,
  placeBid,
  playCard,
  settleTrick,
  startRound,
  type GameState,
  type MatchConfig,
  type Player,
  type RoundRecord,
} from "../game";
import type { Personality } from "../bot";
import { type BotObservation, createObservation } from "../botObservation";
import { createSeededRng, type SeededRng } from "./rng";
import { createBaselinePolicy, type BotPolicy, type ScoredAction } from "./policies";

export interface TrainingMatchConfig {
  playerCount: number;
  decks?: number;
  tricksPerHand: number;
  maxRounds?: number;
  seed?: string | number;
  personalities?: readonly Personality[];
  policyByPlayer?: readonly BotPolicy[];
}

export interface HeadlessBidLogEntry {
  round: number;
  playerIdx: number;
  bid: number;
}

export interface HeadlessPlayLogEntry {
  round: number;
  trick: number;
  order: number;
  playerIdx: number;
  card: Card;
  winner?: boolean;
}

export type HeadlessDecisionKind = "bid" | "play";

export interface HeadlessDecisionLogEntry {
  kind: HeadlessDecisionKind;
  round: number;
  trick: number;
  order: number;
  playerIdx: number;
  policyId: string;
  observation: BotObservation;
  action: number | Card;
  actionValueTargets?: Array<ScoredAction<number | Card>>;
}

export interface HeadlessMatchResult {
  seed: string;
  config: {
    playerCount: number;
    decks: number;
    tricksPerHand: number;
    maxRounds: number;
  };
  players: Player[];
  policyIds: string[];
  rounds: RoundRecord[];
  bids: HeadlessBidLogEntry[];
  plays: HeadlessPlayLogEntry[];
  decisions: HeadlessDecisionLogEntry[];
  cumulative: number[];
  winnerIdx: number;
  finalState: GameState;
}

const PERSONALITIES: Personality[] = ["cautious", "mixed", "aggressive"];

export function buildTrainingPlayers(
  playerCount: number,
  personalities: readonly Personality[] = PERSONALITIES,
): Player[] {
  if (!Number.isInteger(playerCount) || playerCount < 4 || playerCount > 12) {
    throw new Error(`Training playerCount must be an integer from 4 to 12, got ${playerCount}`);
  }
  return Array.from({ length: playerCount }, (_, i) => ({
    id: `ai-${i}`,
    name: `AI ${i + 1}`,
    isHuman: false,
    personality: personalities[i % personalities.length] ?? "mixed",
  }));
}

export function normalizeTrainingConfig(config: TrainingMatchConfig): MatchConfig {
  const decks = config.decks ?? 2;
  if (decks !== 2) {
    throw new Error(`Training decks must be exactly 2 for the current AI scaffold, got ${decks}`);
  }
  const players = buildTrainingPlayers(config.playerCount, config.personalities);
  const max = maxTricks(players.length, decks);
  if (
    !Number.isInteger(config.tricksPerHand) ||
    config.tricksPerHand < 1 ||
    config.tricksPerHand > max
  ) {
    throw new Error(
      `Training tricksPerHand must be an integer from 1 to ${max} for ${players.length} players and ${decks} decks, got ${config.tricksPerHand}`,
    );
  }
  return {
    players,
    decks,
    tricksPerHand: config.tricksPerHand,
    maxRounds: config.maxRounds ?? config.tricksPerHand,
  };
}

export function runHeadlessMatch(config: TrainingMatchConfig): HeadlessMatchResult {
  const rng = createSeededRng(config.seed ?? "german-bridge-ai");
  const matchConfig = normalizeTrainingConfig(config);
  const policies = policySet(matchConfig.players.length, config.policyByPlayer);
  const bidLog: HeadlessBidLogEntry[] = [];
  const playLog: HeadlessPlayLogEntry[] = [];
  const decisionLog: HeadlessDecisionLogEntry[] = [];

  let state = initialState(matchConfig);
  state = startRound(state, rng.next);

  while (state.phase !== "match-end") {
    if (state.phase === "dealing" || state.phase === "trump") {
      state = { ...state, phase: "bidding" };
      continue;
    }

    if (state.phase === "bidding") {
      const playerIdx = state.bidTurn;
      const observation = createObservation(state, playerIdx);
      const policy = policies[playerIdx];
      const decisionRng = rng.fork(`bid:${state.round}:${playerIdx}`);
      const actionValueTargets = policy.scoreBidActions?.({ state, playerIdx, rng: decisionRng });
      const bid = actionValueTargets?.[0]?.action ?? policy.bid({ state, playerIdx, rng: decisionRng });
      state = placeBid(state, playerIdx, bid);
      bidLog.push({ round: state.round, playerIdx, bid });
      decisionLog.push({
        kind: "bid",
        round: state.round,
        trick: state.trickIdx,
        order: observation.bids.filter((b) => b != null).length + 1,
        playerIdx,
        policyId: policy.id,
        observation,
        action: bid,
        actionValueTargets,
      });
      continue;
    }

    if (state.phase === "playing") {
      const playerIdx = state.turnIdx;
      const observation = createObservation(state, playerIdx);
      const policy = policies[playerIdx];
      const decisionRng = rng.fork(`play:${state.round}:${state.trickIdx}:${state.currentTrick.length}:${playerIdx}`);
      const actionValueTargets = policy.scorePlayActions?.({
        state,
        playerIdx,
        rng: decisionRng,
      });
      const card = actionValueTargets?.[0]?.action ?? policy.play({ state, playerIdx, rng: decisionRng });
      state = playCard(state, playerIdx, card);
      const latest = state.playLog.at(-1);
      if (latest) {
        playLog.push({ round: state.round, ...latest });
      }
      if (state.phase === "trick-end") {
        markLastTrickWinner(playLog, state.round, state.trickIdx + 1, state.trickWinner);
      }
      decisionLog.push({
        kind: "play",
        round: state.round,
        trick: state.trickIdx + 1,
        order: observation.currentTrick.length + 1,
        playerIdx,
        policyId: policy.id,
        observation,
        action: card,
        actionValueTargets,
      });
      continue;
    }

    if (state.phase === "trick-end") {
      state = settleTrick(state);
      continue;
    }

    if (state.phase === "round-end") {
      state = nextRound(state, rng.next);
      continue;
    }

    throw new Error(`runHeadlessMatch: unsupported phase ${state.phase}`);
  }

  const cumulative = cumulativeScores(state);
  return {
    seed: rng.seed,
    config: {
      playerCount: matchConfig.players.length,
      decks: matchConfig.decks,
      tricksPerHand: matchConfig.tricksPerHand,
      maxRounds: matchConfig.maxRounds,
    },
    players: matchConfig.players,
    policyIds: policies.map((policy) => policy.id),
    rounds: state.history,
    bids: bidLog,
    plays: playLog,
    decisions: decisionLog,
    cumulative,
    winnerIdx: cumulative.reduce((best, value, idx, scores) => (value > scores[best] ? idx : best), 0),
    finalState: state,
  };
}

function policySet(playerCount: number, policies?: readonly BotPolicy[]): BotPolicy[] {
  const baseline = createBaselinePolicy();
  return Array.from({ length: playerCount }, (_, i) => policies?.[i] ?? baseline);
}

function markLastTrickWinner(
  log: HeadlessPlayLogEntry[],
  round: number,
  trick: number,
  winnerIdx: number | null,
) {
  if (winnerIdx == null) return;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].round !== round || log[i].trick !== trick) break;
    log[i] = { ...log[i], winner: log[i].playerIdx === winnerIdx };
  }
}

export function replayableSummary(result: HeadlessMatchResult) {
  return {
    seed: result.seed,
    config: result.config,
    policyIds: result.policyIds,
    rounds: result.rounds.map((round) => ({
      round: round.round,
      dealerIdx: round.dealerIdx,
      trump: round.trump.key,
      bids: round.bids,
      won: round.won,
      scores: round.scores,
    })),
    plays: result.plays.map((play) => ({
      round: play.round,
      trick: play.trick,
      order: play.order,
      playerIdx: play.playerIdx,
      card: play.card.key,
      winner: play.winner === true,
    })),
    decisions: result.decisions.map((decision) => ({
      kind: decision.kind,
      round: decision.round,
      trick: decision.trick,
      order: decision.order,
      playerIdx: decision.playerIdx,
      policyId: decision.policyId,
      action: typeof decision.action === "number" ? decision.action : decision.action.key,
      legalActions:
        decision.kind === "bid"
          ? decision.observation.legalBids
          : decision.observation.legalCards.map((card) => card.key),
    })),
    cumulative: result.cumulative,
    winnerIdx: result.winnerIdx,
  };
}

export function forkMatchSeed(base: string | number, matchIndex: number): SeededRng {
  return createSeededRng(`${base}:match:${matchIndex}`);
}
