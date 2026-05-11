import { describe, expect, it } from "vitest";
import { describeScore, score } from "./scoring";

describe("score", () => {
  it("awards 10 + n² when bid is hit", () => {
    expect(score(0, 0)).toBe(10);
    expect(score(1, 1)).toBe(11);
    expect(score(3, 3)).toBe(19);
    expect(score(5, 5)).toBe(35);
  });
  it("awards −d² when bid is missed (overshoot)", () => {
    expect(score(2, 4)).toBe(-4);
    expect(score(0, 2)).toBe(-4);
    expect(score(0, 5)).toBe(-25);
  });
  it("awards −d² when bid is missed (undershoot)", () => {
    expect(score(4, 2)).toBe(-4);
    expect(score(5, 0)).toBe(-25);
    expect(score(7, 1)).toBe(-36);
  });
  it("treats bid 0, won 0 as a successful bid", () => {
    expect(score(0, 0)).toBe(10);
  });
});

describe("describeScore", () => {
  it("formats the made/missed expression", () => {
    expect(describeScore(3, 3)).toBe("10 + 3² = 19");
    expect(describeScore(4, 2)).toBe("−2² = -4");
  });
});
