// @vitest-environment edge-runtime

import {
  convexTest,
  type TestConvexForDataModel,
  type TestConvexForDataModelAndIdentity,
} from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import schema from "./schema";
import { runtimeChampionPolicyId } from "../src/lib/ai/runtimeChampion";

declare global {
  interface ImportMeta {
    glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
  }
}

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./_generated/ai/**"]);

type TestHarness = TestConvexForDataModelAndIdentity<DataModel>;
type TestClient = TestConvexForDataModel<DataModel>;

async function authedClient(t: TestHarness, username: string): Promise<TestClient> {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { email: username, name: username });
  });
  return t.withIdentity({
    issuer: "https://german-bridge.test",
    subject: `${userId}|test-session`,
    tokenIdentifier: `https://german-bridge.test|${userId}`,
  });
}

async function flushJobs(t: TestClient) {
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
}

async function currentGame(t: TestClient, gameId: Id<"games">) {
  const game = await t.run(async (ctx) => await ctx.db.get(gameId));
  if (!game) throw new Error("Missing game");
  return game;
}

async function driveToCompletion(t: TestClient, player: TestClient, gameId: Id<"games">) {
  for (let step = 0; step < 80; step += 1) {
    await flushJobs(t);
    const view = await player.query(api.games.watch, { gameId });
    if (view.game.status === "completed") return view;
    if (!view.state) throw new Error("Expected started game state");

    if (view.state.phase === "bidding" && view.legalBids.length > 0) {
      await player.mutation(api.games.placeBid, { gameId, bid: view.legalBids[0] });
      continue;
    }

    if (view.state.phase === "playing" && view.legalCardKeys.length > 0) {
      await player.mutation(api.games.playCard, { gameId, cardKey: view.legalCardKeys[0] });
      continue;
    }

    if (view.state.phase === "round-end") {
      await player.mutation(api.games.advanceRound, { gameId });
      continue;
    }
  }

  throw new Error("Game did not complete within the expected number of server steps");
}

describe("Convex backend game jobs", () => {
  it("requires auth before exposing protected backend data", async () => {
    const t = convexTest({ schema, modules });

    await expect(t.query(api.settings.get, {})).rejects.toThrow("Authentication required");
    await expect(
      t.mutation(api.rooms.create, {
        playerCount: 4,
        decks: 1,
        tricksPerHand: 2,
        botMood: "mixed",
      }),
    ).rejects.toThrow("Authentication required");
  });

  it("starts a private room, runs scheduled phase jobs, and pauses on human turns", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest({ schema, modules }) as TestHarness;
      const player = await authedClient(t, "qa_player");

      const room = await player.mutation(api.rooms.create, {
        playerCount: 4,
        decks: 1,
        tricksPerHand: 2,
        botMood: "mixed",
      });
      const setupView = await player.query(api.games.watch, { gameId: room.gameId });
      expect(setupView.state).toBeNull();
      expect(setupView.participants).toHaveLength(1);
      expect(setupView.inviteCode).toMatch(/^[A-Z0-9]{6}$/);

      await player.mutation(api.rooms.start, { gameId: room.gameId, botMood: "mixed" });
      const startedView = await player.query(api.games.watch, { gameId: room.gameId });
      expect(startedView.game.status).toBe("active");
      expect(startedView.state?.phase).toBe("dealing");
      expect(startedView.participants).toHaveLength(4);
      expect(startedView.game.maxRounds).toBe(2);

      await flushJobs(t);
      const biddingView = await player.query(api.games.watch, { gameId: room.gameId });
      expect(biddingView.state?.phase).toBe("bidding");
      expect(biddingView.state?.bidTurn).toBe(0);
      expect(biddingView.legalBids.length).toBeGreaterThan(0);
      expect(biddingView.state?.hands[0]).toHaveLength(1);
      expect(biddingView.state?.tricksTotal).toBe(1);
      expect(biddingView.state?.hands[1][0].key).toMatch(/^hidden-/);

      const sequenceBeforeIdle = biddingView.game.sequence;
      vi.advanceTimersByTime(60_000);
      await flushJobs(t);
      const idleView = await player.query(api.games.watch, { gameId: room.gameId });
      expect(idleView.game.sequence).toBe(sequenceBeforeIdle);
      expect(idleView.state?.phase).toBe("bidding");
      expect(idleView.state?.bidTurn).toBe(0);

      const fullState = await t.run(async (ctx) => {
        const stateDoc = await ctx.db
          .query("gameStates")
          .withIndex("by_gameId", (q) => q.eq("gameId", room.gameId))
          .unique();
        return stateDoc?.state;
      });
      expect(fullState.hands[1][0].key).not.toMatch(/^hidden-/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts champion bots when creating and starting a private room", async () => {
    const t = convexTest({ schema, modules }) as TestHarness;
    const player = await authedClient(t, "qa_champion_room");

    const room = await player.mutation(api.rooms.create, {
      playerCount: 4,
      decks: 2,
      tricksPerHand: 5,
      botMood: "champion",
    });
    await player.mutation(api.rooms.start, { gameId: room.gameId, botMood: "champion" });

    const view = await player.query(api.games.watch, { gameId: room.gameId });
    expect(view.game.decks).toBe(2);
    expect(view.game.tricksPerHand).toBe(5);
    expect(view.game.defaultBotMood).toBe("champion");
    expect(view.participants).toHaveLength(4);
    expect(view.participants.slice(1).every((participant) => participant.personality === "champion")).toBe(true);
  });

  it("accepts GPT bots and records legal fallback traces when no OpenAI key is configured", async () => {
    vi.useFakeTimers();
    vi.stubEnv("OPENAI_API_KEY", "");
    try {
      const t = convexTest({ schema, modules }) as TestHarness;
      const player = await authedClient(t, "qa_gpt_room");

      const room = await player.mutation(api.rooms.create, {
        playerCount: 4,
        decks: 1,
        tricksPerHand: 2,
        botMood: "gpt",
      });
      await player.mutation(api.rooms.start, { gameId: room.gameId, botMood: "gpt" });
      await driveToCompletion(t, player, room.gameId);

      const debug = await player.query(api.games.aiDebug, { gameId: room.gameId });
      expect(debug.locked).toBe(false);
      expect(debug.summary.gptTraceCount).toBeGreaterThan(0);
      const gptTrace = debug.traces.find((trace) => trace.personality === "gpt");
      expect(gptTrace).toBeTruthy();
      expect(gptTrace?.requestedPolicyId).toMatch(/^openai:/);
      expect(gptTrace?.fallback).toBe(true);
      expect(gptTrace?.fallbackReason).toBe("openai_api_key_missing");
      expect(gptTrace?.chosenAction).toHaveProperty("label");
      expect(gptTrace?.observation).toHaveProperty("ownHand");
      expect(gptTrace?.observation).not.toHaveProperty("hands");
    } finally {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    }
  });

  it("captures post-game bot decision traces without exposing them during live play", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest({ schema, modules }) as TestHarness;
      const player = await authedClient(t, "qa_ai_debug");

      const room = await player.mutation(api.rooms.create, {
        playerCount: 4,
        decks: 2,
        tricksPerHand: 2,
        botMood: "champion",
      });
      await player.mutation(api.rooms.start, { gameId: room.gameId, botMood: "champion" });
      await flushJobs(t);

      const liveDebug = await player.query(api.games.aiDebug, { gameId: room.gameId });
      expect(liveDebug.locked).toBe(true);
      expect(liveDebug.traces).toHaveLength(0);

      await driveToCompletion(t, player, room.gameId);

      const debug = await player.query(api.games.aiDebug, { gameId: room.gameId });
      expect(debug.locked).toBe(false);
      expect(debug.traces.length).toBeGreaterThan(0);
      expect(debug.summary.traceCount).toBe(debug.traces.length);
      expect(debug.summary.championTraceCount).toBeGreaterThan(0);

      const championTrace = debug.traces.find((trace) => trace.policyId === runtimeChampionPolicyId);
      expect(championTrace).toBeTruthy();
      expect(championTrace?.requestedPolicyId).toMatch(/^champion:/);
      expect(championTrace?.topActions.length).toBeGreaterThan(0);
      expect(championTrace?.chosenAction).toHaveProperty("label");
      expect(championTrace?.observation).toHaveProperty("ownHand");
      expect(championTrace?.observation).not.toHaveProperty("hands");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects illegal backend bids and cards even if the client bypasses the UI", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest({ schema, modules }) as TestHarness;
      const player = await authedClient(t, "qa_rules_guard");

      const room = await player.mutation(api.rooms.create, {
        playerCount: 4,
        decks: 1,
        tricksPerHand: 2,
        botMood: "mixed",
      });
      await player.mutation(api.rooms.start, { gameId: room.gameId, botMood: "mixed" });
      await flushJobs(t);

      const biddingView = await player.query(api.games.watch, { gameId: room.gameId });
      expect(biddingView.state?.phase).toBe("bidding");
      expect(biddingView.legalBids.length).toBeGreaterThan(0);
      await expect(
        player.mutation(api.games.placeBid, { gameId: room.gameId, bid: 99 }),
      ).rejects.toThrow("Illegal bid");

      await player.mutation(api.games.placeBid, {
        gameId: room.gameId,
        bid: biddingView.legalBids[0],
      });

      for (let step = 0; step < 20; step += 1) {
        await flushJobs(t);
        const view = await player.query(api.games.watch, { gameId: room.gameId });
        if (view.state?.phase === "playing" && view.legalCardKeys.length > 0) {
          await expect(
            player.mutation(api.games.playCard, {
              gameId: room.gameId,
              cardKey: "forged-card-key",
            }),
          ).rejects.toThrow("Illegal card");
          return;
        }
      }

      throw new Error("Expected the game to reach a human card turn");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects stale scheduled jobs, completes a bot-assisted game, and saves history/stats/replay", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest({ schema, modules }) as TestHarness;
      const player = await authedClient(t, "qa_finisher");

      const room = await player.mutation(api.rooms.create, {
        playerCount: 4,
        decks: 1,
        tricksPerHand: 2,
        botMood: "mixed",
      });
      await player.mutation(api.rooms.start, { gameId: room.gameId, botMood: "mixed" });
      await flushJobs(t);

      const beforeStaleJob = await currentGame(t, room.gameId);
      await t.mutation(internal.games.advancePhase, {
        gameId: room.gameId,
        expectedSequence: beforeStaleJob.sequence - 1,
      });
      expect((await currentGame(t, room.gameId)).sequence).toBe(beforeStaleJob.sequence);

      const completedView = await driveToCompletion(t, player, room.gameId);
      expect(completedView.game.status).toBe("completed");
      expect(completedView.state?.phase).toBe("match-end");

      const history = await player.query(api.games.history, {});
      expect(history.some((row) => row.game._id === room.gameId)).toBe(true);

      const replay = await player.query(api.games.replay, { gameId: room.gameId });
      expect(replay.events.map((event) => event.type)).toEqual(
        expect.arrayContaining([
          "room_created",
          "room_started",
          "trump_revealed",
          "bidding_started",
          "bid",
          "play",
          "game_completed",
        ]),
      );
      expect(replay.events.map((event) => event.sequence)).toEqual(
        [...replay.events].map((event) => event.sequence).sort((a, b) => a - b),
      );

      const stats = await player.query(api.stats.mine, {});
      expect(stats.gamesPlayed).toBe(1);
      expect(stats.gamesWon).toBeGreaterThanOrEqual(0);
      expect("lastCompletedAt" in stats ? stats.lastCompletedAt : null).toEqual(expect.any(Number));
    } finally {
      vi.useRealTimers();
    }
  });
});
