// Integration test: drive a full match end-to-end using the public API.
// This is the closest thing to a "click through the whole UI" test we can do
// without spinning up the React tree, and it exercises every state transition.

import { describe, expect, it } from "vitest";
import {
  initialState,
  lastBidderRestriction,
  nextRound,
  placeBid,
  playCard,
  settleTrick,
  startRound,
  type GameState,
  type Player,
} from "./game";
import { botBid, botPlay } from "./bot";

function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function mkBots(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i === 0 ? "you" : `bot${i}`,
    name: i === 0 ? "Hero" : `Bot${i}`,
    isHuman: i === 0,
    personality: i % 2 === 0 ? ("aggressive" as const) : ("cautious" as const),
  }));
}

/** Take one bot action regardless of whose seat it is — tests use this to
 *  simulate humans too (the lobby user is just another seat for our purposes). */
function autoTurn(state: GameState): GameState {
  const trumpSuit = state.trumpCard?.s ?? null;
  if (state.phase === "bidding") {
    const idx = state.bidTurn;
    const placedBefore = state.bids.filter((b) => b != null).length;
    const isLast = placedBefore === state.players.length - 1;
    const restricted = isLast
      ? lastBidderRestriction(state.bids, state.tricksTotal)
      : null;
    const bid = botBid({
      hand: state.hands[idx],
      trumpSuit,
      personality: state.players[idx].personality,
      tricksTotal: state.tricksTotal,
      isLast,
      restricted,
    });
    return placeBid(state, idx, bid);
  }
  if (state.phase === "playing") {
    const idx = state.turnIdx;
    const card = botPlay({
      hand: state.hands[idx],
      currentTrick: state.currentTrick,
      trumpSuit,
      bid: state.bids[idx] ?? 0,
      won: state.won[idx] ?? 0,
    });
    return playCard(state, idx, card);
  }
  if (state.phase === "trick-end") return settleTrick(state);
  if (state.phase === "round-end") return nextRound(state);
  if (state.phase === "trump") return { ...state, phase: "bidding" };
  if (state.phase === "dealing") return { ...state, phase: "trump" };
  return state;
}

describe("integration: drive a full hand ladder with all bots", () => {
  it("reaches match-end with a winner and consistent score totals", () => {
    const players = mkBots(4);
    let s: GameState = initialState({
      players,
      decks: 1,
      tricksPerHand: 5,
      maxRounds: 5,
    });
    s = startRound(s, seededRng(42));

    let safety = 0;
    while (s.phase !== "match-end" && safety++ < 5000) {
      s = autoTurn(s);
    }
    expect(s.phase).toBe("match-end");
    expect(s.history).toHaveLength(5);

    s.history.forEach((r) => {
      expect(r.won.reduce((a, b) => a + b, 0)).toBe(r.round);
      expect(r.bids).toHaveLength(4);
      expect(r.scores).toHaveLength(4);
    });

    // Cumulative totals are integer sums of round scores
    const cum = players.map((_, i) =>
      s.history.reduce((a, h) => a + h.scores[i], 0),
    );
    cum.forEach((n) => expect(Number.isFinite(n)).toBe(true));
  });
});

describe("integration: stress test — high decks + many players", () => {
  it("handles 12 players with 4 decks for a hand ladder without errors", () => {
    const players = mkBots(12);
    let s: GameState = initialState({
      players,
      decks: 4,
      tricksPerHand: 8,
      maxRounds: 8,
    });
    s = startRound(s, seededRng(99));

    let safety = 0;
    while (s.phase !== "match-end" && safety++ < 10000) {
      s = autoTurn(s);
    }
    expect(s.phase).toBe("match-end");
    expect(s.history).toHaveLength(8);
    s.history.forEach((r) => {
      expect(r.won.reduce((a, b) => a + b, 0)).toBe(r.round);
    });
  });
});

describe("integration: 3 players, 1 deck, max-tricks (17)", () => {
  it("plays a 1-17 hand ladder without exhausting the shoe", () => {
    const players = mkBots(3);
    let s: GameState = initialState({
      players,
      decks: 1,
      tricksPerHand: 17,
      maxRounds: 17,
    });
    s = startRound(s, seededRng(7));
    expect(s.tricksTotal).toBe(1);
    s.hands.forEach((h) => expect(h).toHaveLength(1));
    expect(s.trumpCard).not.toBeNull();

    let safety = 0;
    while (s.phase !== "match-end" && safety++ < 10000) {
      s = autoTurn(s);
    }
    expect(s.phase).toBe("match-end");
    expect(s.history).toHaveLength(17);
    expect(s.history.at(-1)?.won.reduce((a, b) => a + b, 0)).toBe(17);
  });
});
