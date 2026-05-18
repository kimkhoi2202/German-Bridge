import { describe, expect, it } from "vitest";
import type { Card } from "../cards";
import type { BotObservation } from "../botObservation";
import {
  buildGptBridgeInput,
  buildGptBridgeTextFormat,
  parseGptBridgeDecision,
  validateGptBridgeDecision,
} from "./gptBridgeBot";
import { getLlmBridgeStrategyCard } from "./llmStrategyCards";

const C = (r: string, s: string, d = 0, suffix = "test"): Card => ({
  r: r as Card["r"],
  s: s as Card["s"],
  d,
  key: `${r}${s}-${d}-${suffix}`,
});

function observation(overrides: Partial<BotObservation> = {}): BotObservation {
  const hand = [C("A", "s", 0, "a"), C("3", "h", 0, "b")];
  return {
    playerIdx: 1,
    playerCount: 4,
    players: [
      { id: "p0", name: "Human", isHuman: true, personality: "mixed" },
      { id: "p1", name: "Bot", isHuman: false, personality: "gpt" },
      { id: "p2", name: "P2", isHuman: false, personality: "mixed" },
      { id: "p3", name: "P3", isHuman: false, personality: "cautious" },
    ],
    decks: 1,
    tricksPerHand: 4,
    tricksTotal: 2,
    phase: "bidding",
    trumpCard: C("K", "d", 0, "trump"),
    trumpSuit: "d",
    ownHand: hand,
    bids: [1, null, null, null],
    won: [0, 0, 0, 0],
    currentTrick: [],
    playLog: [],
    leadIdx: 0,
    turnIdx: 1,
    bidTurn: 1,
    legalBids: [0, 1, 2],
    legalCards: hand,
    remainingHandCounts: [2, 2, 2, 2],
    opponentProfiles: [0, 1, 2, 3].map((playerIdx) => ({
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

describe("gptBridgeBot compact protocol", () => {
  it("asks for compact text instead of strict JSON schema", () => {
    expect(buildGptBridgeTextFormat(observation())).toEqual({ type: "text" });
    const input = buildGptBridgeInput(observation());
    expect(input[0]?.content).toContain("No prose, no JSON");
    expect(input[1]?.content).toContain("Return exactly one line: B:<legalBid>");
    expect(input[1]?.content).toContain("shape=tr");
    expect(input[1]?.content).toContain("mid6-T");
    expect(input[1]?.content).toContain("bidctx=");
    expect(input[1]?.content).toContain("needs:");
    expect(input[1]?.content).toContain("Strategy lens, not hard rules");
    expect(input[1]?.content).toContain("pressure-exact-v2");
    expect(input[1]?.content).not.toContain("reasoning_summary");
  });

  it("injects compact reasoning context for fast GPT decisions", () => {
    const bidInput = buildGptBridgeInput(observation());
    expect(bidInput[1]?.content).toContain("Private bidding process");
    expect(bidInput[1]?.content).toContain("middle cards");
    expect(bidInput[1]?.content).toContain("table bid pressure");

    const playInput = buildGptBridgeInput(
      observation({
        phase: "playing",
        bids: [1, 1, 0, 2],
        won: [1, 0, 0, 1],
        currentTrick: [{ playerIdx: 0, card: C("8", "s", 0, "lead") }],
        playLog: [
          { trick: 1, order: 1, playerIdx: 0, card: C("A", "d", 0, "p0"), winner: true },
          { trick: 1, order: 2, playerIdx: 1, card: C("2", "d", 0, "p1") },
          { trick: 1, order: 3, playerIdx: 2, card: C("3", "c", 0, "p2") },
        ],
        legalCards: [C("A", "s", 0, "a")],
      }),
    );
    expect(playInput[1]?.content).toContain("Private play process");
    expect(playInput[1]?.content).toContain("cardlens=");
    expect(playInput[1]?.content).toContain("nowWin");
    expect(playInput[1]?.content).toContain("opponent needs");
  });

  it("can inject the forced-winner table-police strategy mutation", () => {
    const input = buildGptBridgeInput(observation(), {
      strategy: getLlmBridgeStrategyCard("table-police-forced-v1"),
    });
    expect(input[1]?.content).toContain("table-police-forced-v1");
    expect(input[1]?.content).toContain("forced winner");
    expect(input[1]?.content).toContain("Bid 1 instead of 0");
  });

  it("parses compact bid and card decisions", () => {
    expect(parseGptBridgeDecision("B:2")).toMatchObject({ kind: "bid", bid: 2 });
    expect(parseGptBridgeDecision("Bid 1")).toMatchObject({ kind: "bid", bid: 1 });
    expect(parseGptBridgeDecision("I choose BID: 0")).toMatchObject({ kind: "bid", bid: 0 });
    expect(parseGptBridgeDecision("C:As-0-a")).toMatchObject({
      kind: "card",
      cardKey: "As-0-a",
    });
    expect(parseGptBridgeDecision("Card As-0-a")).toMatchObject({
      kind: "card",
      cardKey: "As-0-a",
    });
    expect(parseGptBridgeDecision("C:As-0-a(ASd1)")).toMatchObject({
      kind: "card",
      cardKey: "As-0-a",
    });
    expect(parseGptBridgeDecision("C:ASd1:As-0-a")).toMatchObject({
      kind: "card",
      cardKey: "As-0-a",
    });
  });

  it("still accepts legacy JSON output for safety", () => {
    expect(
      parseGptBridgeDecision(
        JSON.stringify({ kind: "bid", bid: 1, confidence: 0.9, reasoning_summary: "ok" }),
      ),
    ).toMatchObject({ kind: "bid", bid: 1, confidence: 0.9 });
  });

  it("validates compact decisions against legal actions", () => {
    const bid = validateGptBridgeDecision(observation(), parseGptBridgeDecision("B:2"));
    expect(bid).toMatchObject({ kind: "bid", bid: 2, confidence: 0.7 });

    const cardObservation = observation({
      phase: "playing",
      legalCards: [C("A", "s", 0, "a")],
      ownHand: [C("A", "s", 0, "a")],
    });
    const card = validateGptBridgeDecision(cardObservation, parseGptBridgeDecision("C:As-0-a"));
    expect(card).toMatchObject({ kind: "card", cardKey: "As-0-a", confidence: 0.7 });
  });
});
