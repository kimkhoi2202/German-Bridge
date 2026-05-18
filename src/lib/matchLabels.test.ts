import { describe, expect, it } from "vitest";
import { formatHandLadder } from "./matchLabels";

describe("formatHandLadder", () => {
  it("labels the configured starting and max hand sizes", () => {
    expect(formatHandLadder(10, 10)).toBe("hands 1-10");
  });

  it("labels a custom starting hand size", () => {
    expect(formatHandLadder(10, 6, 5)).toBe("hands 5-10");
  });

  it("does not replace the range with a round count", () => {
    expect(formatHandLadder(10, 3, 1)).toBe("hands 1-10");
  });

  it("keeps the range shape when the start and max match", () => {
    expect(formatHandLadder(3, 1, 3)).toBe("hands 3-3");
  });
});
