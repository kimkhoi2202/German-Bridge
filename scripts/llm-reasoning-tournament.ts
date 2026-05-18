import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { maxTricks, type Card } from "../src/lib/cards";
import { createObservation } from "../src/lib/botObservation";
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
} from "../src/lib/game";
import {
  DEFAULT_GPT_BRIDGE_MODEL,
  DEFAULT_GPT_BRIDGE_REASONING_EFFORT,
  buildGptBridgeInput,
  buildGptBridgeTextFormat,
  parseGptBridgeDecision,
  validateGptBridgeDecision,
} from "../src/lib/ai/gptBridgeBot";
import {
  DEFAULT_LLM_BRIDGE_STRATEGY_ID,
  formatLlmBridgeStrategyCard,
  getLlmBridgeStrategyCard,
  type LlmBridgeStrategyCard,
} from "../src/lib/ai/llmStrategyCards";
import { buildTrainingPlayers } from "../src/lib/ai/headless";
import { createChampionSnapshotPolicy, type BotPolicy } from "../src/lib/ai/policies";
import { createSeededRng, type SeededRng } from "../src/lib/ai/rng";
import { numberArg, parseArgs, stringArg } from "./ai-cli";

type TournamentMode = "api" | "mock";
type BracketMode = "ladder" | "parallel";
type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

interface ReasoningTournamentConfig {
  mode: TournamentMode;
  apiKey?: string;
  model: string;
  strategy: LlmBridgeStrategyCard;
  reasoningLevels: ReasoningEffort[];
  maxOutputTokens: number;
  maxAttempts: number;
  requestTimeoutMs: number;
  seed: string;
  playerCount: number;
  decks: number;
  tricksPerHand: number;
  maxRounds: number;
  matchesPerPairing: number;
  bracketMode: BracketMode;
  out: string;
}

interface DecisionTelemetry {
  fallback: boolean;
  forced: boolean;
  latencyMs: number;
  failureReason?: string;
}

interface MatchTelemetry {
  reasoningByPlayer: ReasoningEffort[];
  decisions: Array<{
    playerIdx: number;
    reasoningEffort: ReasoningEffort;
    kind: "bid" | "card";
    fallback: boolean;
    forced: boolean;
    latencyMs: number;
    failureReason?: string;
  }>;
}

interface ReasoningStats {
  reasoningEffort: ReasoningEffort;
  groupMatches: number;
  groupMatchWins: number;
  groupScoreSum: number;
  seatMatches: number;
  seatWins: number;
  rankSum: number;
  scoreSum: number;
  rounds: number;
  exactRounds: number;
  underbidRounds: number;
  overbidRounds: number;
  severeUnderbidRounds: number;
  severeOverbidRounds: number;
  bidTotal: number;
  wonTotal: number;
  decisionCount: number;
  forcedDecisionCount: number;
  fallbackCount: number;
  latencyTotalMs: number;
  failureReasons: Record<string, number>;
}

interface ReasoningStanding {
  reasoningEffort: ReasoningEffort;
  groupMatches: number;
  groupWinRate: number;
  averageGroupScore: number;
  seatMatches: number;
  seatWinRate: number;
  averageRank: number;
  averageSeatScore: number;
  exactRate: number;
  underbidRate: number;
  overbidRate: number;
  severeUnderbidRate: number;
  severeOverbidRate: number;
  averageBid: number;
  averageWon: number;
  decisionCount: number;
  forcedDecisionRate: number;
  fallbackRate: number;
  averageLatencyMs: number;
  failureReasons: Record<string, number>;
}

interface MatchSummary {
  seed: string;
  reasoningBySeat: ReasoningEffort[];
  rounds: Array<{
    round: number;
    tricks: number;
    dealerIdx: number;
    firstBidderIdx: number;
    leadIdx: number;
    trump: string;
    bids: number[];
    won: number[];
  }>;
  cumulativeScores: number[];
  groupScores: Record<string, number>;
  winnerReasoning: ReasoningEffort | "tie";
}

interface PairingReport {
  pairingIndex: number;
  roundIndex: number;
  challenger: ReasoningEffort;
  defender: ReasoningEffort;
  winner: ReasoningEffort;
  standings: ReasoningStanding[];
  matches: MatchSummary[];
}

interface ReasoningTournamentReport {
  mode: TournamentMode;
  seed: string;
  model: string;
  strategyId: string;
  strategyCard: string;
  reasoningLevels: ReasoningEffort[];
  maxOutputTokens: number;
  maxAttempts: number;
  requestTimeoutMs: number;
  playerCount: number;
  decks: number;
  tricksPerHand: number;
  maxRounds: number;
  matchesPerPairing: number;
  bracketMode: BracketMode;
  championReasoning: ReasoningEffort;
  bracket: PairingReport[];
  note?: string;
}

async function main() {
  const args = parseArgs();
  const apiKey = process.env.OPENAI_API_KEY;
  const mode = modeArg(stringArg(args, "mode", apiKey ? "api" : "mock"));
  const config: ReasoningTournamentConfig = {
    mode,
    apiKey,
    model: stringArg(args, "model", process.env.OPENAI_GERMAN_BRIDGE_MODEL ?? DEFAULT_GPT_BRIDGE_MODEL),
    strategy: getLlmBridgeStrategyCard(
      stringArg(args, "strategy", process.env.OPENAI_GERMAN_BRIDGE_STRATEGY_ID ?? DEFAULT_LLM_BRIDGE_STRATEGY_ID),
    ),
    reasoningLevels: reasoningLevelsArg(
      stringArg(args, "levels", `low,medium,high,xhigh`),
    ),
    maxOutputTokens: numberArg(
      args,
      "max-output-tokens",
      Number(process.env.OPENAI_GERMAN_BRIDGE_MAX_OUTPUT_TOKENS ?? 512),
    ),
    maxAttempts: numberArg(args, "max-attempts", Number(process.env.OPENAI_GERMAN_BRIDGE_MAX_ATTEMPTS ?? 2)),
    requestTimeoutMs: numberArg(
      args,
      "request-timeout-ms",
      Number(process.env.OPENAI_GERMAN_BRIDGE_REQUEST_TIMEOUT_MS ?? 45_000),
    ),
    seed: stringArg(args, "seed", "llm-reasoning-tournament"),
    playerCount: numberArg(args, "players", 6),
    decks: numberArg(args, "decks", 2),
    tricksPerHand: numberArg(args, "tricks-per-hand", 7),
    maxRounds: numberArg(args, "max-rounds", 4),
    matchesPerPairing: numberArg(args, "matches-per-pairing", 2),
    bracketMode: bracketModeArg(stringArg(args, "bracket-mode", "ladder")),
    out: stringArg(args, "out", ""),
  };

  if (config.mode === "api" && !config.apiKey) {
    throw new Error("OPENAI_API_KEY is required for --mode api. Use --mode mock for a no-cost smoke run.");
  }

  const report = await runReasoningTournament(config);
  const out = config.out || defaultOutPath(report);
  await mkdir(dirname(resolve(out)), { recursive: true });
  await writeFile(resolve(out), JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({ out, ...report }, null, 2));
}

async function runReasoningTournament(config: ReasoningTournamentConfig): Promise<ReasoningTournamentReport> {
  validateTournamentShape(config);
  logProgress(config, {
    event: "tournament_start",
    bracketMode: config.bracketMode,
    levels: config.reasoningLevels,
    players: config.playerCount,
    decks: config.decks,
    tricksPerHand: config.tricksPerHand,
    maxRounds: config.maxRounds,
    matchesPerPairing: config.matchesPerPairing,
  });
  const bracket =
    config.bracketMode === "parallel"
      ? await runParallelWinnerBracket(config)
      : await runLadderBracket(config);
  const incumbent =
    bracket.at(-1)?.winner ??
    config.reasoningLevels[0] ??
    normalizeReasoningEffort(DEFAULT_GPT_BRIDGE_REASONING_EFFORT);

  return {
    mode: config.mode,
    seed: config.seed,
    model: config.model,
    strategyId: config.strategy.id,
    strategyCard: formatLlmBridgeStrategyCard(config.strategy),
    reasoningLevels: config.reasoningLevels,
    maxOutputTokens: config.maxOutputTokens,
    maxAttempts: config.maxAttempts,
    requestTimeoutMs: config.requestTimeoutMs,
    playerCount: config.playerCount,
    decks: config.decks,
    tricksPerHand: config.tricksPerHand,
    maxRounds: config.maxRounds,
    matchesPerPairing: config.matchesPerPairing,
    bracketMode: config.bracketMode,
    championReasoning: incumbent,
    bracket,
    note:
      config.mode === "mock"
        ? "Mock mode validates the tournament runner without calling OpenAI. It is not reasoning-strength evidence."
        : undefined,
  };
}

async function runLadderBracket(config: ReasoningTournamentConfig): Promise<PairingReport[]> {
  let incumbent = config.reasoningLevels[0] ?? normalizeReasoningEffort(DEFAULT_GPT_BRIDGE_REASONING_EFFORT);
  const bracket: PairingReport[] = [];

  for (const [index, defender] of config.reasoningLevels.slice(1).entries()) {
    const pairing = await runReasoningPairing(config, incumbent, defender, index, 0);
    bracket.push(pairing);
    incumbent = pairing.winner;
  }

  return bracket;
}

async function runParallelWinnerBracket(config: ReasoningTournamentConfig): Promise<PairingReport[]> {
  let pairingIndex = 0;
  let roundIndex = 0;
  let contenders = [...config.reasoningLevels];
  const bracket: PairingReport[] = [];

  while (contenders.length > 1) {
    logProgress(config, { event: "round_start", roundIndex, contenders });
    const roundPairings: Array<[ReasoningEffort, ReasoningEffort, number]> = [];
    const byes: ReasoningEffort[] = [];

    if (roundIndex === 0) {
      for (let index = 0; index < contenders.length - 1; index += 1) {
        roundPairings.push([contenders[index]!, contenders[index + 1]!, pairingIndex]);
        pairingIndex += 1;
      }
    } else {
      for (let index = 0; index < contenders.length; index += 2) {
        const challenger = contenders[index]!;
        const defender = contenders[index + 1];
        if (!defender) {
          byes.push(challenger);
          continue;
        }
        roundPairings.push([challenger, defender, pairingIndex]);
        pairingIndex += 1;
      }
    }

    const reports = await Promise.all(
      roundPairings.map(([challenger, defender, index]) =>
        runReasoningPairing(config, challenger, defender, index, roundIndex),
      ),
    );
    bracket.push(...reports);
    contenders = uniqueReasoningLevels([...reports.map((report) => report.winner), ...byes]);
    logProgress(config, {
      event: "round_end",
      roundIndex,
      winners: reports.map((report) => ({
        pairingIndex: report.pairingIndex,
        challenger: report.challenger,
        defender: report.defender,
        winner: report.winner,
      })),
      advancing: contenders,
    });
    roundIndex += 1;
  }

  return bracket;
}

async function runReasoningPairing(
  config: ReasoningTournamentConfig,
  challenger: ReasoningEffort,
  defender: ReasoningEffort,
  pairingIndex: number,
  roundIndex: number,
): Promise<PairingReport> {
  logProgress(config, { event: "pairing_start", pairingIndex, roundIndex, challenger, defender });
  const stats = new Map<ReasoningEffort, ReasoningStats>([
    [challenger, emptyStats(challenger)],
    [defender, emptyStats(defender)],
  ]);
  const matches: MatchSummary[] = [];

  for (let matchIndex = 0; matchIndex < config.matchesPerPairing; matchIndex += 1) {
    const seed = `${config.seed}:pair${pairingIndex}:${challenger}-vs-${defender}:m${matchIndex}`;
    const reasoningByPlayer = reasoningSeatAssignment(
      config.playerCount,
      challenger,
      defender,
      seed,
    );
    logProgress(config, {
      event: "match_start",
      pairingIndex,
      roundIndex,
      matchIndex,
      seed,
      challenger,
      defender,
      reasoningByPlayer,
    });
    const result = await runReasoningMatch({
      config,
      seed,
      reasoningByPlayer,
      pairingIndex,
      matchIndex,
    });
    absorbMatch(stats, result.state, result.telemetry);
    matches.push(summarizeMatch(seed, result.state, result.telemetry, challenger, defender));
    logProgress(config, {
      event: "match_end",
      pairingIndex,
      roundIndex,
      matchIndex,
      seed,
      scores: cumulativeScores(result.state),
      groupScores: groupScoreMap(cumulativeScores(result.state), reasoningByPlayer),
    });
  }

  const standings = [...stats.values()].map(toStanding).sort(compareStandings);
  const winner = standings[0]?.reasoningEffort ?? challenger;
  logProgress(config, { event: "pairing_end", pairingIndex, roundIndex, challenger, defender, winner, standings });
  return {
    pairingIndex,
    roundIndex,
    challenger,
    defender,
    winner,
    standings,
    matches,
  };
}

async function runReasoningMatch(args: {
  config: ReasoningTournamentConfig;
  seed: string;
  reasoningByPlayer: ReasoningEffort[];
  pairingIndex: number;
  matchIndex: number;
}): Promise<{ state: GameState; telemetry: MatchTelemetry }> {
  const rng = createSeededRng(args.seed);
  const players = buildTrainingPlayers(args.config.playerCount, ["gpt"]);
  const matchConfig: MatchConfig = {
    players,
    decks: args.config.decks,
    tricksPerHand: args.config.tricksPerHand,
    maxRounds: args.config.maxRounds,
  };
  const fallback = createChampionSnapshotPolicy("reasoning-tournament-fallback-champion");
  const telemetry: MatchTelemetry = {
    reasoningByPlayer: args.reasoningByPlayer,
    decisions: [],
  };

  let state = initialState(matchConfig);
  state = startRound(state, rng.next);
  logProgress(args.config, {
    event: "game_round_start",
    pairingIndex: args.pairingIndex,
    matchIndex: args.matchIndex,
    seed: args.seed,
    round: state.round,
    tricks: state.tricksTotal,
    dealerIdx: state.dealerIdx,
    firstBidderIdx: state.bidTurn,
    leadIdx: state.leadIdx,
    trump: formatCardKey(state.trumpCard),
  });

  while (state.phase !== "match-end") {
    if (state.phase === "dealing" || state.phase === "trump") {
      state = { ...state, phase: "bidding" };
      continue;
    }

    if (state.phase === "bidding") {
      const playerIdx = state.bidTurn;
      const reasoningEffort = args.reasoningByPlayer[playerIdx] ?? args.reasoningByPlayer[0]!;
      const decision = await chooseReasoningBid(args.config, state, playerIdx, reasoningEffort, fallback, rng);
      telemetry.decisions.push({
        playerIdx,
        reasoningEffort,
        kind: "bid",
        ...decision.telemetry,
      });
      state = placeBid(state, playerIdx, decision.bid);
      continue;
    }

    if (state.phase === "playing") {
      const playerIdx = state.turnIdx;
      const reasoningEffort = args.reasoningByPlayer[playerIdx] ?? args.reasoningByPlayer[0]!;
      const decision = await chooseReasoningCard(args.config, state, playerIdx, reasoningEffort, fallback, rng);
      telemetry.decisions.push({
        playerIdx,
        reasoningEffort,
        kind: "card",
        ...decision.telemetry,
      });
      state = playCard(state, playerIdx, decision.card);
      continue;
    }

    if (state.phase === "trick-end") {
      state = settleTrick(state);
      continue;
    }

    if (state.phase === "round-end") {
      logProgress(args.config, {
        event: "game_round_end",
        pairingIndex: args.pairingIndex,
        matchIndex: args.matchIndex,
        seed: args.seed,
        round: state.round,
        cumulativeScores: cumulativeScores(state),
        decisions: telemetry.decisions.length,
      });
      state = nextRound(state, rng.next);
      if (state.phase !== "match-end") {
        logProgress(args.config, {
          event: "game_round_start",
          pairingIndex: args.pairingIndex,
          matchIndex: args.matchIndex,
          seed: args.seed,
          round: state.round,
          tricks: state.tricksTotal,
          dealerIdx: state.dealerIdx,
          firstBidderIdx: state.bidTurn,
          leadIdx: state.leadIdx,
          trump: formatCardKey(state.trumpCard),
        });
      }
      continue;
    }

    throw new Error(`Unsupported reasoning tournament phase ${state.phase}`);
  }

  return { state, telemetry };
}

async function chooseReasoningBid(
  config: ReasoningTournamentConfig,
  state: GameState,
  playerIdx: number,
  reasoningEffort: ReasoningEffort,
  fallback: BotPolicy,
  rng: SeededRng,
): Promise<{ bid: number; telemetry: DecisionTelemetry }> {
  const observation = createObservation(state, playerIdx);
  if (observation.legalBids.length === 1) {
    return {
      bid: observation.legalBids[0]!,
      telemetry: { fallback: false, forced: true, latencyMs: 0 },
    };
  }

  const startedAt = Date.now();
  if (config.mode === "mock") {
    return {
      bid: fallback.bid({ state, playerIdx, rng: rng.fork(`mock-bid:${playerIdx}:${state.round}`) }),
      telemetry: { fallback: true, forced: false, latencyMs: 0, failureReason: "mock_mode" },
    };
  }

  let lastError: unknown = new Error("llm_bid_attempts_exhausted");
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      const output = await callOpenAiDecision(config, observation, reasoningEffort);
      const parsed = parseGptBridgeDecision(output);
      const decision = validateGptBridgeDecision(observation, parsed);
      if (decision.kind !== "bid") throw new Error("llm_returned_card_during_bidding");
      return {
        bid: decision.bid,
        telemetry: { fallback: false, forced: false, latencyMs: Date.now() - startedAt },
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    bid: fallback.bid({ state, playerIdx, rng: rng.fork(`fallback-bid:${playerIdx}:${state.round}`) }),
    telemetry: {
      fallback: true,
      forced: false,
      latencyMs: Date.now() - startedAt,
      failureReason: shortReason(lastError),
    },
  };
}

async function chooseReasoningCard(
  config: ReasoningTournamentConfig,
  state: GameState,
  playerIdx: number,
  reasoningEffort: ReasoningEffort,
  fallback: BotPolicy,
  rng: SeededRng,
): Promise<{ card: Card; telemetry: DecisionTelemetry }> {
  const observation = createObservation(state, playerIdx);
  if (observation.legalCards.length === 1) {
    return {
      card: observation.legalCards[0]!,
      telemetry: { fallback: false, forced: true, latencyMs: 0 },
    };
  }

  const startedAt = Date.now();
  if (config.mode === "mock") {
    return {
      card: fallback.play({
        state,
        playerIdx,
        rng: rng.fork(`mock-card:${playerIdx}:${state.round}:${state.trickIdx}`),
      }),
      telemetry: { fallback: true, forced: false, latencyMs: 0, failureReason: "mock_mode" },
    };
  }

  let lastError: unknown = new Error("llm_card_attempts_exhausted");
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      const output = await callOpenAiDecision(config, observation, reasoningEffort);
      const parsed = parseGptBridgeDecision(output);
      const decision = validateGptBridgeDecision(observation, parsed);
      if (decision.kind !== "card") throw new Error("llm_returned_bid_during_play");
      const card = observation.legalCards.find((candidate) => candidate.key === decision.cardKey);
      if (!card) throw new Error("validated_card_missing");
      return {
        card,
        telemetry: { fallback: false, forced: false, latencyMs: Date.now() - startedAt },
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    card: fallback.play({
      state,
      playerIdx,
      rng: rng.fork(`fallback-card:${playerIdx}:${state.round}:${state.trickIdx}`),
    }),
    telemetry: {
      fallback: true,
      forced: false,
      latencyMs: Date.now() - startedAt,
      failureReason: shortReason(lastError),
    },
  };
}

async function callOpenAiDecision(
  config: ReasoningTournamentConfig,
  observation: ReturnType<typeof createObservation>,
  reasoningEffort: ReasoningEffort,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        input: buildGptBridgeInput(observation, { strategy: config.strategy }),
        reasoning: { effort: reasoningEffort },
        text: { format: buildGptBridgeTextFormat(observation), verbosity: "low" },
        max_output_tokens: config.maxOutputTokens,
        store: false,
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`openai_timeout_${config.requestTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`openai_${response.status}:${shortReason(openAiErrorMessage(payload) ?? response.statusText)}`);
  }
  const text = outputTextFromOpenAiResponse(payload);
  if (!text.trim()) throw new Error("openai_empty_output");
  return text;
}

function absorbMatch(stats: Map<ReasoningEffort, ReasoningStats>, state: GameState, telemetry: MatchTelemetry) {
  const scores = cumulativeScores(state);
  const groupScores = groupScoreMap(scores, telemetry.reasoningByPlayer);
  const groupWinner = groupWinnerFromScores(groupScores);

  for (const reasoningEffort of new Set(telemetry.reasoningByPlayer)) {
    const stat = stats.get(reasoningEffort);
    if (!stat) continue;
    stat.groupMatches += 1;
    stat.groupScoreSum += groupScores[reasoningEffort] ?? 0;
    if (groupWinner === reasoningEffort) stat.groupMatchWins += 1;
  }

  for (const [playerIdx, reasoningEffort] of telemetry.reasoningByPlayer.entries()) {
    const stat = stats.get(reasoningEffort);
    if (!stat) continue;
    const score = scores[playerIdx] ?? 0;
    stat.seatMatches += 1;
    stat.scoreSum += score;
    stat.rankSum += 1 + scores.filter((other) => other > score).length;
    if (scores.every((other) => score >= other)) stat.seatWins += 1;
  }

  for (const round of state.history) {
    for (const [playerIdx, reasoningEffort] of telemetry.reasoningByPlayer.entries()) {
      const stat = stats.get(reasoningEffort);
      if (!stat) continue;
      const bid = round.bids[playerIdx] ?? 0;
      const won = round.won[playerIdx] ?? 0;
      stat.rounds += 1;
      stat.bidTotal += bid;
      stat.wonTotal += won;
      if (bid === won) stat.exactRounds += 1;
      if (won > bid) stat.underbidRounds += 1;
      if (bid > won) stat.overbidRounds += 1;
      if (won - bid >= 2) stat.severeUnderbidRounds += 1;
      if (bid - won >= 2) stat.severeOverbidRounds += 1;
    }
  }

  for (const decision of telemetry.decisions) {
    const stat = stats.get(decision.reasoningEffort);
    if (!stat) continue;
    stat.decisionCount += 1;
    stat.latencyTotalMs += decision.latencyMs;
    if (decision.forced) stat.forcedDecisionCount += 1;
    if (decision.fallback) {
      stat.fallbackCount += 1;
      const reason = decision.failureReason ?? "unknown";
      stat.failureReasons[reason] = (stat.failureReasons[reason] ?? 0) + 1;
    }
  }
}

function summarizeMatch(
  seed: string,
  state: GameState,
  telemetry: MatchTelemetry,
  challenger: ReasoningEffort,
  defender: ReasoningEffort,
): MatchSummary {
  const scores = cumulativeScores(state);
  const groupScores = groupScoreMap(scores, telemetry.reasoningByPlayer);
  const winner = groupWinnerFromScores(groupScores);
  return {
    seed,
    reasoningBySeat: telemetry.reasoningByPlayer,
    rounds: state.history.map((round) => ({
      round: round.round,
      tricks: round.won.reduce((sum, won) => sum + won, 0),
      dealerIdx: round.dealerIdx,
      firstBidderIdx: round.dealerIdx,
      leadIdx: (round.dealerIdx + 1) % telemetry.reasoningByPlayer.length,
      trump: formatCardKey(round.trump),
      bids: round.bids,
      won: round.won,
    })),
    cumulativeScores: scores,
    groupScores: {
      [challenger]: groupScores[challenger] ?? 0,
      [defender]: groupScores[defender] ?? 0,
    },
    winnerReasoning: winner,
  };
}

function formatCardKey(card: Card | null) {
  return card ? `${card.r}${card.s.toUpperCase()}d${card.d + 1}` : "none";
}

function logProgress(config: ReasoningTournamentConfig, payload: Record<string, unknown>) {
  if (config.mode === "mock") return;
  console.error(JSON.stringify({ ts: new Date().toISOString(), ...payload }));
}

function groupScoreMap(scores: readonly number[], reasoningByPlayer: readonly ReasoningEffort[]) {
  const groupScores: Partial<Record<ReasoningEffort, number>> = {};
  for (const [playerIdx, reasoningEffort] of reasoningByPlayer.entries()) {
    groupScores[reasoningEffort] = (groupScores[reasoningEffort] ?? 0) + (scores[playerIdx] ?? 0);
  }
  return groupScores;
}

function groupWinnerFromScores(groupScores: Partial<Record<ReasoningEffort, number>>) {
  const entries = Object.entries(groupScores) as Array<[ReasoningEffort, number]>;
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  if (sorted.length < 2) return sorted[0]?.[0] ?? "tie";
  return sorted[0]![1] === sorted[1]![1] ? "tie" : sorted[0]![0];
}

function emptyStats(reasoningEffort: ReasoningEffort): ReasoningStats {
  return {
    reasoningEffort,
    groupMatches: 0,
    groupMatchWins: 0,
    groupScoreSum: 0,
    seatMatches: 0,
    seatWins: 0,
    rankSum: 0,
    scoreSum: 0,
    rounds: 0,
    exactRounds: 0,
    underbidRounds: 0,
    overbidRounds: 0,
    severeUnderbidRounds: 0,
    severeOverbidRounds: 0,
    bidTotal: 0,
    wonTotal: 0,
    decisionCount: 0,
    forcedDecisionCount: 0,
    fallbackCount: 0,
    latencyTotalMs: 0,
    failureReasons: {},
  };
}

function toStanding(stat: ReasoningStats): ReasoningStanding {
  return {
    reasoningEffort: stat.reasoningEffort,
    groupMatches: stat.groupMatches,
    groupWinRate: ratio(stat.groupMatchWins, stat.groupMatches),
    averageGroupScore: stat.groupMatches ? stat.groupScoreSum / stat.groupMatches : 0,
    seatMatches: stat.seatMatches,
    seatWinRate: ratio(stat.seatWins, stat.seatMatches),
    averageRank: stat.seatMatches ? stat.rankSum / stat.seatMatches : Number.POSITIVE_INFINITY,
    averageSeatScore: stat.seatMatches ? stat.scoreSum / stat.seatMatches : 0,
    exactRate: ratio(stat.exactRounds, stat.rounds),
    underbidRate: ratio(stat.underbidRounds, stat.rounds),
    overbidRate: ratio(stat.overbidRounds, stat.rounds),
    severeUnderbidRate: ratio(stat.severeUnderbidRounds, stat.rounds),
    severeOverbidRate: ratio(stat.severeOverbidRounds, stat.rounds),
    averageBid: stat.rounds ? stat.bidTotal / stat.rounds : 0,
    averageWon: stat.rounds ? stat.wonTotal / stat.rounds : 0,
    decisionCount: stat.decisionCount,
    forcedDecisionRate: ratio(stat.forcedDecisionCount, stat.decisionCount),
    fallbackRate: ratio(stat.fallbackCount, stat.decisionCount),
    averageLatencyMs: stat.decisionCount ? stat.latencyTotalMs / stat.decisionCount : 0,
    failureReasons: stat.failureReasons,
  };
}

function compareStandings(a: ReasoningStanding, b: ReasoningStanding) {
  return (
    b.groupWinRate - a.groupWinRate ||
    b.averageGroupScore - a.averageGroupScore ||
    b.seatWinRate - a.seatWinRate ||
    a.averageRank - b.averageRank ||
    b.averageSeatScore - a.averageSeatScore ||
    b.exactRate - a.exactRate ||
    a.severeUnderbidRate + a.severeOverbidRate - (b.severeUnderbidRate + b.severeOverbidRate) ||
    a.fallbackRate - b.fallbackRate ||
    a.averageLatencyMs - b.averageLatencyMs ||
    a.reasoningEffort.localeCompare(b.reasoningEffort)
  );
}

function reasoningSeatAssignment(
  playerCount: number,
  challenger: ReasoningEffort,
  defender: ReasoningEffort,
  seed: string,
): ReasoningEffort[] {
  if (playerCount !== 6) {
    throw new Error(`Reasoning tournament currently expects exactly 6 players, got ${playerCount}`);
  }
  const rng = createSeededRng(`${seed}:reasoning-seats`);
  const seats = Array.from({ length: playerCount }, (_, seat) => seat);
  for (let index = seats.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng.next() * (index + 1));
    [seats[index], seats[swapIndex]] = [seats[swapIndex]!, seats[index]!];
  }
  const challengerSeats = new Set(seats.slice(0, playerCount / 2));
  return Array.from({ length: playerCount }, (_, seat) => (challengerSeats.has(seat) ? challenger : defender));
}

function validateTournamentShape(config: ReasoningTournamentConfig) {
  if (config.playerCount !== 6) {
    throw new Error(`--players must be 6 for 3-vs-3 reasoning groups, got ${config.playerCount}`);
  }
  const maximum = maxTricks(config.playerCount, config.decks);
  if (!Number.isInteger(config.decks) || config.decks < 1 || config.decks > 2) {
    throw new Error(`--decks must be 1 or 2, got ${config.decks}`);
  }
  if (!Number.isInteger(config.tricksPerHand) || config.tricksPerHand < 1 || config.tricksPerHand > maximum) {
    throw new Error(`--tricks-per-hand must be 1..${maximum} for ${config.playerCount} players/${config.decks} decks`);
  }
  if (!Number.isInteger(config.maxRounds) || config.maxRounds < 1 || config.maxRounds > config.tricksPerHand) {
    throw new Error(`--max-rounds must be 1..${config.tricksPerHand}, got ${config.maxRounds}`);
  }
  if (!Number.isInteger(config.matchesPerPairing) || config.matchesPerPairing < 1) {
    throw new Error(`--matches-per-pairing must be a positive integer, got ${config.matchesPerPairing}`);
  }
  if (!Number.isFinite(config.requestTimeoutMs) || config.requestTimeoutMs < 1_000) {
    throw new Error(`--request-timeout-ms must be at least 1000, got ${config.requestTimeoutMs}`);
  }
  if (config.reasoningLevels.length < 2) {
    throw new Error("--levels must include at least two reasoning levels");
  }
}

function reasoningLevelsArg(value: string): ReasoningEffort[] {
  const levels = value.split(",").map((part) => normalizeReasoningEffort(part.trim()));
  return uniqueReasoningLevels(levels);
}

function uniqueReasoningLevels(levels: ReasoningEffort[]): ReasoningEffort[] {
  const seen = new Set<ReasoningEffort>();
  return levels.filter((level) => {
    if (seen.has(level)) return false;
    seen.add(level);
    return true;
  });
}

function normalizeReasoningEffort(value: string): ReasoningEffort {
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (normalized === "extra-high" || normalized === "x-high") return "xhigh";
  if (
    normalized === "none" ||
    normalized === "minimal" ||
    normalized === "low" ||
    normalized === "medium" ||
    normalized === "high" ||
    normalized === "xhigh"
  ) {
    return normalized;
  }
  throw new Error(`Unsupported reasoning effort ${value}. Use none, minimal, low, medium, high, or xhigh.`);
}

function modeArg(value: string): TournamentMode {
  if (value === "api" || value === "mock") return value;
  throw new Error(`--mode must be api or mock, got ${value}`);
}

function bracketModeArg(value: string): BracketMode {
  if (value === "ladder" || value === "parallel") return value;
  throw new Error(`--bracket-mode must be ladder or parallel, got ${value}`);
}

function defaultOutPath(report: ReasoningTournamentReport) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `reports/llm-reasoning-tournament/${stamp}-${report.mode}-${report.championReasoning}.json`;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function outputTextFromOpenAiResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string") return direct;
  const parts: string[] = [];
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const piece of content) {
      if (!piece || typeof piece !== "object") continue;
      const text = (piece as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("");
}

function openAiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : null;
}

function shortReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 180);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
