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
  LLM_BRIDGE_STRATEGY_CARDS,
  formatLlmBridgeStrategyCard,
  getLlmBridgeStrategyCard,
  type LlmBridgeStrategyCard,
} from "../src/lib/ai/llmStrategyCards";
import { buildTrainingPlayers } from "../src/lib/ai/headless";
import { createChampionSnapshotPolicy, type BotPolicy } from "../src/lib/ai/policies";
import { createSeededRng, type SeededRng } from "../src/lib/ai/rng";
import { numberArg, parseArgs, stringArg } from "./ai-cli";

type ArenaMode = "api" | "mock";

interface LlmArenaConfig {
  mode: ArenaMode;
  apiKey?: string;
  model: string;
  reasoningEffort: string;
  maxOutputTokens: number;
  maxAttempts: number;
  requestTimeoutMs: number;
  seed: string;
  playerCounts: number[];
  decks: number;
  tricksPerHand: number;
  maxRounds: number;
  matchesPerConfig: number;
  balancedSeats: boolean;
  candidates: LlmBridgeStrategyCard[];
  out: string;
  reflect: boolean;
}

interface LlmDecisionTelemetry {
  fallback: boolean;
  latencyMs: number;
  failureReason?: string;
}

interface MatchTelemetry {
  strategyByPlayer: string[];
  decisions: Array<{
    playerIdx: number;
    strategyId: string;
    kind: "bid" | "card";
    fallback: boolean;
    latencyMs: number;
    failureReason?: string;
  }>;
}

interface StrategyStats {
  strategyId: string;
  title: string;
  seatMatches: number;
  matchWins: number;
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
  fallbackCount: number;
  latencyTotalMs: number;
  failureReasons: Record<string, number>;
}

interface StrategyStanding {
  strategyId: string;
  title: string;
  seatMatches: number;
  winRate: number;
  averageRank: number;
  averageScore: number;
  exactRate: number;
  underbidRate: number;
  overbidRate: number;
  severeUnderbidRate: number;
  severeOverbidRate: number;
  averageBid: number;
  averageWon: number;
  fallbackRate: number;
  averageLatencyMs: number;
  failureReasons: Record<string, number>;
}

interface ArenaReport {
  mode: ArenaMode;
  seed: string;
  model: string;
  reasoningEffort: string;
  maxOutputTokens: number;
  maxAttempts: number;
  requestTimeoutMs: number;
  playerCounts: number[];
  decks: number;
  tricksPerHand: number;
  maxRounds: number;
  requestedMatchesPerConfig: number;
  matchesPerConfig: number;
  balancedSeats: boolean;
  effectiveMatchesByPlayerCount: Record<string, number>;
  candidates: Array<{ id: string; title: string; card: string }>;
  recommendedStrategyId: string;
  standings: StrategyStanding[];
  coachReflection?: string;
  note?: string;
}

async function main() {
  const args = parseArgs();
  const apiKey = process.env.OPENAI_API_KEY;
  const mode = modeArg(stringArg(args, "mode", apiKey ? "api" : "mock"));
  const config: LlmArenaConfig = {
    mode,
    apiKey,
    model: stringArg(args, "model", process.env.OPENAI_GERMAN_BRIDGE_MODEL ?? DEFAULT_GPT_BRIDGE_MODEL),
    reasoningEffort: stringArg(
      args,
      "reasoning",
      process.env.OPENAI_GERMAN_BRIDGE_REASONING_EFFORT ?? DEFAULT_GPT_BRIDGE_REASONING_EFFORT,
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
    seed: stringArg(args, "seed", "llm-strategy-arena"),
    playerCounts: playerCountsArg(stringArg(args, "players", "4,5,6")),
    decks: numberArg(args, "decks", 2),
    tricksPerHand: numberArg(args, "tricks-per-hand", 4),
    maxRounds: numberArg(args, "max-rounds", 4),
    matchesPerConfig: numberArg(args, "matches-per-config", 1),
    balancedSeats: Boolean(args["balanced-seats"]),
    candidates: strategyCandidates(stringArg(args, "candidates", "all")),
    out: stringArg(args, "out", ""),
    reflect: Boolean(args.reflect),
  };

  if (config.mode === "api" && !config.apiKey) {
    throw new Error("OPENAI_API_KEY is required for --mode api. Use --mode mock for a no-cost smoke run.");
  }

  const report = await runLlmStrategyArena(config);
  const out = config.out || defaultOutPath(report);
  await mkdir(dirname(resolve(out)), { recursive: true });
  await writeFile(resolve(out), JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({ out, ...report }, null, 2));
}

async function runLlmStrategyArena(config: LlmArenaConfig): Promise<ArenaReport> {
  validateRequestTimeout(config.requestTimeoutMs);
  const stats = new Map<string, StrategyStats>();
  const effectiveMatchesByPlayerCount: Record<string, number> = {};
  for (const candidate of config.candidates) {
    stats.set(candidate.id, emptyStats(candidate));
  }

  let configIndex = 0;
  for (const playerCount of config.playerCounts) {
    validateMatchShape(playerCount, config.decks, config.tricksPerHand, config.maxRounds);
    const matchesForPlayerCount = config.balancedSeats
      ? balancedMatchCount(playerCount, config.candidates.length, config.matchesPerConfig)
      : config.matchesPerConfig;
    effectiveMatchesByPlayerCount[String(playerCount)] = matchesForPlayerCount;
    for (let match = 0; match < matchesForPlayerCount; match += 1) {
      const seed = `${config.seed}:p${playerCount}:m${match}`;
      const strategyByPlayer = strategyRotation(
        config.candidates,
        playerCount,
        match,
        configIndex,
      );
      const result = await runLlmStrategyMatch({
        config,
        seed,
        playerCount,
        strategyByPlayer,
      });
      absorbMatch(stats, result.state, result.telemetry);
    }
    configIndex += 1;
  }

  const standings = [...stats.values()].map(toStanding).sort(compareStandings);
  const report: ArenaReport = {
    mode: config.mode,
    seed: config.seed,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    maxOutputTokens: config.maxOutputTokens,
    maxAttempts: config.maxAttempts,
    requestTimeoutMs: config.requestTimeoutMs,
    playerCounts: config.playerCounts,
    decks: config.decks,
    tricksPerHand: config.tricksPerHand,
    maxRounds: config.maxRounds,
    requestedMatchesPerConfig: config.matchesPerConfig,
    matchesPerConfig: config.matchesPerConfig,
    balancedSeats: config.balancedSeats,
    effectiveMatchesByPlayerCount,
    candidates: config.candidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      card: formatLlmBridgeStrategyCard(candidate),
    })),
    recommendedStrategyId: standings[0]?.strategyId ?? DEFAULT_LLM_BRIDGE_STRATEGY_ID,
    standings,
    note:
      config.mode === "mock"
        ? "Mock mode validates the arena runner without calling OpenAI. It is not promotion evidence."
        : undefined,
  };

  if (config.reflect && config.mode === "api") {
    report.coachReflection = await reflectOnArena(config, report);
  }

  return report;
}

async function runLlmStrategyMatch(args: {
  config: LlmArenaConfig;
  seed: string;
  playerCount: number;
  strategyByPlayer: LlmBridgeStrategyCard[];
}): Promise<{ state: GameState; telemetry: MatchTelemetry }> {
  const rng = createSeededRng(args.seed);
  const players = buildTrainingPlayers(args.playerCount, ["gpt"]);
  const matchConfig: MatchConfig = {
    players,
    decks: args.config.decks,
    tricksPerHand: args.config.tricksPerHand,
    maxRounds: args.config.maxRounds,
  };
  const fallback = createChampionSnapshotPolicy("llm-arena-fallback-champion");
  const telemetry: MatchTelemetry = {
    strategyByPlayer: args.strategyByPlayer.map((strategy) => strategy.id),
    decisions: [],
  };

  let state = initialState(matchConfig);
  state = startRound(state, rng.next);

  while (state.phase !== "match-end") {
    if (state.phase === "dealing" || state.phase === "trump") {
      state = { ...state, phase: "bidding" };
      continue;
    }

    if (state.phase === "bidding") {
      const playerIdx = state.bidTurn;
      const strategy = args.strategyByPlayer[playerIdx] ?? getLlmBridgeStrategyCard();
      const decision = await chooseLlmBid(args.config, state, playerIdx, strategy, fallback, rng);
      telemetry.decisions.push({
        playerIdx,
        strategyId: strategy.id,
        kind: "bid",
        ...decision.telemetry,
      });
      state = placeBid(state, playerIdx, decision.bid);
      continue;
    }

    if (state.phase === "playing") {
      const playerIdx = state.turnIdx;
      const strategy = args.strategyByPlayer[playerIdx] ?? getLlmBridgeStrategyCard();
      const decision = await chooseLlmCard(args.config, state, playerIdx, strategy, fallback, rng);
      telemetry.decisions.push({
        playerIdx,
        strategyId: strategy.id,
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
      state = nextRound(state, rng.next);
      continue;
    }

    throw new Error(`Unsupported LLM arena phase ${state.phase}`);
  }

  return { state, telemetry };
}

async function chooseLlmBid(
  config: LlmArenaConfig,
  state: GameState,
  playerIdx: number,
  strategy: LlmBridgeStrategyCard,
  fallback: BotPolicy,
  rng: SeededRng,
): Promise<{ bid: number; telemetry: LlmDecisionTelemetry }> {
  const observation = createObservation(state, playerIdx);
  const startedAt = Date.now();
  if (config.mode === "mock") {
    return {
      bid: fallback.bid({ state, playerIdx, rng: rng.fork(`mock-bid:${playerIdx}:${state.round}`) }),
      telemetry: { fallback: true, latencyMs: 0, failureReason: "mock_mode" },
    };
  }

  let lastError: unknown = new Error("llm_bid_attempts_exhausted");
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      const output = await callOpenAiDecision(config, observation, strategy);
      const parsed = parseGptBridgeDecision(output);
      const decision = validateGptBridgeDecision(observation, parsed);
      if (decision.kind !== "bid") throw new Error("llm_returned_card_during_bidding");
      return {
        bid: decision.bid,
        telemetry: { fallback: false, latencyMs: Date.now() - startedAt },
      };
    } catch (error) {
      lastError = error;
    }
  }
  return {
    bid: fallback.bid({ state, playerIdx, rng: rng.fork(`fallback-bid:${playerIdx}:${state.round}`) }),
    telemetry: {
      fallback: true,
      latencyMs: Date.now() - startedAt,
      failureReason: shortReason(lastError),
    },
  };
}

async function chooseLlmCard(
  config: LlmArenaConfig,
  state: GameState,
  playerIdx: number,
  strategy: LlmBridgeStrategyCard,
  fallback: BotPolicy,
  rng: SeededRng,
): Promise<{ card: Card; telemetry: LlmDecisionTelemetry }> {
  const observation = createObservation(state, playerIdx);
  const startedAt = Date.now();
  if (config.mode === "mock") {
    return {
      card: fallback.play({ state, playerIdx, rng: rng.fork(`mock-card:${playerIdx}:${state.round}:${state.trickIdx}`) }),
      telemetry: { fallback: true, latencyMs: 0, failureReason: "mock_mode" },
    };
  }

  let lastError: unknown = new Error("llm_card_attempts_exhausted");
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      const output = await callOpenAiDecision(config, observation, strategy);
      const parsed = parseGptBridgeDecision(output);
      const decision = validateGptBridgeDecision(observation, parsed);
      if (decision.kind !== "card") throw new Error("llm_returned_bid_during_play");
      const card = observation.legalCards.find((candidate) => candidate.key === decision.cardKey);
      if (!card) throw new Error("validated_card_missing");
      return {
        card,
        telemetry: { fallback: false, latencyMs: Date.now() - startedAt },
      };
    } catch (error) {
      lastError = error;
    }
  }
  return {
    card: fallback.play({ state, playerIdx, rng: rng.fork(`fallback-card:${playerIdx}:${state.round}:${state.trickIdx}`) }),
    telemetry: {
      fallback: true,
      latencyMs: Date.now() - startedAt,
      failureReason: shortReason(lastError),
    },
  };
}

async function callOpenAiDecision(
  config: LlmArenaConfig,
  observation: ReturnType<typeof createObservation>,
  strategy: LlmBridgeStrategyCard,
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
        input: buildGptBridgeInput(observation, { strategy }),
        reasoning: { effort: config.reasoningEffort },
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

async function reflectOnArena(config: LlmArenaConfig, report: ArenaReport): Promise<string> {
  const prompt = [
    "You are the high-level German Bridge coach for an LLM bot arena.",
    "Review the standings and produce concise next-step strategy feedback.",
    "Focus on why the top strategy likely won, what failure mode to test next, and one compact candidate strategy mutation.",
    "Do not praise. Do not output JSON.",
    JSON.stringify({
      recommendedStrategyId: report.recommendedStrategyId,
      standings: report.standings,
    }),
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_GERMAN_BRIDGE_COACH_MODEL ?? config.model,
      input: [{ role: "user", content: prompt }],
      reasoning: { effort: process.env.OPENAI_GERMAN_BRIDGE_COACH_REASONING_EFFORT ?? "high" },
      text: { format: { type: "text" }, verbosity: "low" },
      max_output_tokens: 900,
      store: false,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    return `coach_reflection_failed:${shortReason(openAiErrorMessage(payload) ?? response.statusText)}`;
  }
  return outputTextFromOpenAiResponse(payload).trim();
}

function absorbMatch(stats: Map<string, StrategyStats>, state: GameState, telemetry: MatchTelemetry) {
  const scores = cumulativeScores(state);
  for (const [playerIdx, strategyId] of telemetry.strategyByPlayer.entries()) {
    const stat = stats.get(strategyId);
    if (!stat) continue;
    const score = scores[playerIdx] ?? 0;
    stat.seatMatches += 1;
    stat.scoreSum += score;
    stat.rankSum += 1 + scores.filter((other) => other > score).length;
    if (scores.every((other) => score >= other)) stat.matchWins += 1;
  }

  for (const round of state.history) {
    for (const [playerIdx, strategyId] of telemetry.strategyByPlayer.entries()) {
      const stat = stats.get(strategyId);
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
    const stat = stats.get(decision.strategyId);
    if (!stat) continue;
    stat.decisionCount += 1;
    stat.latencyTotalMs += decision.latencyMs;
    if (decision.fallback) {
      stat.fallbackCount += 1;
      const reason = decision.failureReason ?? "unknown";
      stat.failureReasons[reason] = (stat.failureReasons[reason] ?? 0) + 1;
    }
  }
}

function emptyStats(strategy: LlmBridgeStrategyCard): StrategyStats {
  return {
    strategyId: strategy.id,
    title: strategy.title,
    seatMatches: 0,
    matchWins: 0,
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
    fallbackCount: 0,
    latencyTotalMs: 0,
    failureReasons: {},
  };
}

function toStanding(stat: StrategyStats): StrategyStanding {
  return {
    strategyId: stat.strategyId,
    title: stat.title,
    seatMatches: stat.seatMatches,
    winRate: ratio(stat.matchWins, stat.seatMatches),
    averageRank: stat.seatMatches ? stat.rankSum / stat.seatMatches : Number.POSITIVE_INFINITY,
    averageScore: stat.seatMatches ? stat.scoreSum / stat.seatMatches : 0,
    exactRate: ratio(stat.exactRounds, stat.rounds),
    underbidRate: ratio(stat.underbidRounds, stat.rounds),
    overbidRate: ratio(stat.overbidRounds, stat.rounds),
    severeUnderbidRate: ratio(stat.severeUnderbidRounds, stat.rounds),
    severeOverbidRate: ratio(stat.severeOverbidRounds, stat.rounds),
    averageBid: stat.rounds ? stat.bidTotal / stat.rounds : 0,
    averageWon: stat.rounds ? stat.wonTotal / stat.rounds : 0,
    fallbackRate: ratio(stat.fallbackCount, stat.decisionCount),
    averageLatencyMs: stat.decisionCount ? stat.latencyTotalMs / stat.decisionCount : 0,
    failureReasons: stat.failureReasons,
  };
}

function compareStandings(a: StrategyStanding, b: StrategyStanding) {
  return (
    b.winRate - a.winRate ||
    a.averageRank - b.averageRank ||
    b.averageScore - a.averageScore ||
    b.exactRate - a.exactRate ||
    a.severeUnderbidRate + a.severeOverbidRate - (b.severeUnderbidRate + b.severeOverbidRate) ||
    a.fallbackRate - b.fallbackRate ||
    a.strategyId.localeCompare(b.strategyId)
  );
}

function strategyRotation(
  candidates: readonly LlmBridgeStrategyCard[],
  playerCount: number,
  match: number,
  offset: number,
): LlmBridgeStrategyCard[] {
  return Array.from(
    { length: playerCount },
    (_, seat) => candidates[(match * playerCount + seat + offset) % candidates.length],
  );
}

function balancedMatchCount(playerCount: number, candidateCount: number, requestedMatches: number) {
  let matches = Math.max(1, requestedMatches);
  while ((matches * playerCount) % candidateCount !== 0) matches += 1;
  return matches;
}

function strategyCandidates(value: string): LlmBridgeStrategyCard[] {
  if (value === "all") return [...LLM_BRIDGE_STRATEGY_CARDS];
  const candidates = value.split(",").map((id) => getLlmBridgeStrategyCard(id.trim()));
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

function playerCountsArg(value: string): number[] {
  const parsed = value.split(",").map((part) => Number(part.trim()));
  if (!parsed.length || parsed.some((count) => !Number.isInteger(count) || count < 4 || count > 12)) {
    throw new Error(`--players must be a comma-separated list of integers from 4 to 12, got ${value}`);
  }
  return [...new Set(parsed)].sort((a, b) => a - b);
}

function modeArg(value: string): ArenaMode {
  if (value === "api" || value === "mock") return value;
  throw new Error(`--mode must be api or mock, got ${value}`);
}

function validateMatchShape(playerCount: number, decks: number, tricksPerHand: number, maxRounds: number) {
  const maximum = maxTricks(playerCount, decks);
  if (!Number.isInteger(decks) || decks < 1 || decks > 2) {
    throw new Error(`--decks must be 1 or 2, got ${decks}`);
  }
  if (!Number.isInteger(tricksPerHand) || tricksPerHand < 1 || tricksPerHand > maximum) {
    throw new Error(`--tricks-per-hand must be 1..${maximum} for ${playerCount} players/${decks} decks`);
  }
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > tricksPerHand) {
    throw new Error(`--max-rounds must be 1..${tricksPerHand}, got ${maxRounds}`);
  }
}

function validateRequestTimeout(timeoutMs: number) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000) {
    throw new Error(`--request-timeout-ms must be at least 1000, got ${timeoutMs}`);
  }
}

function defaultOutPath(report: ArenaReport) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `reports/llm-strategy-arena/${stamp}-${report.mode}-${report.recommendedStrategyId}.json`;
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
