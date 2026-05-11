import { describe, expect, it } from "vitest";
import { resolveTrick, type Play } from "./trick";
import type { Card } from "./cards";

const C = (r: string, s: string, d = 0): Card => ({
  r: r as Card["r"],
  s: s as Card["s"],
  d,
  key: `${r}${s}-${d}-test`,
});

const P = (playerIdx: number, card: Card): Play => ({ playerIdx, card });

describe("resolveTrick — second-card-wins on ties", () => {
  it("two A♠ in same trick, second wins (the user's rule)", () => {
    const trick = [P(0, C("A", "s", 0)), P(1, C("A", "s", 1))];
    expect(resolveTrick(trick, "s", "s").playerIdx).toBe(1);
  });

  it("9, 8, 9, 5 all hearts, lead hearts → 3rd player wins (second 9)", () => {
    const trick = [
      P(0, C("9", "h", 0)),
      P(1, C("8", "h", 0)),
      P(2, C("9", "h", 1)),
      P(3, C("5", "h", 0)),
    ];
    expect(resolveTrick(trick, "h", "c").playerIdx).toBe(2);
  });

  it("the same rank rule applies for non-aces", () => {
    const trick = [P(0, C("7", "d", 0)), P(1, C("7", "d", 1))];
    expect(resolveTrick(trick, "d", "s").playerIdx).toBe(1);
  });
});

describe("resolveTrick — basic priority", () => {
  it("trump beats lead suit", () => {
    const trick = [P(0, C("A", "h", 0)), P(1, C("2", "s", 0))];
    expect(resolveTrick(trick, "h", "s").playerIdx).toBe(1);
  });

  it("a lower card after the winner does not take it", () => {
    const trick = [P(0, C("A", "h", 0)), P(1, C("2", "h", 0))];
    expect(resolveTrick(trick, "h", "c").playerIdx).toBe(0);
  });

  it("highest of lead suit wins when no trump is played", () => {
    const trick = [
      P(0, C("3", "h", 0)),
      P(1, C("A", "h", 0)),
      P(2, C("K", "h", 0)),
    ];
    expect(resolveTrick(trick, "h", "c").playerIdx).toBe(1);
  });

  it("off-suit non-trump cards never win", () => {
    const trick = [
      P(0, C("3", "h", 0)),
      P(1, C("A", "d", 0)), // off-suit, no trump match
      P(2, C("4", "h", 0)),
    ];
    expect(resolveTrick(trick, "h", "s").playerIdx).toBe(2);
  });

  it("works with no trump at all (null)", () => {
    const trick = [
      P(0, C("A", "s", 0)),
      P(1, C("K", "s", 0)),
    ];
    expect(resolveTrick(trick, "s", null).playerIdx).toBe(0);
  });
});
