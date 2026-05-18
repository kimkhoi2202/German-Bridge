import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { placeBid as applyPlaceBid, playCard as applyPlayCard, settleTrick, type GameState } from "../src/lib/game";
import type { BotDecisionTrace } from "../src/lib/bot";
import { createObservation } from "../src/lib/botObservation";
import {
  DEFAULT_GPT_BRIDGE_MODEL,
  DEFAULT_GPT_BRIDGE_REASONING_EFFORT,
  buildGptBridgeInput,
  buildGptBridgeTextFormat,
  gptBridgeDecisionToTrace,
  parseGptBridgeDecision,
  validateGptBridgeDecision,
  type GptBridgeDecision,
} from "../src/lib/ai/gptBridgeBot";
import {
  customLlmBridgeStrategyCard,
  getLlmBridgeStrategyCard,
} from "../src/lib/ai/llmStrategyCards";
import {
  appendAiDecisionTrace,
  appendEvent,
  getGameOrThrow,
  getParticipantForUser,
  getParticipants,
  getStateOrThrow,
  requireParticipant,
  writeGameState,
} from "./lib/db";
import {
  applyBotTurn,
  finalScores,
  findCardInSeatHand,
  finishRoundOrMatch,
  isBotTurn,
  isGptBotTurn,
  legalBidValues,
  legalCardKeys,
  localSeatToCanonical,
  rngFromSeed,
  redactedStateForViewer,
  type BotTurnTrace,
} from "./lib/gameEngine";
import { requireUserId } from "./lib/users";
import { internal } from "./_generated/api";

const DEFAULT_GPT_BRIDGE_MAX_OUTPUT_TOKENS = 512;
const DEFAULT_GPT_BRIDGE_MAX_ATTEMPTS = 3;
const DEFAULT_GPT_BRIDGE_RETRY_DELAY_MS = 1800;

const gptDecisionValidator = v.union(
  v.object({
    kind: v.literal("bid"),
    bid: v.number(),
    confidence: v.number(),
    reasoning_summary: v.string(),
  }),
  v.object({
    kind: v.literal("card"),
    cardKey: v.string(),
    confidence: v.number(),
    reasoning_summary: v.string(),
  }),
  v.null(),
);

function winnerSeat(scores: number[]) {
  return scores.reduce((best, score, index, arr) => (score > arr[best] ? index : best), 0);
}

function envInteger(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envBoolean(name: string, fallback: boolean) {
  const value = process.env[name];
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function shortFailureReason(reason: unknown) {
  const raw = reason instanceof Error ? reason.message : String(reason);
  return raw.replace(/\s+/g, " ").trim().slice(0, 240) || "gpt_decision_failed";
}

function outputTextFromOpenAiResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as { output_text?: unknown; output?: unknown };
  if (typeof root.output_text === "string" && root.output_text.trim()) {
    return root.output_text;
  }

  const parts: string[] = [];
  if (Array.isArray(root.output)) {
    for (const item of root.output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const piece of content) {
        if (!piece || typeof piece !== "object") continue;
        const text = (piece as { text?: unknown }).text;
        if (typeof text === "string") parts.push(text);
      }
    }
  }
  return parts.join("");
}

function requestIdFromOpenAiResponse(payload: unknown, headerRequestId: string | null) {
  if (headerRequestId) return headerRequestId;
  if (!payload || typeof payload !== "object") return null;
  const requestId = (payload as { request_id?: unknown; id?: unknown }).request_id;
  if (typeof requestId === "string") return requestId;
  const id = (payload as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function withGptFallbackTrace(
  trace: BotDecisionTrace,
  args: {
    model: string;
    reasoningEffort: string;
    strategyId?: string;
    fallbackReason: string;
    requestId?: string;
    latencyMs?: number;
  },
): BotDecisionTrace {
  return {
    ...trace,
    fallback: true,
    fallbackReason: args.fallbackReason,
    requestedPolicyId: `openai:${args.model}`,
    heuristic: {
      ...(trace.heuristic ?? {}),
      openAiModel: args.model,
      reasoningEffort: args.reasoningEffort,
      strategyId: args.strategyId ?? null,
      requestId: args.requestId ?? null,
      latencyMs: args.latencyMs ?? null,
    },
  };
}

function withBotEventPayload(payload: unknown, extra: Record<string, boolean>) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return { ...payload, ...extra };
  }
  return extra;
}

async function updateStatsForCompletedGame(
  ctx: MutationCtx,
  game: Doc<"games">,
  state: GameState,
) {
  const participants = await getParticipants(ctx, game._id);
  const scores = finalScores(state);
  const winnerIdx = winnerSeat(scores);
  for (const participant of participants) {
    const participantUserId = participant.userId;
    if (participant.kind !== "human" || participantUserId === undefined) continue;
    const existing = await ctx.db
      .query("userStats")
      .withIndex("by_userId", (q) => q.eq("userId", participantUserId))
      .unique();
    const score = scores[participant.seatIdx] ?? 0;
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        gamesPlayed: existing.gamesPlayed + 1,
        gamesWon: existing.gamesWon + (participant.seatIdx === winnerIdx ? 1 : 0),
        totalScore: existing.totalScore + score,
        bestScore: Math.max(existing.bestScore, score),
        lastCompletedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userStats", {
        userId: participantUserId,
        gamesPlayed: 1,
        gamesWon: participant.seatIdx === winnerIdx ? 1 : 0,
        totalScore: score,
        bestScore: score,
        lastCompletedAt: now,
        updatedAt: now,
      });
    }
  }
  return winnerIdx;
}

async function completeIfNeeded(ctx: MutationCtx, game: Doc<"games">, state: GameState) {
  if (state.phase !== "match-end") return game.sequence;
  const winnerIdx = await updateStatsForCompletedGame(ctx, game, state);
  return await appendEvent(ctx, game, {
    type: "game_completed",
    payload: { scores: finalScores(state), winnerSeatIdx: winnerIdx },
    patch: {
      status: "completed",
      finishedAt: Date.now(),
      winnerSeatIdx: winnerIdx,
    },
  });
}

async function scheduleNext(ctx: MutationCtx, gameId: Id<"games">, state: GameState, sequence: number) {
  if (state.phase === "dealing") {
    await ctx.scheduler.runAfter(900, internal.games.advancePhase, { gameId, expectedSequence: sequence });
    return;
  }
  if (state.phase === "trump" || state.phase === "trick-end") {
    await ctx.scheduler.runAfter(state.phase === "trump" ? 1400 : 1300, internal.games.advancePhase, {
      gameId,
      expectedSequence: sequence,
    });
    return;
  }
  if (isBotTurn(state)) {
    if (isGptBotTurn(state)) {
      await ctx.scheduler.runAfter(850, internal.games.gptBotTurn, {
        gameId,
        expectedSequence: sequence,
        attempt: 1,
      });
      return;
    }
    await ctx.scheduler.runAfter(850, internal.games.botTurn, { gameId, expectedSequence: sequence });
  }
}

export const watch = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const game = await getGameOrThrow(ctx, args.gameId);
    const participant = await requireParticipant(ctx, game._id, userId);
    const participants = await getParticipants(ctx, game._id);
    const stateDoc = await ctx.db
      .query("gameStates")
      .withIndex("by_gameId", (q) => q.eq("gameId", game._id))
      .unique();
    const presence = await ctx.db
      .query("gamePresence")
      .withIndex("by_gameId", (q) => q.eq("gameId", game._id))
      .take(12);

    const state = stateDoc?.state as GameState | undefined;
    return {
      game,
      viewerSeatIdx: participant.seatIdx,
      inviteCode: game.inviteCode,
      participants: participants.sort((a, b) => a.seatIdx - b.seatIdx),
      presence,
      state: state ? redactedStateForViewer(state, participant.seatIdx) : null,
      legalBids: state ? legalBidValues(state, participant.seatIdx) : [],
      legalCardKeys: state ? legalCardKeys(state, participant.seatIdx) : [],
    };
  },
});

export const touchPresence = mutation({
  args: { gameId: v.id("games"), status: v.union(v.literal("online"), v.literal("offline")) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireParticipant(ctx, args.gameId, userId);
    const existing = await ctx.db
      .query("gamePresence")
      .withIndex("by_gameId_and_userId", (q) => q.eq("gameId", args.gameId).eq("userId", userId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { status: args.status, lastSeenAt: now });
      return existing._id;
    }
    return await ctx.db.insert("gamePresence", {
      gameId: args.gameId,
      userId,
      status: args.status,
      lastSeenAt: now,
    });
  },
});

export const placeBid = mutation({
  args: { gameId: v.id("games"), bid: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.status !== "active") throw new Error("Game is not active");
    const participant = await requireParticipant(ctx, game._id, userId);
    let state = await getStateOrThrow(ctx, game._id);
    if (state.phase !== "bidding") throw new Error("Game is not bidding");
    if (state.bidTurn !== participant.seatIdx) throw new Error("It is not your turn");
    if (!legalBidValues(state, participant.seatIdx).includes(Math.trunc(args.bid))) {
      throw new Error("Illegal bid");
    }
    state = applyPlaceBid(state, participant.seatIdx, Math.trunc(args.bid));
    await writeGameState(ctx, game._id, state);
    const sequence = await appendEvent(ctx, game, {
      type: "bid",
      actorUserId: userId,
      seatIdx: participant.seatIdx,
      payload: { bid: Math.trunc(args.bid) },
    });
    await scheduleNext(ctx, game._id, state, sequence);
    return { gameId: game._id, sequence };
  },
});

export const playCard = mutation({
  args: { gameId: v.id("games"), cardKey: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.status !== "active") throw new Error("Game is not active");
    const participant = await requireParticipant(ctx, game._id, userId);
    let state = await getStateOrThrow(ctx, game._id);
    if (state.phase !== "playing") throw new Error("Game is not in play");
    if (state.turnIdx !== participant.seatIdx) throw new Error("It is not your turn");
    if (!legalCardKeys(state, participant.seatIdx).includes(args.cardKey)) {
      throw new Error("Illegal card");
    }
    const card = findCardInSeatHand(state, participant.seatIdx, args.cardKey);
    if (!card) throw new Error("Card not found");
    state = applyPlayCard(state, participant.seatIdx, card);
    await writeGameState(ctx, game._id, state);
    const sequence = await appendEvent(ctx, game, {
      type: "play",
      actorUserId: userId,
      seatIdx: participant.seatIdx,
      payload: { card },
    });
    await scheduleNext(ctx, game._id, state, sequence);
    return { gameId: game._id, sequence };
  },
});

export const advanceRound = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const game = await getGameOrThrow(ctx, args.gameId);
    const participant = await requireParticipant(ctx, game._id, userId);
    if (game.status !== "active") throw new Error("Game is not active");
    let state = await getStateOrThrow(ctx, game._id);
    if (state.phase !== "round-end") throw new Error("Round is not ready to advance");
    state = finishRoundOrMatch(
      state,
      rngFromSeed(`${game._id}:${game.sequence}:round:${state.round + 1}`),
    );
    await writeGameState(ctx, game._id, state);
    const sequence = await appendEvent(ctx, game, {
      type: "round_advanced",
      actorUserId: userId,
      seatIdx: participant.seatIdx,
      payload: { phase: state.phase },
    });
    const freshGame = (await ctx.db.get(game._id))!;
    await completeIfNeeded(ctx, freshGame, state);
    if (state.phase !== "match-end") {
      await scheduleNext(ctx, game._id, state, sequence);
    }
    return { gameId: game._id, sequence };
  },
});

export const nudgeAutoTurn = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const game = await getGameOrThrow(ctx, args.gameId);
    await requireParticipant(ctx, game._id, userId);
    if (game.status !== "active") return { scheduled: false, sequence: game.sequence };

    const state = await getStateOrThrow(ctx, game._id);
    const canAutoAdvance =
      state.phase === "dealing" ||
      state.phase === "trump" ||
      state.phase === "trick-end" ||
      isBotTurn(state);

    if (!canAutoAdvance) return { scheduled: false, sequence: game.sequence };

    await scheduleNext(ctx, game._id, state, game.sequence);
    return { scheduled: true, sequence: game.sequence };
  },
});

export const advancePhase = internalMutation({
  args: { gameId: v.id("games"), expectedSequence: v.number() },
  handler: async (ctx, args) => {
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.status !== "active" || game.sequence !== args.expectedSequence) return null;
    let state = await getStateOrThrow(ctx, game._id);
    let type = "";
    if (state.phase === "dealing") {
      state = { ...state, phase: "trump" };
      type = "trump_revealed";
    } else if (state.phase === "trump") {
      state = { ...state, phase: "bidding" };
      type = "bidding_started";
    } else if (state.phase === "trick-end") {
      state = settleTrick(state);
      type = state.phase === "round-end" ? "round_settled" : "trick_settled";
    } else {
      return null;
    }
    await writeGameState(ctx, game._id, state);
    const sequence = await appendEvent(ctx, game, { type, payload: { phase: state.phase } });
    await scheduleNext(ctx, game._id, state, sequence);
    return { sequence };
  },
});

export const botTurn = internalMutation({
  args: { gameId: v.id("games"), expectedSequence: v.number() },
  handler: async (ctx, args) => {
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.status !== "active" || game.sequence !== args.expectedSequence) return null;
    let state = await getStateOrThrow(ctx, game._id);
    if (!isBotTurn(state)) return null;
    const result = applyBotTurn(state);
    state = result.state;
    await writeGameState(ctx, game._id, state);
    const sequence = await appendEvent(ctx, game, result.event);
    await appendAiDecisionTrace(ctx, {
      gameId: game._id,
      sequence,
      ...result.aiTrace,
    });
    await scheduleNext(ctx, game._id, state, sequence);
    return { sequence };
  },
});

type PendingGptBotTurnResult = { state: GameState } | null;
type ApplyGptBotTurnResult = { sequence: number } | null;

export const pendingGptBotTurn = internalQuery({
  args: { gameId: v.id("games"), expectedSequence: v.number() },
  handler: async (ctx, args): Promise<PendingGptBotTurnResult> => {
    const game = await ctx.db.get(args.gameId);
    if (!game || game.status !== "active" || game.sequence !== args.expectedSequence) {
      return null;
    }
    const stateDoc = await ctx.db
      .query("gameStates")
      .withIndex("by_gameId", (q) => q.eq("gameId", game._id))
      .unique();
    const state = stateDoc?.state as GameState | undefined;
    if (!state || !isGptBotTurn(state)) return null;
    return { state };
  },
});

export const applyGptBotTurn = internalMutation({
  args: {
    gameId: v.id("games"),
    expectedSequence: v.number(),
    model: v.string(),
    reasoningEffort: v.string(),
    strategyId: v.optional(v.string()),
    decision: gptDecisionValidator,
    allowHeuristicFallback: v.optional(v.boolean()),
    requestId: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
    fallbackReason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ApplyGptBotTurnResult> => {
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.status !== "active" || game.sequence !== args.expectedSequence) return null;
    let state = await getStateOrThrow(ctx, game._id);
    if (!isGptBotTurn(state)) return null;

    let nextState: GameState | null = null;
    let event: { type: string; seatIdx: number; payload: unknown } | null = null;
    let aiTrace: BotTurnTrace | null = null;
    let fallbackReason = args.fallbackReason ?? null;

    if (args.decision) {
      try {
        const seatIdx = state.phase === "bidding" ? state.bidTurn : state.turnIdx;
        const observation = createObservation(state, seatIdx);
        const decision = validateGptBridgeDecision(observation, args.decision as GptBridgeDecision);
        const trace = gptBridgeDecisionToTrace(observation, decision, {
          model: args.model,
          reasoningEffort: args.reasoningEffort,
          strategyId: args.strategyId,
          requestId: args.requestId,
          latencyMs: args.latencyMs,
        });

        if (decision.kind === "bid" && state.phase === "bidding") {
          nextState = applyPlaceBid(state, seatIdx, decision.bid);
          event = {
            type: "bid",
            seatIdx,
            payload: { bid: decision.bid, bot: true, gpt: true },
          };
          aiTrace = {
            seatIdx,
            phase: "bidding",
            round: state.round,
            trickIdx: state.trickIdx,
            decision: trace,
            observation,
          };
        } else if (decision.kind === "card" && state.phase === "playing") {
          const card = findCardInSeatHand(state, seatIdx, decision.cardKey);
          if (!card) throw new Error("gpt_card_not_in_hand");
          nextState = applyPlayCard(state, seatIdx, card);
          event = {
            type: "play",
            seatIdx,
            payload: { card, bot: true, gpt: true },
          };
          aiTrace = {
            seatIdx,
            phase: "playing",
            round: state.round,
            trickIdx: state.trickIdx,
            decision: trace,
            observation,
          };
        } else {
          throw new Error("gpt_decision_phase_mismatch");
        }
      } catch (error) {
        fallbackReason = `gpt_validation_failed:${shortFailureReason(error)}`;
        if (!args.allowHeuristicFallback) {
          throw new Error(fallbackReason);
        }
      }
    }

    if (!nextState || !event || !aiTrace) {
      if (!args.allowHeuristicFallback) {
        throw new Error(fallbackReason ?? "gpt_decision_missing");
      }
      const fallback = applyBotTurn(state);
      nextState = fallback.state;
      event = {
        ...fallback.event,
        payload: withBotEventPayload(fallback.event.payload, { gpt: true, fallback: true }),
      };
      aiTrace = {
        ...fallback.aiTrace,
        decision: withGptFallbackTrace(fallback.aiTrace.decision, {
          model: args.model,
          reasoningEffort: args.reasoningEffort,
          strategyId: args.strategyId,
          fallbackReason: fallbackReason ?? "gpt_decision_missing",
          requestId: args.requestId,
          latencyMs: args.latencyMs,
        }),
      };
    }

    state = nextState;
    await writeGameState(ctx, game._id, state);
    const sequence = await appendEvent(ctx, game, event);
    await appendAiDecisionTrace(ctx, {
      gameId: game._id,
      sequence,
      ...aiTrace,
    });
    await scheduleNext(ctx, game._id, state, sequence);
    return { sequence };
  },
});

export const recordGptBotTurnFailure = internalMutation({
  args: {
    gameId: v.id("games"),
    expectedSequence: v.number(),
    model: v.string(),
    reasoningEffort: v.string(),
    strategyId: v.optional(v.string()),
    attempt: v.number(),
    maxAttempts: v.number(),
    retryDelayMs: v.number(),
    failureReason: v.string(),
    requestId: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.status !== "active" || game.sequence !== args.expectedSequence) return null;
    const state = await getStateOrThrow(ctx, game._id);
    if (!isGptBotTurn(state)) return null;

    const seatIdx = state.phase === "bidding" ? state.bidTurn : state.turnIdx;
    const shouldRetry = args.attempt < args.maxAttempts;
    const sequence = await appendEvent(ctx, game, {
      type: shouldRetry ? "gpt_turn_retry" : "gpt_turn_blocked",
      seatIdx,
      payload: {
        gpt: true,
        model: args.model,
        reasoningEffort: args.reasoningEffort,
        strategyId: args.strategyId ?? null,
        attempt: args.attempt,
        maxAttempts: args.maxAttempts,
        reason: args.failureReason,
        requestId: args.requestId ?? null,
        latencyMs: args.latencyMs ?? null,
      },
    });

    if (shouldRetry) {
      await ctx.scheduler.runAfter(args.retryDelayMs, internal.games.gptBotTurn, {
        gameId: game._id,
        expectedSequence: sequence,
        attempt: args.attempt + 1,
      });
    }

    return { sequence, retry: shouldRetry };
  },
});

export const gptBotTurn = internalAction({
  args: {
    gameId: v.id("games"),
    expectedSequence: v.number(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ApplyGptBotTurnResult> => {
    const pending: PendingGptBotTurnResult = await ctx.runQuery(
      internal.games.pendingGptBotTurn,
      { gameId: args.gameId, expectedSequence: args.expectedSequence },
    );
    if (!pending) return null;

    const model = process.env.OPENAI_GERMAN_BRIDGE_MODEL ?? DEFAULT_GPT_BRIDGE_MODEL;
    const reasoningEffort =
      process.env.OPENAI_GERMAN_BRIDGE_REASONING_EFFORT ?? DEFAULT_GPT_BRIDGE_REASONING_EFFORT;
    const maxOutputTokens = envInteger(
      "OPENAI_GERMAN_BRIDGE_MAX_OUTPUT_TOKENS",
      DEFAULT_GPT_BRIDGE_MAX_OUTPUT_TOKENS,
    );
    const maxAttempts = envInteger("OPENAI_GERMAN_BRIDGE_MAX_ATTEMPTS", DEFAULT_GPT_BRIDGE_MAX_ATTEMPTS);
    const retryDelayMs = envInteger("OPENAI_GERMAN_BRIDGE_RETRY_DELAY_MS", DEFAULT_GPT_BRIDGE_RETRY_DELAY_MS);
    const allowHeuristicFallback = envBoolean("OPENAI_GERMAN_BRIDGE_ALLOW_HEURISTIC_FALLBACK", false);
    const customStrategy = process.env.OPENAI_GERMAN_BRIDGE_STRATEGY_CARD;
    const strategy = customStrategy?.trim()
      ? customLlmBridgeStrategyCard(customStrategy)
      : getLlmBridgeStrategyCard(process.env.OPENAI_GERMAN_BRIDGE_STRATEGY_ID);
    const apiKey = process.env.OPENAI_API_KEY;
    const seatIdx =
      pending.state.phase === "bidding" ? pending.state.bidTurn : pending.state.turnIdx;
    const observation = createObservation(pending.state, seatIdx);
    const startedAt = Date.now();
    let requestId: string | undefined;

    try {
      if (!apiKey) throw new Error("openai_api_key_missing");

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      if (process.env.OPENAI_ORG_ID) headers["OpenAI-Organization"] = process.env.OPENAI_ORG_ID;
      if (process.env.OPENAI_PROJECT_ID) headers["OpenAI-Project"] = process.env.OPENAI_PROJECT_ID;

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          input: buildGptBridgeInput(observation, { strategy }),
          reasoning: { effort: reasoningEffort },
          text: { format: buildGptBridgeTextFormat(observation), verbosity: "low" },
          max_output_tokens: maxOutputTokens,
          store: false,
        }),
      });
      const payload: unknown = await response.json();
      requestId = requestIdFromOpenAiResponse(payload, response.headers.get("x-request-id")) ?? undefined;
      if (!response.ok) {
        const errorMessage =
          payload && typeof payload === "object"
            ? (payload as { error?: { message?: unknown } }).error?.message
            : null;
        throw new Error(`openai_${response.status}:${shortFailureReason(errorMessage ?? response.statusText)}`);
      }

      const outputText = outputTextFromOpenAiResponse(payload);
      if (!outputText.trim()) throw new Error("openai_empty_output");
      const parsed = parseGptBridgeDecision(outputText);
      const decision = validateGptBridgeDecision(observation, parsed);
      const result: ApplyGptBotTurnResult = await ctx.runMutation(internal.games.applyGptBotTurn, {
        gameId: args.gameId,
        expectedSequence: args.expectedSequence,
        model,
        reasoningEffort,
        strategyId: strategy.id,
        decision,
        allowHeuristicFallback: false,
        requestId,
        latencyMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const failureReason = shortFailureReason(error);
      if (!allowHeuristicFallback) {
        await ctx.runMutation(internal.games.recordGptBotTurnFailure, {
          gameId: args.gameId,
          expectedSequence: args.expectedSequence,
          model,
          reasoningEffort,
          strategyId: strategy.id,
          attempt: args.attempt ?? 1,
          maxAttempts,
          retryDelayMs,
          failureReason,
          requestId,
          latencyMs: Date.now() - startedAt,
        });
        return null;
      }
      const result: ApplyGptBotTurnResult = await ctx.runMutation(internal.games.applyGptBotTurn, {
        gameId: args.gameId,
        expectedSequence: args.expectedSequence,
        model,
        reasoningEffort,
        strategyId: strategy.id,
        decision: null,
        allowHeuristicFallback: true,
        requestId,
        latencyMs: Date.now() - startedAt,
        fallbackReason: failureReason,
      });
      return result;
    }
  },
});

export const history = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("gameParticipants")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    const out = [];
    for (const row of rows) {
      const game = await ctx.db.get(row.gameId);
      if (!game || (game.status !== "completed" && game.status !== "abandoned")) continue;
      const stateDoc = await ctx.db
        .query("gameStates")
        .withIndex("by_gameId", (q) => q.eq("gameId", game._id))
        .unique();
      const participants = await getParticipants(ctx, game._id);
      out.push({ game, state: stateDoc?.state ?? null, participants });
    }
    return out.slice(0, 25);
  },
});

export const replay = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireParticipant(ctx, args.gameId, userId);
    const game = await getGameOrThrow(ctx, args.gameId);
    const events = await ctx.db
      .query("gameEvents")
      .withIndex("by_gameId_and_sequence", (q) => q.eq("gameId", args.gameId))
      .order("asc")
      .take(1000);
    const participants = await getParticipants(ctx, args.gameId);
    return { game, participants, events };
  },
});

export const aiDebug = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireParticipant(ctx, args.gameId, userId);
    const game = await getGameOrThrow(ctx, args.gameId);
    const participants = (await getParticipants(ctx, args.gameId)).sort(
      (a, b) => a.seatIdx - b.seatIdx,
    );

    if (game.status !== "completed" && game.status !== "abandoned") {
      return {
        locked: true,
        reason: "AI decision traces unlock after the game ends.",
        game,
        participants,
        traces: [],
        summary: {
          traceCount: 0,
          championTraceCount: 0,
          gptTraceCount: 0,
          fallbackCount: 0,
          bySeat: [],
        },
      };
    }

    const traces = await ctx.db
      .query("aiDecisionTraces")
      .withIndex("by_gameId_and_sequence", (q) => q.eq("gameId", args.gameId))
      .order("asc")
      .take(1000);
    const bySeat = participants.map((participant) => {
      const seatTraces = traces.filter((trace) => trace.seatIdx === participant.seatIdx);
      return {
        seatIdx: participant.seatIdx,
        name: participant.name,
        personality: participant.personality,
        traceCount: seatTraces.length,
        fallbackCount: seatTraces.filter((trace) => trace.fallback).length,
      };
    });

    return {
      locked: false,
      reason: null,
      game,
      participants,
      traces,
      summary: {
        traceCount: traces.length,
        championTraceCount: traces.filter(
          (trace) =>
            trace.personality === "champion" ||
            trace.policyId.startsWith("champion:") ||
            trace.requestedPolicyId.startsWith("champion:"),
        ).length,
        gptTraceCount: traces.filter(
          (trace) =>
            trace.personality === "gpt" ||
            trace.policyId.startsWith("openai:") ||
            trace.requestedPolicyId.startsWith("openai:"),
        ).length,
        fallbackCount: traces.filter((trace) => trace.fallback).length,
        bySeat,
      },
    };
  },
});
