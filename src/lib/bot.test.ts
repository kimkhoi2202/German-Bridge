import { describe, expect, it } from "vitest";
import { botBid, botPlay, handEquity } from "./bot";
import type { Card } from "./cards";

const C = (r: string, s: string, d = 0): Card => ({
  r: r as Card["r"],
  s: s as Card["s"],
  d,
  key: `${r}${s}-${d}-test`,
});

describe("handEquity", () => {
  it("counts trump cards higher than non-trump", () => {
    const handTrump = [C("A", "s"), C("K", "s"), C("Q", "s")];
    const handOff = [C("A", "s"), C("K", "s"), C("Q", "s")];
    const eqTrump = handEquity(handTrump, "s");
    const eqOff = handEquity(handOff, "h"); // none of the cards are trump
    expect(eqTrump).toBeGreaterThan(eqOff);
  });

  it("returns 0 for an all-low non-trump hand", () => {
    const hand = [C("2", "s"), C("3", "s"), C("4", "s")];
    expect(handEquity(hand, "h")).toBe(0);
  });
});

describe("botBid", () => {
  it("returns a bid in [0, tricksTotal]", () => {
    const hand = [C("A", "s"), C("K", "s"), C("Q", "h")];
    const bid = botBid({
      hand,
      trumpSuit: "s",
      personality: "mixed",
      tricksTotal: 3,
      isLast: false,
      restricted: null,
    });
    expect(bid).toBeGreaterThanOrEqual(0);
    expect(bid).toBeLessThanOrEqual(3);
  });

  it("aggressive personality bids ≥ cautious for the same hand", () => {
    const hand = [C("A", "s"), C("K", "s"), C("Q", "h"), C("J", "s"), C("T", "s")];
    const cautious = botBid({
      hand,
      trumpSuit: "s",
      personality: "cautious",
      tricksTotal: 5,
      isLast: false,
      restricted: null,
    });
    const aggressive = botBid({
      hand,
      trumpSuit: "s",
      personality: "aggressive",
      tricksTotal: 5,
      isLast: false,
      restricted: null,
    });
    expect(aggressive).toBeGreaterThanOrEqual(cautious);
  });

  it("avoids the restricted bid when isLast", () => {
    const hand = [C("A", "s"), C("K", "s"), C("Q", "s")];
    const bid = botBid({
      hand,
      trumpSuit: "s",
      personality: "mixed",
      tricksTotal: 3,
      isLast: true,
      restricted: 2, // we expect a value other than 2
    });
    expect(bid).not.toBe(2);
    expect(bid).toBeGreaterThanOrEqual(0);
    expect(bid).toBeLessThanOrEqual(3);
  });
});

describe("botPlay", () => {
  it("must follow suit if able", () => {
    const hand = [C("2", "h"), C("A", "s")];
    const card = botPlay({
      hand,
      currentTrick: [{ playerIdx: 0, card: C("3", "h") }],
      trumpSuit: "c",
      bid: 0,
      won: 0,
    });
    expect(card.s).toBe("h");
  });

  it("plays the smallest legal winning card when needing tricks", () => {
    const hand = [C("4", "h"), C("J", "h"), C("A", "h")];
    const card = botPlay({
      hand,
      currentTrick: [{ playerIdx: 0, card: C("9", "h") }],
      trumpSuit: "c",
      bid: 1,
      won: 0,
    });
    // Smallest card that beats 9h is Jh
    expect(card.r).toBe("J");
  });

  it("dumps high cards when not wanting more tricks", () => {
    const hand = [C("3", "h"), C("4", "h"), C("A", "h")];
    const card = botPlay({
      hand,
      currentTrick: [{ playerIdx: 0, card: C("K", "h") }],
      trumpSuit: "c",
      bid: 0,
      won: 0,
    });
    // None of the bot's cards beat K, so it plays its highest "loser" — A.
    // (Wait — A *would* beat K. Let's confirm semantics.)
    // Actually with second-card-wins on equal rank, A beats K, so A is in `beats`.
    // The non-beats are 3h and 4h. It dumps the highest of those: 4h.
    expect(card.r).toBe("4");
  });
});
