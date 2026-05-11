import { describe, expect, it } from "vitest";
import {
  buildShoe,
  legalCards,
  maxTricks,
  rankVal,
  shuffle,
  sortHand,
  type Card,
} from "./cards";

const C = (r: string, s: string, d = 0): Card => ({
  r: r as Card["r"],
  s: s as Card["s"],
  d,
  key: `${r}${s}-${d}-test`,
});

describe("rankVal", () => {
  it("orders 2 → A monotonically", () => {
    expect(rankVal("2")).toBe(0);
    expect(rankVal("A")).toBe(12);
    expect(rankVal("K")).toBe(11);
    expect(rankVal("T")).toBeLessThan(rankVal("J"));
  });
});

describe("buildShoe", () => {
  it("builds 52 cards for one deck", () => {
    expect(buildShoe(1)).toHaveLength(52);
  });
  it("builds 156 cards for three decks", () => {
    expect(buildShoe(3)).toHaveLength(156);
  });
  it("assigns unique keys to every card", () => {
    const shoe = buildShoe(4);
    const keys = new Set(shoe.map((c) => c.key));
    expect(keys.size).toBe(shoe.length);
  });
  it("tags each card with its deck index", () => {
    const shoe = buildShoe(2);
    const aceSpades = shoe.filter((c) => c.r === "A" && c.s === "s");
    expect(aceSpades).toHaveLength(2);
    expect(aceSpades.map((c) => c.d).sort()).toEqual([0, 1]);
  });
});

describe("maxTricks", () => {
  it("reserves one card for trump", () => {
    // 1 deck, 4 players: floor(51/4) = 12
    expect(maxTricks(4, 1)).toBe(12);
    // 1 deck, 3 players: floor(51/3) = 17
    expect(maxTricks(3, 1)).toBe(17);
    // 2 decks, 7 players: floor(103/7) = 14
    expect(maxTricks(7, 2)).toBe(14);
  });
  it("returns zero when impossible (e.g. 1 deck, 99 players)", () => {
    expect(maxTricks(99, 1)).toBe(0);
  });
});

describe("shuffle", () => {
  it("preserves length and contents", () => {
    const shoe = buildShoe(1);
    const shuffled = shuffle(shoe);
    expect(shuffled).toHaveLength(shoe.length);
    expect(new Set(shuffled.map((c) => c.key))).toEqual(new Set(shoe.map((c) => c.key)));
  });
  it("does not mutate the input", () => {
    const shoe = buildShoe(1);
    const before = [...shoe];
    shuffle(shoe);
    expect(shoe).toEqual(before);
  });
  it("is deterministic with a seeded rng", () => {
    let n = 0;
    const rng = () => ((n = (n + 0.1234567) % 1), n);
    const a = shuffle(buildShoe(1), rng);
    n = 0;
    const b = shuffle(buildShoe(1), rng);
    expect(a.map((c) => c.key)).toEqual(b.map((c) => c.key));
  });
});

describe("sortHand", () => {
  it("places trumps first, then high → low within suit", () => {
    const hand: Card[] = [C("3", "h"), C("A", "s"), C("Q", "h"), C("2", "s"), C("K", "s")];
    const sorted = sortHand(hand, "s");
    expect(sorted.map((c) => `${c.r}${c.s}`)).toEqual(["As", "Ks", "2s", "Qh", "3h"]);
  });
  it("works with no trump", () => {
    const hand: Card[] = [C("3", "h"), C("A", "s")];
    const sorted = sortHand(hand, null);
    expect(sorted).toHaveLength(2);
  });
});

describe("legalCards", () => {
  it("returns full hand when no card has been led", () => {
    const hand: Card[] = [C("3", "h"), C("A", "s")];
    expect(legalCards(hand, null)).toEqual(hand);
  });
  it("returns only lead-suit cards if any are held", () => {
    const hand: Card[] = [C("3", "h"), C("A", "s"), C("Q", "h")];
    expect(legalCards(hand, "h")).toEqual([C("3", "h"), C("Q", "h")]);
  });
  it("returns the full hand when none of the lead suit is held", () => {
    const hand: Card[] = [C("3", "h"), C("A", "s")];
    expect(legalCards(hand, "c")).toEqual(hand);
  });
});
