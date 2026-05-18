import { describe, expect, it } from "vitest";
import type { Card } from "../cards";
import type { BotObservation } from "../botObservation";
import {
  formatGptBridgeMemoryForPrompt,
  nextGptBridgeMemory,
} from "./gptBridgeMemory";

const C = (r: string, s: string, d = 0, suffix = "test"): Card => ({
  r: r as Card["r"],
  s: s as Card["s"],
  d,
  key: `${r}${s}-${d}-${suffix}`,
});

function observation(overrides: Partial<BotObservation> = {}): BotObservation {
  const hand = [
    C("A", "s", 0, "ace"),
    C("J", "s", 0, "jack"),
    C("4", "h", 0, "low"),
    C("8", "c", 0, "mid"),
  ];
  return {
    playerIdx: 1,
    playerCount: 6,
    players: [
      { id: "p0", name: "Human", isHuman: true, personality: "mixed" },
      { id: "p1", name: "Imani", isHuman: false, personality: "gpt" },
      { id: "p2", name: "P2", isHuman: false, personality: "mixed" },
      { id: "p3", name: "P3", isHuman: false, personality: "mixed" },
      { id: "p4", name: "P4", isHuman: false, personality: "mixed" },
      { id: "p5", name: "P5", isHuman: false, personality: "mixed" },
    ],
    decks: 2,
    round: 6,
    maxRounds: 10,
    tricksPerHand: 10,
    tricksTotal: 6,
    phase: "bidding",
    trumpCard: C("9", "s", 1, "trump"),
    trumpSuit: "s",
    ownHand: hand,
    bids: [1, null, null, null, null, null],
    won: [0, 0, 0, 0, 0, 0],
    currentTrick: [],
    playLog: [],
    leadIdx: 2,
    turnIdx: 1,
    bidTurn: 1,
    trickIdx: 0,
    legalBids: [0, 1, 2, 3, 4, 5, 6],
    legalCards: hand,
    remainingHandCounts: [6, 6, 6, 6, 6, 6],
    opponentProfiles: [0, 1, 2, 3, 4, 5].map((playerIdx) => ({
      playerIdx,
      currentBid: playerIdx === 0 ? 1 : null,
      currentWon: 0,
      currentBidGap: playerIdx === 0 ? 1 : 0,
      cardsPlayed: 0,
      tricksWon: 0,
      leadCount: 0,
      trumpPlayed: 0,
      offSuitDiscards: 0,
      voidSuits: { s: false, h: false, d: false, c: false },
      priorRounds: 0,
      priorBidTotal: 0,
      priorWonTotal: 0,
      priorMadeBidCount: 0,
      priorOverBidCount: 0,
      priorUnderBidCount: 0,
      priorScoreTotal: 0,
    })),
    ...overrides,
  };
}

describe("gptBridgeMemory", () => {
  it("creates a bid plan that persists exact-bid intent", () => {
    const memory = nextGptBridgeMemory(null, observation(), { kind: "bid", bid: 2 });
    expect(memory.targetBid).toBe(2);
    expect(memory.mode).toBe("planning");
    expect(memory.plan).toContain("target 2");
    expect(memory.protectedCards.join(" ")).toContain("As-0-ace");
    expect(memory.recentDecisions[0]).toContain("bid 2");
  });

  it("updates spent cards and live mode after a play", () => {
    const initial = nextGptBridgeMemory(null, observation(), { kind: "bid", bid: 2 });
    const playObservation = observation({
      phase: "playing",
      bids: [1, 2, 0, 1, 1, 1],
      won: [0, 0, 0, 0, 0, 0],
      currentTrick: [{ playerIdx: 0, card: C("K", "h", 0, "lead") }],
      legalCards: [C("4", "h", 0, "low")],
      ownHand: [C("A", "s", 0, "ace"), C("J", "s", 0, "jack"), C("4", "h", 0, "low")],
    });

    const updated = nextGptBridgeMemory(initial, playObservation, {
      kind: "card",
      cardKey: "4h-0-low",
    });

    expect(updated.mode).toBe("protect-flex");
    expect(updated.spentCards).toContain("4h-0-low");
    expect(updated.flexibleLosers.join(" ")).not.toContain("4h-0-low");
    expect(updated.recentDecisions.at(-1)).toContain("live need 2");
  });

  it("formats compact private thread context for the prompt", () => {
    const memory = nextGptBridgeMemory(null, observation(), { kind: "bid", bid: 2 });
    const text = formatGptBridgeMemoryForPrompt(
      memory,
      observation({ phase: "playing", bids: [1, 2, 0, 1, 1, 1], won: [0, 1, 0, 0, 0, 0] }),
    );

    expect(text).toContain("privateThread=v1");
    expect(text).toContain("target=b2/w1/need1");
    expect(text).toContain("threadRule:");
  });

  it("carries only strategic thread notes into a new hand", () => {
    const handSix = observation();
    const memory = nextGptBridgeMemory(null, handSix, { kind: "bid", bid: 2 });
    const played = nextGptBridgeMemory(
      memory,
      observation({
        phase: "playing",
        bids: [1, 2, 0, 1, 1, 1],
        won: [0, 1, 0, 0, 0, 0],
        legalCards: [C("A", "s", 0, "ace")],
      }),
      { kind: "card", cardKey: "As-0-ace" },
    );

    const handSeven = observation({ round: 7, ownHand: [C("2", "c", 0, "new")] });
    const promptText = formatGptBridgeMemoryForPrompt(played, handSeven);
    const nextHandMemory = nextGptBridgeMemory(played, handSeven, { kind: "bid", bid: 0 });

    expect(promptText).toContain("privateThread=carry r6->7");
    expect(promptText).toContain("old hand-specific cards are stale");
    expect(nextHandMemory.round).toBe(7);
    expect(nextHandMemory.carryover.join(" ")).toContain("from h6");
    expect(nextHandMemory.protectedCards.join(" ")).not.toContain("As-0-ace");
  });
});
