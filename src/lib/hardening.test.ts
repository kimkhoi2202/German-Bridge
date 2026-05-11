import { describe, expect, it } from "vitest";
import {
  clampDecks,
  clampPlayers,
  clampTricksPerHand,
  finiteNumberArray,
  isCard,
  sanitizeBotOverrides,
  sanitizePersonality,
  sanitizePlayerName,
} from "./hardening";

describe("hardening helpers", () => {
  it("clamps match inputs to supported game bounds", () => {
    expect(clampPlayers(99)).toBe(12);
    expect(clampPlayers(1)).toBe(3);
    expect(clampDecks(99)).toBe(4);
    expect(clampTricksPerHand(40, 4, 1)).toBe(12);
    expect(clampTricksPerHand("2", 4, 1)).toBe(2);
  });

  it("normalizes player names without letting empty or huge values leak into the UI", () => {
    expect(sanitizePlayerName("  Ada\nLovelace  ")).toBe("Ada Lovelace");
    expect(sanitizePlayerName("")).toBe("You");
    expect(sanitizePlayerName("abcdefghijklmnopqrstuvwxy")).toBe("abcdefghijklmnopqrstuvwx");
  });

  it("sanitizes bot personalities and numeric arrays", () => {
    expect(sanitizePersonality("wild")).toBe("mixed");
    expect(sanitizeBotOverrides(["aggressive", "wild", null], 3)).toEqual([
      "aggressive",
      null,
      null,
    ]);
    expect(finiteNumberArray([1, Number.NaN, "3"], 4, -1)).toEqual([1, -1, -1, -1]);
  });

  it("recognizes only real card-shaped objects", () => {
    expect(isCard({ r: "A", s: "s", d: 0, key: "As-0" })).toBe(true);
    expect(isCard({ r: "1", s: "s", d: 0, key: "bad" })).toBe(false);
  });
});
