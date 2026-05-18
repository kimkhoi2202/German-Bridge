import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { MAX_DECKS, maxTricks } from "../src/lib/cards";
import type { Personality } from "../src/lib/bot";
import {
  appendEvent,
  getGameOrThrow,
  getParticipantForUser,
  getParticipants,
  getStateDoc,
  writeGameState,
} from "./lib/db";
import { botMoodForSeat, botNameForSeat, createStartedState } from "./lib/gameEngine";
import { ensureProfile, requireUserId } from "./lib/users";

const moodValidator = v.union(
  v.literal("cautious"),
  v.literal("mixed"),
  v.literal("aggressive"),
  v.literal("champion"),
  v.literal("gpt"),
  v.literal("gemini"),
);

const INVITE_CODE_DIGITS = 3;
const INVITE_CODE_SPACE = 10 ** INVITE_CODE_DIGITS;

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function setupConfig(args: {
  playerCount: number;
  decks: number;
  startingTricksPerHand?: number;
  tricksPerHand: number;
}) {
  const playerCount = clampInt(args.playerCount, 3, 12);
  const decks = clampInt(args.decks, 1, MAX_DECKS);
  const tricksPerHand = clampInt(args.tricksPerHand, 1, Math.max(1, maxTricks(playerCount, decks)));
  const startingTricksPerHand = clampInt(args.startingTricksPerHand ?? 1, 1, tricksPerHand);
  return {
    playerCount,
    decks,
    startingTricksPerHand,
    tricksPerHand,
    maxRounds: tricksPerHand - startingTricksPerHand + 1,
  };
}

function hashToUint(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function codeFrom(input: string) {
  return String(hashToUint(input) % INVITE_CODE_SPACE).padStart(INVITE_CODE_DIGITS, "0");
}

function seededRng(seed: string) {
  let state = hashToUint(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledSeatIndexes(playerCount: number, seed: string) {
  const rng = seededRng(seed);
  const seats = Array.from({ length: playerCount }, (_, index) => index);
  for (let index = seats.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [seats[index], seats[swapIndex]] = [seats[swapIndex]!, seats[index]!];
  }
  return seats;
}

async function uniqueInviteCode(ctx: MutationCtx, seed: string) {
  for (let salt = 0; salt < INVITE_CODE_SPACE; salt += 1) {
    const code = codeFrom(`${seed}:${salt}`);
    const existingSetupRoom = await ctx.db
      .query("games")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", code))
      .filter((q) => q.eq(q.field("status"), "setup"))
      .first();
    if (!existingSetupRoom) return code;
  }
  throw new Error("Could not allocate invite code");
}

async function joinSetupGame(
  ctx: MutationCtx,
  game: Doc<"games">,
  userId: Id<"users">,
  profile: Doc<"profiles">,
) {
  const existing = await getParticipantForUser(ctx, game._id, userId);
  if (existing) return { gameId: game._id, inviteCode: game.inviteCode, seatIdx: existing.seatIdx };
  if (game.status !== "setup") throw new Error("Room has already started");

  const participants = await getParticipants(ctx, game._id);
  const occupied = new Set(participants.map((p) => p.seatIdx));
  const seatIdx = Array.from({ length: game.playerCount }, (_, index) => index).find(
    (index) => !occupied.has(index),
  );
  if (seatIdx == null) throw new Error("Room is full");

  await ctx.db.insert("gameParticipants", {
    gameId: game._id,
    seatIdx,
    kind: "human",
    userId,
    username: profile.username,
    name: profile.displayName,
    personality: "mixed",
    joinedAt: Date.now(),
  });
  await appendEvent(ctx, game, {
    type: "seat_claimed",
    actorUserId: userId,
    seatIdx,
    payload: { name: profile.displayName },
  });
  return { gameId: game._id, inviteCode: game.inviteCode, seatIdx };
}

export const create = mutation({
  args: {
    playerCount: v.number(),
    decks: v.number(),
    startingTricksPerHand: v.optional(v.number()),
    tricksPerHand: v.number(),
    botMood: moodValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await ensureProfile(ctx, userId);
    const now = Date.now();
    const config = setupConfig(args);
    const inviteCode = await uniqueInviteCode(ctx, `${userId}:${now}`);
    const gameId = await ctx.db.insert("games", {
      inviteCode,
      creatorUserId: userId,
      status: "setup",
      ...config,
      defaultBotMood: args.botMood,
      sequence: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("gameParticipants", {
      gameId,
      seatIdx: 0,
      kind: "human",
      userId,
      username: profile.username,
      name: profile.displayName,
      personality: "mixed",
      joinedAt: now,
    });
    const game = (await ctx.db.get(gameId))!;
    await appendEvent(ctx, game, {
      type: "room_created",
      actorUserId: userId,
      seatIdx: 0,
      payload: { inviteCode, config, botMood: args.botMood },
    });
    return { gameId, inviteCode };
  },
});

export const joinByCode = mutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await ensureProfile(ctx, userId);
    const inviteCode = args.inviteCode.trim().toUpperCase();
    const game = await ctx.db
      .query("games")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
      .filter((q) => q.eq(q.field("status"), "setup"))
      .first();
    if (!game) {
      const matchingRoom = await ctx.db
        .query("games")
        .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
        .first();
      if (matchingRoom) throw new Error("Room has already started");
      throw new Error("Room not found");
    }
    return await joinSetupGame(ctx, game, userId, profile);
  },
});

export const joinByGameId = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await ensureProfile(ctx, userId);
    const game = await getGameOrThrow(ctx, args.gameId);
    return await joinSetupGame(ctx, game, userId, profile);
  },
});

export const joinStatus = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const game = await getGameOrThrow(ctx, args.gameId);
    const participant = await getParticipantForUser(ctx, game._id, userId);
    const participants = await getParticipants(ctx, game._id);
    const occupied = new Set(participants.map((p) => p.seatIdx));
    const openSeatIdx =
      game.status === "setup"
        ? Array.from({ length: game.playerCount }, (_, index) => index).find(
            (index) => !occupied.has(index),
          ) ?? null
        : null;

    return {
      gameId: game._id,
      inviteCode: game.inviteCode,
      status: game.status,
      playerCount: game.playerCount,
      participantSeatIdx: participant?.seatIdx ?? null,
      viewerIsHost: game.creatorUserId === userId,
      openSeatIdx,
      participantCount: participants.length,
    };
  },
});

export const claimSeat = mutation({
  args: { gameId: v.id("games"), seatIdx: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await ensureProfile(ctx, userId);
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.status !== "setup") throw new Error("Room has already started");
    const seatIdx = clampInt(args.seatIdx, 0, game.playerCount - 1);
    const current = await ctx.db
      .query("gameParticipants")
      .withIndex("by_gameId_and_seatIdx", (q) => q.eq("gameId", game._id).eq("seatIdx", seatIdx))
      .unique();
    if (current && current.userId !== userId) throw new Error("Seat is already taken");
    const existing = await getParticipantForUser(ctx, game._id, userId);
    if (existing && existing.seatIdx !== seatIdx) {
      await ctx.db.patch(existing._id, { seatIdx });
    } else if (!existing) {
      await ctx.db.insert("gameParticipants", {
        gameId: game._id,
        seatIdx,
        kind: "human",
        userId,
        username: profile.username,
        name: profile.displayName,
        personality: "mixed",
        joinedAt: Date.now(),
      });
    }
    await appendEvent(ctx, game, {
      type: "seat_claimed",
      actorUserId: userId,
      seatIdx,
      payload: { name: profile.displayName },
    });
    return { gameId: game._id, seatIdx };
  },
});

export const randomizeSeats = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.creatorUserId !== userId) throw new Error("Only the room creator can randomize seats");
    if (game.status !== "setup") throw new Error("Room has already started");

    const participants = (await getParticipants(ctx, game._id)).sort((a, b) => a.seatIdx - b.seatIdx);
    if (participants.length === 0) return { gameId: game._id, seats: [] };

    const now = Date.now();
    let nextSeats = shuffledSeatIndexes(
      game.playerCount,
      `${game._id}:${game.sequence}:${now}:${userId}`,
    ).slice(0, participants.length);
    const unchanged = participants.every((participant, index) => participant.seatIdx === nextSeats[index]);
    if (unchanged && game.playerCount > 1) {
      if (participants.length === 1) {
        nextSeats = [(participants[0]!.seatIdx + 1) % game.playerCount];
      } else {
        nextSeats = [...nextSeats.slice(1), nextSeats[0]!];
      }
    }

    const assignments = participants.map((participant, index) => ({
      participantId: participant._id,
      previousSeatIdx: participant.seatIdx,
      seatIdx: nextSeats[index]!,
      name: participant.name,
    }));

    for (const assignment of assignments) {
      await ctx.db.patch(assignment.participantId, { seatIdx: assignment.seatIdx });
    }

    await appendEvent(ctx, game, {
      type: "seats_randomized",
      actorUserId: userId,
      payload: {
        assignments: assignments.map(({ name, previousSeatIdx, seatIdx }) => ({
          name,
          previousSeatIdx,
          seatIdx,
        })),
      },
    });

    return {
      gameId: game._id,
      seats: assignments.map(({ previousSeatIdx, seatIdx, name }) => ({
        previousSeatIdx,
        seatIdx,
        name,
      })),
    };
  },
});

export const start = mutation({
  args: { gameId: v.id("games"), botMood: moodValidator },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.creatorUserId !== userId) throw new Error("Only the room creator can start");
    if (game.status !== "setup") {
      const stateDoc = game.status === "active" ? await getStateDoc(ctx, game._id) : null;
      if (stateDoc) return { gameId: game._id, alreadyStarted: true };
      throw new Error("Room has already started");
    }
    const participants = await getParticipants(ctx, game._id);
    const occupied = new Set(participants.map((p) => p.seatIdx));
    const now = Date.now();
    for (let seatIdx = 0; seatIdx < game.playerCount; seatIdx += 1) {
      if (occupied.has(seatIdx)) continue;
      const personality: Personality =
        args.botMood === "mixed" ? botMoodForSeat(seatIdx) : args.botMood;
      await ctx.db.insert("gameParticipants", {
        gameId: game._id,
        seatIdx,
        kind: "bot",
        name: botNameForSeat(seatIdx),
        personality,
        joinedAt: now,
      });
    }
    const fullParticipants = await getParticipants(ctx, game._id);
    const state = createStartedState({
      game,
      participants: fullParticipants,
      seed: `${game._id}:${game.sequence}:${now}`,
    });
    await writeGameState(ctx, game._id, state);
    const sequence = await appendEvent(ctx, game, {
      type: "room_started",
      actorUserId: userId,
      payload: { state },
      patch: { status: "active", startedAt: now },
    });
    await ctx.scheduler.runAfter(900, internal.games.advancePhase, {
      gameId: game._id,
      expectedSequence: sequence,
    });
    return { gameId: game._id };
  },
});

export const end = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const game = await getGameOrThrow(ctx, args.gameId);
    const participant = await getParticipantForUser(ctx, game._id, userId);
    if (!participant) throw new Error("You are not in this game");
    if (game.status === "completed" || game.status === "abandoned") return { gameId: game._id };
    await appendEvent(ctx, game, {
      type: "game_abandoned",
      actorUserId: userId,
      seatIdx: participant.seatIdx,
      payload: {},
      patch: { status: "abandoned", finishedAt: Date.now(), abandonedByUserId: userId },
    });
    return { gameId: game._id };
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("gameParticipants")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(25);
    const games = await Promise.all(rows.map((row) => ctx.db.get(row.gameId)));
    return games
      .flatMap((game) => (game ? [game] : []))
      .filter((game) => game.status === "setup" || game.status === "active");
  },
});
