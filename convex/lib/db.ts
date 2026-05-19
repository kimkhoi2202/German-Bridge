import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { GameState } from "../../src/lib/game";
import type { BotDecisionTrace, Personality } from "../../src/lib/bot";
import type { BotObservation } from "../../src/lib/botObservation";
import type { GptBridgeMemory } from "../../src/lib/ai/gptBridgeMemory";

const TRAINING_RECORDING_VERSION = 1;

export async function getGameOrThrow(ctx: QueryCtx | MutationCtx, gameId: Id<"games">) {
  const game = await ctx.db.get(gameId);
  if (!game) throw new Error("Game not found");
  return game;
}

export async function getParticipants(ctx: QueryCtx | MutationCtx, gameId: Id<"games">) {
  return await ctx.db
    .query("gameParticipants")
    .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
    .take(12);
}

export async function getParticipantForUser(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("gameParticipants")
    .withIndex("by_userId_and_gameId", (q) => q.eq("userId", userId).eq("gameId", gameId))
    .unique();
}

export async function requireParticipant(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
  userId: Id<"users">,
) {
  const participant = await getParticipantForUser(ctx, gameId, userId);
  if (!participant) throw new Error("You are not in this game");
  return participant;
}

export async function getStateDoc(ctx: QueryCtx | MutationCtx, gameId: Id<"games">) {
  return await ctx.db
    .query("gameStates")
    .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
    .unique();
}

export async function getStateOrThrow(ctx: QueryCtx | MutationCtx, gameId: Id<"games">) {
  const stateDoc = await getStateDoc(ctx, gameId);
  if (!stateDoc) throw new Error("Game has not started");
  return stateDoc.state as GameState;
}

export async function appendEvent(
  ctx: MutationCtx,
  game: Doc<"games">,
  args: {
    type: string;
    payload: unknown;
    actorUserId?: Id<"users">;
    seatIdx?: number;
    patch?: Partial<Doc<"games">>;
  },
) {
  const sequence = game.sequence + 1;
  const now = Date.now();
  await ctx.db.insert("gameEvents", {
    gameId: game._id,
    sequence,
    type: args.type,
    payload: args.payload,
    actorUserId: args.actorUserId,
    seatIdx: args.seatIdx,
    createdAt: now,
  });
  await ctx.db.patch(game._id, {
    sequence,
    updatedAt: now,
    ...args.patch,
  });
  return sequence;
}

export async function appendAiDecisionTrace(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    sequence: number;
    seatIdx: number;
    phase: "bidding" | "playing";
    round: number;
    trickIdx: number;
    decision: BotDecisionTrace;
    observation: BotObservation;
  },
) {
  return await ctx.db.insert("aiDecisionTraces", {
    gameId: args.gameId,
    sequence: args.sequence,
    seatIdx: args.seatIdx,
    phase: args.phase,
    round: args.round,
    trickIdx: args.trickIdx,
    policyId: args.decision.policyId,
    requestedPolicyId: args.decision.requestedPolicyId,
    personality: args.decision.personality as Personality,
    fallback: args.decision.fallback,
    chosenAction: args.decision.chosenAction,
    legalActionCount: args.decision.legalActionCount,
    legalActions: args.decision.legalActions,
    topActions: args.decision.topActions,
    observation: args.observation,
    createdAt: Date.now(),
    ...(args.decision.checkpointId !== undefined ? { checkpointId: args.decision.checkpointId } : {}),
    ...(args.decision.fallbackReason !== undefined ? { fallbackReason: args.decision.fallbackReason } : {}),
    ...(args.decision.heuristic !== undefined ? { heuristic: args.decision.heuristic } : {}),
  });
}

export async function appendTrainingDecision(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    sequence: number;
    seatIdx: number;
    actorKind: "human" | "bot";
    phase: "bidding" | "playing";
    round: number;
    trickIdx: number;
    personality: Personality;
    policyId: string;
    requestedPolicyId: string;
    checkpointId?: string;
    fallback?: boolean;
    fallbackReason?: string;
    chosenAction: unknown;
    legalActionCount: number;
    observation: BotObservation;
    traceId?: Id<"aiDecisionTraces">;
  },
) {
  return await ctx.db.insert("trainingDecisions", {
    gameId: args.gameId,
    sequence: args.sequence,
    seatIdx: args.seatIdx,
    actorKind: args.actorKind,
    phase: args.phase,
    round: args.round,
    trickIdx: args.trickIdx,
    playerCount: args.observation.playerCount,
    decks: args.observation.decks,
    tricksTotal: args.observation.tricksTotal,
    personality: args.personality,
    policyId: args.policyId,
    requestedPolicyId: args.requestedPolicyId,
    fallback: args.fallback ?? false,
    chosenAction: args.chosenAction,
    legalActionCount: args.legalActionCount,
    observation: args.observation,
    recordingVersion: TRAINING_RECORDING_VERSION,
    createdAt: Date.now(),
    ...(args.checkpointId !== undefined ? { checkpointId: args.checkpointId } : {}),
    ...(args.fallbackReason !== undefined ? { fallbackReason: args.fallbackReason } : {}),
    ...(args.traceId !== undefined ? { traceId: args.traceId } : {}),
  });
}

export async function writeTrainingGameSummary(
  ctx: MutationCtx,
  args: {
    game: Doc<"games">;
    status: "completed" | "abandoned";
    participants: Doc<"gameParticipants">[];
    scores: number[];
    winnerSeatIdx?: number;
    completedAt: number;
  },
) {
  const ranks = ranksFromScores(args.scores);
  const decisions = await ctx.db
    .query("trainingDecisions")
    .withIndex("by_gameId_and_sequence", (q) => q.eq("gameId", args.game._id))
    .take(4096);
  const payload = {
    gameId: args.game._id,
    status: args.status,
    playerCount: args.game.playerCount,
    decks: args.game.decks,
    ...(args.game.startingTricksPerHand !== undefined
      ? { startingTricksPerHand: args.game.startingTricksPerHand }
      : {}),
    tricksPerHand: args.game.tricksPerHand,
    maxRounds: args.game.maxRounds,
    ...(args.game.defaultBotMood !== undefined ? { defaultBotMood: args.game.defaultBotMood } : {}),
    participants: args.participants
      .sort((a, b) => a.seatIdx - b.seatIdx)
      .map((participant) => ({
        seatIdx: participant.seatIdx,
        kind: participant.kind,
        name: participant.name,
        ...(participant.username !== undefined ? { username: participant.username } : {}),
        personality: participant.personality as Personality,
        score: args.scores[participant.seatIdx] ?? 0,
        rank: ranks[participant.seatIdx] ?? args.participants.length,
        winner: participant.seatIdx === args.winnerSeatIdx,
      })),
    scores: args.scores,
    ranks,
    ...(args.winnerSeatIdx !== undefined ? { winnerSeatIdx: args.winnerSeatIdx } : {}),
    decisionCount: decisions.length,
    humanDecisionCount: decisions.filter((decision) => decision.actorKind === "human").length,
    botDecisionCount: decisions.filter((decision) => decision.actorKind === "bot").length,
    completedAt: args.completedAt,
    recordingVersion: TRAINING_RECORDING_VERSION,
    updatedAt: Date.now(),
  };
  const existing = await ctx.db
    .query("trainingGameSummaries")
    .withIndex("by_gameId", (q) => q.eq("gameId", args.game._id))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("trainingGameSummaries", {
    ...payload,
    createdAt: Date.now(),
  });
}

function ranksFromScores(scores: number[]) {
  return scores.map((score) => 1 + scores.filter((other) => other > score).length);
}

export async function getAiBotMemory(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
  seatIdx: number,
) {
  return await ctx.db
    .query("aiBotMemories")
    .withIndex("by_gameId_and_seatIdx", (q) => q.eq("gameId", gameId).eq("seatIdx", seatIdx))
    .unique();
}

export async function writeAiBotMemory(
  ctx: MutationCtx,
  gameId: Id<"games">,
  seatIdx: number,
  memory: GptBridgeMemory,
) {
  const now = Date.now();
  const existing = await getAiBotMemory(ctx, gameId, seatIdx);
  if (existing) {
    await ctx.db.patch(existing._id, {
      round: memory.round,
      memory,
      updatedAt: now,
    });
    return existing._id;
  }
  return await ctx.db.insert("aiBotMemories", {
    gameId,
    seatIdx,
    round: memory.round,
    memory,
    updatedAt: now,
  });
}

export async function writeGameState(
  ctx: MutationCtx,
  gameId: Id<"games">,
  state: GameState,
) {
  const now = Date.now();
  const existing = await getStateDoc(ctx, gameId);
  if (existing) {
    await ctx.db.patch(existing._id, { state, updatedAt: now });
    return existing._id;
  }
  return await ctx.db.insert("gameStates", { gameId, state, updatedAt: now });
}
