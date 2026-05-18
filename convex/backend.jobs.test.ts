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

async function driveToRoundEnd(
  t: TestClient,
  host: TestClient,
  guest: TestClient,
  gameId: Id<"games">,
) {
  for (let step = 0; step < 60; step += 1) {
    await flushJobs(t);
    const hostView = await host.query(api.games.watch, { gameId });
    if (hostView.state?.phase === "round-end") return hostView;

    if (hostView.state?.phase === "bidding" && hostView.legalBids.length > 0) {
      await host.mutation(api.games.placeBid, { gameId, bid: hostView.legalBids[0] });
      continue;
    }

    if (hostView.state?.phase === "playing" && hostView.legalCardKeys.length > 0) {
      await host.mutation(api.games.playCard, { gameId, cardKey: hostView.legalCardKeys[0] });
      continue;
    }

    const guestView = await guest.query(api.games.watch, { gameId });
    if (guestView.state?.phase === "bidding" && guestView.legalBids.length > 0) {
      await guest.mutation(api.games.placeBid, { gameId, bid: guestView.legalBids[0] });
      continue;
    }

    if (guestView.state?.phase === "playing" && guestView.legalCardKeys.length > 0) {
      await guest.mutation(api.games.playCard, { gameId, cardKey: guestView.legalCardKeys[0] });
      continue;
    }
  }

  throw new Error("Game did not reach round-end within the expected number of server steps");
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
        startingTricksPerHand: 2,
        tricksPerHand: 2,
        botMood: "mixed",
      });
      const setupView = await player.query(api.games.watch, { gameId: room.gameId });
      expect(setupView.state).toBeNull();
      expect(setupView.participants).toHaveLength(1);
      expect(setupView.inviteCode).toMatch(/^\d{3}$/);

      await player.mutation(api.rooms.start, { gameId: room.gameId, botMood: "mixed" });
      const startedView = await player.query(api.games.watch, { gameId: room.gameId });
      expect(startedView.game.status).toBe("active");
      expect(startedView.state?.phase).toBe("dealing");
      expect(startedView.participants).toHaveLength(4);
      expect(startedView.game.startingTricksPerHand).toBe(2);
      expect(startedView.game.maxRounds).toBe(1);

      await flushJobs(t);
      const biddingView = await player.query(api.games.watch, { gameId: room.gameId });
      expect(biddingView.state?.phase).toBe("bidding");
      expect(biddingView.state?.bidTurn).toBe(0);
      expect(biddingView.legalBids.length).toBeGreaterThan(0);
      expect(biddingView.state?.hands[0]).toHaveLength(2);
      expect(biddingView.state?.tricksTotal).toBe(2);
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

  it("auto-joins shared setup room links into the next open seat", async () => {
    const t = convexTest({ schema, modules }) as TestHarness;
    const host = await authedClient(t, "qa_link_host");
    const guest = await authedClient(t, "qa_link_guest");

    const room = await host.mutation(api.rooms.create, {
      playerCount: 3,
      decks: 1,
      tricksPerHand: 2,
      botMood: "mixed",
    });

    await expect(guest.query(api.games.watch, { gameId: room.gameId })).rejects.toThrow(
      "You are not in this game",
    );

    const beforeJoin = await guest.query(api.rooms.joinStatus, { gameId: room.gameId });
    expect(beforeJoin.participantSeatIdx).toBeNull();
    expect(beforeJoin.openSeatIdx).toBe(1);
    expect(beforeJoin.status).toBe("setup");

    const join = await guest.mutation(api.rooms.joinByGameId, { gameId: room.gameId });
    expect(join.seatIdx).toBe(1);

    const afterJoin = await guest.query(api.games.watch, { gameId: room.gameId });
    expect(afterJoin.viewerSeatIdx).toBe(1);
    expect(afterJoin.participants.map((participant) => participant.seatIdx)).toEqual([0, 1]);

    const repeatJoin = await guest.mutation(api.rooms.joinByGameId, { gameId: room.gameId });
    expect(repeatJoin.seatIdx).toBe(1);
  });

  it("keeps shared link auto-join out of full and already-started rooms", async () => {
    const t = convexTest({ schema, modules }) as TestHarness;
    const host = await authedClient(t, "qa_full_host");
    const guestA = await authedClient(t, "qa_full_guest_a");
    const guestB = await authedClient(t, "qa_full_guest_b");

    const fullRoom = await host.mutation(api.rooms.create, {
      playerCount: 3,
      decks: 1,
      tricksPerHand: 2,
      botMood: "mixed",
    });
    await guestA.mutation(api.rooms.joinByGameId, { gameId: fullRoom.gameId });
    await guestB.mutation(api.rooms.joinByGameId, { gameId: fullRoom.gameId });

    const overflowGuest = await authedClient(t, "qa_full_overflow");
    const fullStatus = await overflowGuest.query(api.rooms.joinStatus, { gameId: fullRoom.gameId });
    expect(fullStatus.openSeatIdx).toBeNull();
    await expect(
      overflowGuest.mutation(api.rooms.joinByGameId, { gameId: fullRoom.gameId }),
    ).rejects.toThrow("Room is full");

    const startedRoom = await host.mutation(api.rooms.create, {
      playerCount: 3,
      decks: 1,
      tricksPerHand: 1,
      botMood: "mixed",
    });
    await host.mutation(api.rooms.start, { gameId: startedRoom.gameId, botMood: "mixed" });

    const lateGuest = await authedClient(t, "qa_late_guest");
    const lateStatus = await lateGuest.query(api.rooms.joinStatus, { gameId: startedRoom.gameId });
    expect(lateStatus.status).toBe("active");
    expect(lateStatus.openSeatIdx).toBeNull();
    await expect(
      lateGuest.mutation(api.rooms.joinByGameId, { gameId: startedRoom.gameId }),
    ).rejects.toThrow("Room has already started");
  });

  it("lets the host randomize setup seats before starting", async () => {
    const t = convexTest({ schema, modules }) as TestHarness;
    const host = await authedClient(t, "qa_seat_host");
    const guest = await authedClient(t, "qa_seat_guest");

    const room = await host.mutation(api.rooms.create, {
      playerCount: 4,
      decks: 1,
      tricksPerHand: 2,
      botMood: "mixed",
    });
    await guest.mutation(api.rooms.joinByCode, { inviteCode: room.inviteCode });

    const before = await host.query(api.games.watch, { gameId: room.gameId });
    const beforeSeatsByName = new Map(
      before.participants.map((participant) => [participant.name, participant.seatIdx]),
    );

    await expect(
      guest.mutation(api.rooms.randomizeSeats, { gameId: room.gameId }),
    ).rejects.toThrow("Only the room creator can randomize seats");

    await host.mutation(api.rooms.randomizeSeats, { gameId: room.gameId });
    const after = await host.query(api.games.watch, { gameId: room.gameId });
    const afterSeatsByName = new Map(
      after.participants.map((participant) => [participant.name, participant.seatIdx]),
    );

    expect(after.participants).toHaveLength(2);
    expect(new Set(after.participants.map((participant) => participant.seatIdx)).size).toBe(2);
    expect([...afterSeatsByName.keys()].sort()).toEqual([...beforeSeatsByName.keys()].sort());
    expect(
      [...afterSeatsByName].some(([name, seatIdx]) => beforeSeatsByName.get(name) !== seatIdx),
    ).toBe(true);

    await host.mutation(api.rooms.start, { gameId: room.gameId, botMood: "mixed" });
    const started = await host.query(api.games.watch, { gameId: room.gameId });
    expect(new Set(started.participants.map((participant) => participant.seatIdx)).size).toBe(4);
  });

  it("only lets the host advance after a round settles", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest({ schema, modules }) as TestHarness;
      const host = await authedClient(t, "qa_round_host");
      const guest = await authedClient(t, "qa_round_guest");

      const room = await host.mutation(api.rooms.create, {
        playerCount: 3,
        decks: 1,
        tricksPerHand: 1,
        botMood: "mixed",
      });
      await guest.mutation(api.rooms.joinByCode, { inviteCode: room.inviteCode });
      await host.mutation(api.rooms.start, { gameId: room.gameId, botMood: "mixed" });

      const hostRoundEndView = await driveToRoundEnd(t, host, guest, room.gameId);
      const guestRoundEndView = await guest.query(api.games.watch, { gameId: room.gameId });
      expect(hostRoundEndView.viewerIsHost).toBe(true);
      expect(guestRoundEndView.viewerIsHost).toBe(false);
      expect(guestRoundEndView.state?.phase).toBe("round-end");

      await expect(
        guest.mutation(api.games.advanceRound, { gameId: room.gameId }),
      ).rejects.toThrow("Only the host can advance rounds");
      expect((await host.query(api.games.watch, { gameId: room.gameId })).state?.phase).toBe("round-end");

      await host.mutation(api.games.advanceRound, { gameId: room.gameId });
      expect((await host.query(api.games.watch, { gameId: room.gameId })).state?.phase).toBe("match-end");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps GPT bots honest instead of silently falling back when OpenAI is unavailable", async () => {
    vi.useFakeTimers();
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_GERMAN_BRIDGE_MAX_ATTEMPTS", "1");
    vi.stubEnv("OPENAI_GERMAN_BRIDGE_ALLOW_HEURISTIC_FALLBACK", "false");
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

      let blockedEvent:
        | {
            type: string;
            payload: { reason?: string; gpt?: boolean; attempt?: number };
          }
        | undefined;
      for (let step = 0; step < 20 && !blockedEvent; step += 1) {
        await flushJobs(t);
        const view = await player.query(api.games.watch, { gameId: room.gameId });
        const events = await t.run(async (ctx) => {
          return await ctx.db
            .query("gameEvents")
            .withIndex("by_gameId", (q) => q.eq("gameId", room.gameId))
            .take(100);
        });
        blockedEvent = events.find((event) => event.type === "gpt_turn_blocked") as typeof blockedEvent;
        if (blockedEvent) break;

        if (view.state?.phase === "bidding" && view.legalBids.length > 0) {
          await player.mutation(api.games.placeBid, { gameId: room.gameId, bid: view.legalBids[0] });
        } else if (view.state?.phase === "playing" && view.legalCardKeys.length > 0) {
          await player.mutation(api.games.playCard, { gameId: room.gameId, cardKey: view.legalCardKeys[0] });
        } else if (view.state?.phase === "round-end") {
          await player.mutation(api.games.advanceRound, { gameId: room.gameId });
        }
      }

      expect(blockedEvent).toBeTruthy();
      expect(blockedEvent?.payload).toMatchObject({
        gpt: true,
        attempt: 1,
        reason: "openai_api_key_missing",
      });

      const traces = await t.run(async (ctx) => {
        return await ctx.db
          .query("aiDecisionTraces")
          .withIndex("by_gameId", (q) => q.eq("gameId", room.gameId))
          .take(100);
      });
      expect(traces).toHaveLength(0);
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
