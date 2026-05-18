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
import { createObservation } from "../src/lib/botObservation";
import {
  DEFAULT_GEMINI_BRIDGE_BIDDING_THINKING_LEVEL,
  DEFAULT_GEMINI_BRIDGE_MODEL,
  DEFAULT_GEMINI_BRIDGE_PLAY_THINKING_LEVEL,
  DEFAULT_GPT_BRIDGE_MODEL,
  DEFAULT_GPT_BRIDGE_REASONING_EFFORT,
  GEMINI_BRIDGE_POLICY_ID,
  buildGptBridgeInput,
  buildGptBridgeTextFormat,
  gptBridgeDecisionToTrace,
  parseGptBridgeDecision,
  validateGptBridgeDecision,
  type GptBridgeDecision,
} from "../src/lib/ai/gptBridgeBot";
import {
  nextGptBridgeMemory,
  type GptBridgeMemory,
} from "../src/lib/ai/gptBridgeMemory";
import {
  customLlmBridgeStrategyCard,
  getLlmBridgeStrategyCard,
} from "../src/lib/ai/llmStrategyCards";
import {
  appendAiDecisionTrace,
  appendEvent,
  getAiBotMemory,
  getGameOrThrow,
  getParticipantForUser,
  getParticipants,
  getStateOrThrow,
  requireParticipant,
  writeAiBotMemory,
  writeGameState,
} from "./lib/db";
import {
  applyBotTurn,
  finalScores,
  findCardInSeatHand,
  finishRoundOrMatch,
  isBotTurn,
  isGeminiBotTurn,
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

const DEFAULT_GPT_BRIDGE_MAX_OUTPUT_TOKENS = 1024;
const DEFAULT_GPT_BRIDGE_MAX_ATTEMPTS = 3;
const DEFAULT_GPT_BRIDGE_RETRY_DELAY_MS = 1800;
const DEFAULT_GEMINI_BRIDGE_MAX_OUTPUT_TOKENS = 512;
const DEFAULT_GEMINI_BRIDGE_MAX_ATTEMPTS = 3;
const DEFAULT_GEMINI_BRIDGE_RETRY_DELAY_MS = 1800;
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

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

function shortFailureReason(reason: unknown) {
  const raw = reason instanceof Error ? reason.message : String(reason);
  return raw.replace(/\s+/g, " ").trim().slice(0, 240) || "gpt_decision_failed";
}

function providerFailureReason(provider: "gpt" | "gemini", reason: unknown) {
  const short = shortFailureReason(reason);
  return provider === "gemini" ? short.replace(/\bgpt_/g, "gemini_") : short;
}

function shortDebugText(value: unknown, limit = 500) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, limit) : null;
}

function cardDebugLabel(card: { key: string; r: string; s: string; d: number }) {
  return `${card.key}(${card.r}${card.s.toUpperCase()}d${card.d + 1})`;
}

function llmFailureDebug(
  observation: ReturnType<typeof createObservation>,
  args: { outputText: string; parsedDecision: unknown },
) {
  const debug: Record<string, unknown> = {
    phase: observation.phase,
    round: observation.round,
    trickIdx: observation.trickIdx,
    seatIdx: observation.playerIdx,
    playerCount: observation.playerCount,
    decks: observation.decks,
    bidTurn: observation.bidTurn,
    turnIdx: observation.turnIdx,
    bids: observation.bids,
    won: observation.won,
    currentTrick: observation.currentTrick.map((play) => ({
      seatIdx: play.playerIdx,
      card: cardDebugLabel(play.card),
    })),
    legalBids: observation.legalBids,
    legalCards: observation.legalCards.map(cardDebugLabel),
  };
  const outputText = shortDebugText(args.outputText);
  if (outputText) debug.outputText = outputText;
  if (args.parsedDecision !== null) debug.parsedDecision = args.parsedDecision;
  return debug;
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

function incompleteReasonFromOpenAiResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { status?: unknown; incomplete_details?: unknown };
  if (root.status !== "incomplete") return null;
  const details = root.incomplete_details;
  if (details && typeof details === "object") {
    const reason = (details as { reason?: unknown }).reason;
    if (typeof reason === "string" && reason.trim()) return reason.trim();
  }
  return "unknown";
}

function requestIdFromOpenAiResponse(payload: unknown, headerRequestId: string | null) {
  if (headerRequestId) return headerRequestId;
  if (!payload || typeof payload !== "object") return null;
  const requestId = (payload as { request_id?: unknown; id?: unknown }).request_id;
  if (typeof requestId === "string") return requestId;
  const id = (payload as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function outputTextFromGeminiResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";
  const parts: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as { content?: unknown }).content;
    if (!content || typeof content !== "object") continue;
    const contentParts = (content as { parts?: unknown }).parts;
    if (!Array.isArray(contentParts)) continue;
    for (const part of contentParts) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown; thought?: unknown }).text;
      const thought = (part as { thought?: unknown }).thought;
      if (typeof text === "string" && thought !== true) parts.push(text);
    }
  }
  return parts.join("");
}

function geminiFinishReason(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return null;
  const first = candidates[0];
  if (!first || typeof first !== "object") return null;
  const reason = (first as { finishReason?: unknown }).finishReason;
  return typeof reason === "string" && reason ? reason : null;
}

function errorMessageFromGeminiResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
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
    if (isGeminiBotTurn(state)) {
      await ctx.scheduler.runAfter(850, internal.games.geminiBotTurn, {
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
      viewerIsHost: game.creatorUserId === userId,
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
    if (game.creatorUserId !== userId) throw new Error("Only the host can advance rounds");
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

type PendingGptBotTurnResult = { state: GameState; memory: GptBridgeMemory | null } | null;
type ApplyGptBotTurnResult = { sequence: number } | null;
type PendingGeminiBotTurnResult = PendingGptBotTurnResult;
type ApplyGeminiBotTurnResult = ApplyGptBotTurnResult;

function geminiThinkingLevelForObservation(observation: ReturnType<typeof createObservation>) {
  const phaseDefault =
    observation.phase === "bidding"
      ? DEFAULT_GEMINI_BRIDGE_BIDDING_THINKING_LEVEL
      : DEFAULT_GEMINI_BRIDGE_PLAY_THINKING_LEVEL;
  const phaseEnv =
    observation.phase === "bidding"
      ? process.env.GEMINI_GERMAN_BRIDGE_BIDDING_THINKING_LEVEL
      : process.env.GEMINI_GERMAN_BRIDGE_PLAY_THINKING_LEVEL;
  return (
    phaseEnv?.trim() ||
    process.env.GEMINI_GERMAN_BRIDGE_THINKING_LEVEL?.trim() ||
    phaseDefault
  );
}

function geminiRequestFromBridgeInput(
  input: ReturnType<typeof buildGptBridgeInput>,
  args: { thinkingLevel: string; maxOutputTokens: number },
) {
  const systemText = input
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n");
  const userText = input
    .filter((message) => message.role !== "system")
    .map((message) => message.content)
    .join("\n\n");
  return {
    ...(systemText
      ? {
          systemInstruction: {
            parts: [{ text: systemText }],
          },
        }
      : {}),
    contents: [
      {
        role: "user",
        parts: [{ text: userText || systemText }],
      },
    ],
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: args.maxOutputTokens,
      thinkingConfig: {
        thinkingLevel: args.thinkingLevel,
      },
    },
  };
}

function geminiModelPath(model: string) {
  return model.startsWith("models/") ? model : `models/${model}`;
}

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
    const seatIdx = state.phase === "bidding" ? state.bidTurn : state.turnIdx;
    const memoryDoc = await getAiBotMemory(ctx, game._id, seatIdx);
    const memory = memoryDoc ? (memoryDoc.memory as GptBridgeMemory) : null;
    return { state, memory };
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
    requestId: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ApplyGptBotTurnResult> => {
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.status !== "active" || game.sequence !== args.expectedSequence) return null;
    let state = await getStateOrThrow(ctx, game._id);
    if (!isGptBotTurn(state)) return null;

    let nextState: GameState | null = null;
    let event: { type: string; seatIdx: number; payload: unknown } | null = null;
    let aiTrace: BotTurnTrace | null = null;
    let nextMemory: GptBridgeMemory | null = null;

    try {
      const seatIdx = state.phase === "bidding" ? state.bidTurn : state.turnIdx;
      const observation = createObservation(state, seatIdx);
      const decision = validateGptBridgeDecision(observation, args.decision as GptBridgeDecision);
      const memoryDoc = await getAiBotMemory(ctx, game._id, seatIdx);
      const previousMemory = memoryDoc ? (memoryDoc.memory as GptBridgeMemory) : null;
      nextMemory = nextGptBridgeMemory(previousMemory, observation, decision);
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
      throw new Error(`gpt_validation_failed:${providerFailureReason("gpt", error)}`);
    }

    if (!nextState || !event || !aiTrace) {
      throw new Error("gpt_decision_missing");
    }

    state = nextState;
    await writeGameState(ctx, game._id, state);
    if (nextMemory && aiTrace) {
      await writeAiBotMemory(ctx, game._id, aiTrace.seatIdx, nextMemory);
    }
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
    debug: v.optional(v.any()),
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
        ...(args.debug !== undefined ? { debug: args.debug } : {}),
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
    let outputText = "";
    let parsedDecision: unknown = null;

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
          input: buildGptBridgeInput(observation, { strategy, memory: pending.memory }),
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

      const incompleteReason = incompleteReasonFromOpenAiResponse(payload);
      if (incompleteReason) throw new Error(`openai_incomplete:${incompleteReason}`);
      outputText = outputTextFromOpenAiResponse(payload);
      if (!outputText.trim()) throw new Error("openai_empty_output");
      const parsed = parseGptBridgeDecision(outputText);
      parsedDecision = parsed;
      const decision = validateGptBridgeDecision(observation, parsed);
      const result: ApplyGptBotTurnResult = await ctx.runMutation(internal.games.applyGptBotTurn, {
        gameId: args.gameId,
        expectedSequence: args.expectedSequence,
        model,
        reasoningEffort,
        strategyId: strategy.id,
        decision,
        requestId,
        latencyMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const failureReason = providerFailureReason("gpt", error);
      const attempt = args.attempt ?? 1;
      await ctx.runMutation(internal.games.recordGptBotTurnFailure, {
        gameId: args.gameId,
        expectedSequence: args.expectedSequence,
        model,
        reasoningEffort,
        strategyId: strategy.id,
        attempt,
        maxAttempts,
        retryDelayMs,
        failureReason,
        requestId,
        latencyMs: Date.now() - startedAt,
        debug: llmFailureDebug(observation, { outputText, parsedDecision }),
      });
      return null;
    }
  },
});

export const pendingGeminiBotTurn = internalQuery({
  args: { gameId: v.id("games"), expectedSequence: v.number() },
  handler: async (ctx, args): Promise<PendingGeminiBotTurnResult> => {
    const game = await ctx.db.get(args.gameId);
    if (!game || game.status !== "active" || game.sequence !== args.expectedSequence) {
      return null;
    }
    const stateDoc = await ctx.db
      .query("gameStates")
      .withIndex("by_gameId", (q) => q.eq("gameId", game._id))
      .unique();
    const state = stateDoc?.state as GameState | undefined;
    if (!state || !isGeminiBotTurn(state)) return null;
    const seatIdx = state.phase === "bidding" ? state.bidTurn : state.turnIdx;
    const memoryDoc = await getAiBotMemory(ctx, game._id, seatIdx);
    const memory = memoryDoc ? (memoryDoc.memory as GptBridgeMemory) : null;
    return { state, memory };
  },
});

export const applyGeminiBotTurn = internalMutation({
  args: {
    gameId: v.id("games"),
    expectedSequence: v.number(),
    model: v.string(),
    thinkingLevel: v.string(),
    strategyId: v.optional(v.string()),
    decision: gptDecisionValidator,
    requestId: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ApplyGeminiBotTurnResult> => {
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.status !== "active" || game.sequence !== args.expectedSequence) return null;
    let state = await getStateOrThrow(ctx, game._id);
    if (!isGeminiBotTurn(state)) return null;

    let nextState: GameState | null = null;
    let event: { type: string; seatIdx: number; payload: unknown } | null = null;
    let aiTrace: BotTurnTrace | null = null;
    let nextMemory: GptBridgeMemory | null = null;

    try {
      const seatIdx = state.phase === "bidding" ? state.bidTurn : state.turnIdx;
      const observation = createObservation(state, seatIdx);
      const decision = validateGptBridgeDecision(observation, args.decision as GptBridgeDecision);
      const memoryDoc = await getAiBotMemory(ctx, game._id, seatIdx);
      const previousMemory = memoryDoc ? (memoryDoc.memory as GptBridgeMemory) : null;
      nextMemory = nextGptBridgeMemory(previousMemory, observation, decision);
      const trace = gptBridgeDecisionToTrace(observation, decision, {
        model: args.model,
        reasoningEffort: args.thinkingLevel,
        strategyId: args.strategyId,
        requestId: args.requestId,
        latencyMs: args.latencyMs,
        provider: "google",
        personality: "gemini",
        policyId: GEMINI_BRIDGE_POLICY_ID,
      });

      if (decision.kind === "bid" && state.phase === "bidding") {
        nextState = applyPlaceBid(state, seatIdx, decision.bid);
        event = {
          type: "bid",
          seatIdx,
          payload: { bid: decision.bid, bot: true, gemini: true },
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
        if (!card) throw new Error("gemini_card_not_in_hand");
        nextState = applyPlayCard(state, seatIdx, card);
        event = {
          type: "play",
          seatIdx,
          payload: { card, bot: true, gemini: true },
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
        throw new Error("gemini_decision_phase_mismatch");
      }
    } catch (error) {
      throw new Error(`gemini_validation_failed:${providerFailureReason("gemini", error)}`);
    }

    if (!nextState || !event || !aiTrace) {
      throw new Error("gemini_decision_missing");
    }

    state = nextState;
    await writeGameState(ctx, game._id, state);
    if (nextMemory && aiTrace) {
      await writeAiBotMemory(ctx, game._id, aiTrace.seatIdx, nextMemory);
    }
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

export const recordGeminiBotTurnFailure = internalMutation({
  args: {
    gameId: v.id("games"),
    expectedSequence: v.number(),
    model: v.string(),
    thinkingLevel: v.string(),
    strategyId: v.optional(v.string()),
    attempt: v.number(),
    maxAttempts: v.number(),
    retryDelayMs: v.number(),
    failureReason: v.string(),
    requestId: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
    debug: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.status !== "active" || game.sequence !== args.expectedSequence) return null;
    const state = await getStateOrThrow(ctx, game._id);
    if (!isGeminiBotTurn(state)) return null;

    const seatIdx = state.phase === "bidding" ? state.bidTurn : state.turnIdx;
    const shouldRetry = args.attempt < args.maxAttempts;
    const sequence = await appendEvent(ctx, game, {
      type: shouldRetry ? "gemini_turn_retry" : "gemini_turn_blocked",
      seatIdx,
      payload: {
        gemini: true,
        model: args.model,
        thinkingLevel: args.thinkingLevel,
        strategyId: args.strategyId ?? null,
        attempt: args.attempt,
        maxAttempts: args.maxAttempts,
        reason: args.failureReason,
        requestId: args.requestId ?? null,
        latencyMs: args.latencyMs ?? null,
        ...(args.debug !== undefined ? { debug: args.debug } : {}),
      },
    });

    if (shouldRetry) {
      await ctx.scheduler.runAfter(args.retryDelayMs, internal.games.geminiBotTurn, {
        gameId: game._id,
        expectedSequence: sequence,
        attempt: args.attempt + 1,
      });
    }

    return { sequence, retry: shouldRetry };
  },
});

export const geminiBotTurn = internalAction({
  args: {
    gameId: v.id("games"),
    expectedSequence: v.number(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ApplyGeminiBotTurnResult> => {
    const pending: PendingGeminiBotTurnResult = await ctx.runQuery(
      internal.games.pendingGeminiBotTurn,
      { gameId: args.gameId, expectedSequence: args.expectedSequence },
    );
    if (!pending) return null;

    const model = process.env.GEMINI_GERMAN_BRIDGE_MODEL ?? DEFAULT_GEMINI_BRIDGE_MODEL;
    const maxOutputTokens = envInteger(
      "GEMINI_GERMAN_BRIDGE_MAX_OUTPUT_TOKENS",
      DEFAULT_GEMINI_BRIDGE_MAX_OUTPUT_TOKENS,
    );
    const maxAttempts = envInteger("GEMINI_GERMAN_BRIDGE_MAX_ATTEMPTS", DEFAULT_GEMINI_BRIDGE_MAX_ATTEMPTS);
    const retryDelayMs = envInteger("GEMINI_GERMAN_BRIDGE_RETRY_DELAY_MS", DEFAULT_GEMINI_BRIDGE_RETRY_DELAY_MS);
    const customStrategy = process.env.GEMINI_GERMAN_BRIDGE_STRATEGY_CARD;
    const strategy = customStrategy?.trim()
      ? customLlmBridgeStrategyCard(customStrategy)
      : getLlmBridgeStrategyCard(process.env.GEMINI_GERMAN_BRIDGE_STRATEGY_ID);
    const apiKey = process.env.GEMINI_API_KEY;
    const seatIdx =
      pending.state.phase === "bidding" ? pending.state.bidTurn : pending.state.turnIdx;
    const observation = createObservation(pending.state, seatIdx);
    const thinkingLevel = geminiThinkingLevelForObservation(observation);
    const startedAt = Date.now();
    let requestId: string | undefined;
    let outputText = "";
    let parsedDecision: unknown = null;

    try {
      if (!apiKey) throw new Error("gemini_api_key_missing");

      const response = await fetch(
        `${GEMINI_API_BASE_URL}/${geminiModelPath(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(
            geminiRequestFromBridgeInput(
              buildGptBridgeInput(observation, { strategy, memory: pending.memory }),
              { thinkingLevel, maxOutputTokens },
            ),
          ),
        },
      );
      const payload: unknown = await response.json();
      requestId =
        response.headers.get("x-request-id") ??
        response.headers.get("x-goog-request-id") ??
        undefined;
      if (!response.ok) {
        throw new Error(
          `gemini_${response.status}:${shortFailureReason(
            errorMessageFromGeminiResponse(payload) ?? response.statusText,
          )}`,
        );
      }

      const finishReason = geminiFinishReason(payload);
      if (finishReason && finishReason !== "STOP") throw new Error(`gemini_finish:${finishReason}`);
      outputText = outputTextFromGeminiResponse(payload);
      if (!outputText.trim()) throw new Error("gemini_empty_output");
      const parsed = parseGptBridgeDecision(outputText);
      parsedDecision = parsed;
      const decision = validateGptBridgeDecision(observation, parsed);
      const result: ApplyGeminiBotTurnResult = await ctx.runMutation(internal.games.applyGeminiBotTurn, {
        gameId: args.gameId,
        expectedSequence: args.expectedSequence,
        model,
        thinkingLevel,
        strategyId: strategy.id,
        decision,
        requestId,
        latencyMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const failureReason = providerFailureReason("gemini", error);
      const attempt = args.attempt ?? 1;
      await ctx.runMutation(internal.games.recordGeminiBotTurnFailure, {
        gameId: args.gameId,
        expectedSequence: args.expectedSequence,
        model,
        thinkingLevel,
        strategyId: strategy.id,
        attempt,
        maxAttempts,
        retryDelayMs,
        failureReason,
        requestId,
        latencyMs: Date.now() - startedAt,
        debug: llmFailureDebug(observation, { outputText, parsedDecision }),
      });
      return null;
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
          geminiTraceCount: 0,
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
        geminiTraceCount: traces.filter(
          (trace) =>
            trace.personality === "gemini" ||
            trace.policyId.startsWith("google:") ||
            trace.requestedPolicyId.startsWith("google:"),
        ).length,
        fallbackCount: traces.filter((trace) => trace.fallback).length,
        bySeat,
      },
    };
  },
});
