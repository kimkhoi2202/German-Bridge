import { describe, expect, it } from "vitest";
import { sanitizeSettings } from "./settings";

describe("settings hardening", () => {
  it("migrates old themes and clamps persisted defaults", () => {
    const sanitized = sanitizeSettings({
      theme: "studio" as never,
      cardBack: "unknown" as never,
      layout: "wide" as never,
      showTrumpHints: "yes" as never,
      animations: false,
      defaultPlayers: 99,
      defaultDecks: 99,
      defaultTricksPerHand: 999,
      defaultBotMood: "wild" as never,
      playerName: "  Mina\nHarker  ",
    });

    expect(sanitized.theme).toBe("graphite");
    expect(sanitized.cardBack).toBe("classic");
    expect(sanitized.layout).toBe("salon");
    expect(sanitized.showTrumpHints).toBe(true);
    expect(sanitized.animations).toBe(false);
    expect(sanitized.defaultPlayers).toBe(12);
    expect(sanitized.defaultDecks).toBe(4);
    expect(sanitized.defaultTricksPerHand).toBe(17);
    expect(sanitized.defaultBotMood).toBe("mixed");
    expect(sanitized.playerName).toBe("Mina Harker");
  });
});
