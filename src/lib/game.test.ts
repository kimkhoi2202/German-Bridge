import { describe, expect, it } from "vitest";
import {
  cumulativeScores,
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

const mkPlayers = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i === 0 ? "you" : `bot${i}`,
    name: i === 0 ? "You" : `Bot ${i}`,
    isHuman: i === 0,
    personality: "mixed" as const,
  }));

// Seedable RNG so deals are reproducible across runs.
function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function rngWithFirst(first: number, seed = 123) {
  const rest = seededRng(seed);
  let usedFirst = false;
  return () => {
    if (!usedFirst) {
      usedFirst = true;
      return first;
    }
    return rest();
  };
}

const baseConfig = {
  players: mkPlayers(4),
  decks: 1,
  tricksPerHand: 3,
  maxRounds: 3,
};

describe("initialState", () => {
  it("starts in lobby with empty history", () => {
    const s = initialState(baseConfig);
    expect(s.phase).toBe("lobby");
    expect(s.history).toEqual([]);
    expect(s.playLog).toEqual([]);
    expect(s.players).toHaveLength(4);
  });
});

describe("lastBidderRestriction", () => {
  it("returns the value that would make totals equal trick count", () => {
    expect(lastBidderRestriction([1, 2, 1, null], 5)).toBe(1);
  });
  it("returns null when not at the last bidder", () => {
    expect(lastBidderRestriction([1, null, null, null], 5)).toBeNull();
  });
  it("returns null when restriction is out of range", () => {
    expect(lastBidderRestriction([10, 10, 10, null], 3)).toBeNull();
  });
});

describe("startRound", () => {
  it("starts the hand ladder at one card and flips trump", () => {
    const s0 = initialState(baseConfig);
    const s1 = startRound(s0, seededRng(1));
    expect(s1.phase).toBe("dealing");
    expect(s1.hands).toHaveLength(4);
    s1.hands.forEach((h) => expect(h).toHaveLength(1));
    expect(s1.trumpCard).not.toBeNull();
    expect(s1.tricksTotal).toBe(1);
    expect(s1.round).toBe(1);
  });

  it("supports starting the hand ladder above one card", () => {
    const s0 = initialState({
      ...baseConfig,
      startingTricksPerHand: 2,
      tricksPerHand: 4,
      maxRounds: 3,
    });
    const s1 = startRound(s0, seededRng(11));
    expect(s1.startingTricksPerHand).toBe(2);
    expect(s1.maxRounds).toBe(3);
    expect(s1.tricksTotal).toBe(2);
    s1.hands.forEach((h) => expect(h).toHaveLength(2));

    const s2 = nextRound({ ...s1, phase: "round-end" }, seededRng(12));
    expect(s2.tricksTotal).toBe(3);
    s2.hands.forEach((h) => expect(h).toHaveLength(3));
  });

  it("randomizes the initial dealer, starts bidding with dealer, then starts play after dealer", () => {
    const s0 = initialState(baseConfig);
    const s1 = startRound(s0, rngWithFirst(0.75));
    expect(s1.dealerIdx).toBe(3);
    expect(s1.bidTurn).toBe(3);
    expect(s1.leadIdx).toBe(0);
    expect(s1.turnIdx).toBe(0);
  });

  it("rotates the dealer after the randomized first round", () => {
    const s0 = initialState(baseConfig);
    const firstRound = startRound(s0, rngWithFirst(0.25));
    expect(firstRound.dealerIdx).toBe(1);
    expect(firstRound.bidTurn).toBe(1);
    expect(firstRound.leadIdx).toBe(2);

    const secondRound = nextRound({ ...firstRound, phase: "round-end" }, seededRng(9));
    expect(secondRound.dealerIdx).toBe(2);
    expect(secondRound.bidTurn).toBe(2);
    expect(secondRound.leadIdx).toBe(3);
  });

  it("throws if tricksPerHand exceeds the deck capacity", () => {
    const s0 = initialState({ ...baseConfig, tricksPerHand: 99 });
    expect(() => startRound(s0)).toThrow();
  });
});

describe("placeBid", () => {
  it("blocks the last-bidder restricted value", () => {
    const s0 = initialState(baseConfig);
    let s = startRound(s0, seededRng(2));
    s = { ...s, phase: "bidding" };
    // Bid in turn order, starting with the dealer.
    const order = [s.bidTurn];
    for (let i = 1; i < 4; i++) order.push((order[i - 1] + 1) % 4);

    s = placeBid(s, order[0], 0);
    s = placeBid(s, order[1], 0);
    s = placeBid(s, order[2], 0);
    // Last bidder cannot pick 1 (since 0+0+0+1 = 1 = tricksTotal)
    expect(() => placeBid(s, order[3], 1)).toThrow();
    // But 0 is fine
    s = placeBid(s, order[3], 0);
    expect(s.phase).toBe("playing");
  });

  it("transitions to playing when all bids are placed", () => {
    const s0 = initialState(baseConfig);
    let s = startRound(s0, seededRng(3));
    s = { ...s, phase: "bidding" };
    const order = [s.bidTurn];
    for (let i = 1; i < 4; i++) order.push((order[i - 1] + 1) % 4);
    s = placeBid(s, order[0], 0);
    s = placeBid(s, order[1], 0);
    s = placeBid(s, order[2], 0);
    s = placeBid(s, order[3], 0);
    expect(s.phase).toBe("playing");
    expect(s.turnIdx).toBe((s.dealerIdx + 1) % s.players.length);
    expect(s.leadIdx).toBe((s.dealerIdx + 1) % s.players.length);
  });

  it("rejects bids out of range", () => {
    const s0 = initialState(baseConfig);
    let s = startRound(s0, seededRng(4));
    s = { ...s, phase: "bidding" };
    expect(() => placeBid(s, s.bidTurn, -1)).toThrow();
    expect(() => placeBid(s, s.bidTurn, 99)).toThrow();
  });
});

describe("playCard / settleTrick / round flow", () => {
  function bidEveryone(s: GameState, bids: number[]): GameState {
    const order = [s.bidTurn];
    for (let i = 1; i < s.players.length; i++) {
      order.push((order[i - 1] + 1) % s.players.length);
    }
    let cur: GameState = { ...s, phase: "bidding" };
    for (let i = 0; i < order.length; i++) {
      // If this is the last bidder and the requested bid is restricted, swap with the next legal
      if (i === order.length - 1) {
        const r = lastBidderRestriction(cur.bids, cur.tricksTotal);
        if (r != null && bids[i] === r) {
          bids[i] = bids[i] === 0 ? 1 : 0;
        }
      }
      cur = placeBid(cur, order[i], bids[i]);
    }
    return cur;
  }

  it("plays a full round and produces a scoring record", () => {
    const s0 = initialState(baseConfig);
    let s = startRound(s0, seededRng(5));
    s = bidEveryone(s, [0, 0, 0, 1]);
    expect(s.phase).toBe("playing");

    while (s.phase !== "round-end") {
      // Each player plays the first legal card from their hand.
      // After a complete trick we must call settleTrick before the next play.
      if (s.phase === "trick-end") {
        s = settleTrick(s);
        continue;
      }
      const handIdx = s.turnIdx;
      const leadSuit = s.currentTrick.length ? s.currentTrick[0].card.s : null;
      const hand = s.hands[handIdx];
      const inSuit = leadSuit ? hand.filter((c) => c.s === leadSuit) : [];
      const card = inSuit.length ? inSuit[0] : hand[0];
      s = playCard(s, handIdx, card);
    }
    const record = s.history[0];
    expect(record).toBeDefined();
    expect(record.scores).toHaveLength(4);
    // Sum of tricks won equals tricks dealt
    expect(record.won.reduce((a, b) => a + b, 0)).toBe(s.tricksTotal);
    expect(record.playLog).toHaveLength(s.tricksTotal * s.players.length);
    // All hands are empty
    s.hands.forEach((h) => expect(h).toHaveLength(0));
    expect(s.playLog).toHaveLength(s.tricksTotal * s.players.length);
    expect(s.playLog.filter((entry) => entry.trick === s.tricksTotal && entry.winner)).toHaveLength(1);
    expect(s.trickIdx).toBe(s.tricksTotal);
  });

  it("rejects revoking (not following suit when able)", () => {
    const s0 = initialState({ ...baseConfig, players: mkPlayers(2), tricksPerHand: 3 });
    let s = startRound({ ...s0, round: 2 }, seededRng(6));
    s = bidEveryone(s, [1, 1]);

    // Force a known lead so we can attempt a revoke
    const turn = s.turnIdx;
    const hand = s.hands[turn];
    const lead = hand[0];
    s = playCard(s, turn, lead);

    const next = (turn + 1) % 2;
    const nextHand = s.hands[next];
    const followCard = nextHand.find((c) => c.s === lead.s);
    const offSuit = nextHand.find((c) => c.s !== lead.s);
    if (followCard && offSuit) {
      // Player CAN follow but tries to play offsuit → must throw
      expect(() => playCard(s, next, offSuit)).toThrow();
    }
  });
});

describe("nextRound + cumulativeScores", () => {
  it("rotates dealer and accumulates scores across rounds", () => {
    const s0 = initialState({ ...baseConfig, maxRounds: 2, players: mkPlayers(3), tricksPerHand: 2 });
    let s = startRound(s0, seededRng(7));
    // Bid 0 for everyone; some will hit, some will miss
    s = (() => {
      const order = [s.bidTurn];
      for (let i = 1; i < 3; i++) order.push((order[i - 1] + 1) % 3);
      let cur: GameState = { ...s, phase: "bidding" };
      for (let i = 0; i < order.length; i++) {
        // Last bidder forbidden value handling
        let bid = 0;
        if (i === order.length - 1) {
          const r = lastBidderRestriction(cur.bids, cur.tricksTotal);
          if (r === 0) bid = 1;
        }
        cur = placeBid(cur, order[i], bid);
      }
      return cur;
    })();

    while (s.phase !== "round-end") {
      if (s.phase === "trick-end") {
        s = settleTrick(s);
        continue;
      }
      const turn = s.turnIdx;
      const lead = s.currentTrick.length ? s.currentTrick[0].card.s : null;
      const hand = s.hands[turn];
      const card = (lead ? hand.find((c) => c.s === lead) : null) ?? hand[0];
      s = playCard(s, turn, card);
    }

    const dealerBefore = s.dealerIdx;
    const after = nextRound(s);
    expect(after.phase).toBe("dealing");
    expect(after.round).toBe(2);
    expect(after.tricksTotal).toBe(2);
    after.hands.forEach((hand) => expect(hand).toHaveLength(2));
    expect(after.dealerIdx).toBe((dealerBefore + 1) % 3);

    const cum = cumulativeScores(s);
    expect(cum).toHaveLength(3);
    // Each entry is a finite integer
    cum.forEach((n) => expect(Number.isFinite(n)).toBe(true));
  });
});
