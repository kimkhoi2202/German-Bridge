import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { GameState } from "../../src/lib/game";
import type { BotDecisionTrace, Personality } from "../../src/lib/bot";
import type { BotObservation } from "../../src/lib/botObservation";

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
