import { describe, expect, it } from "vitest";
import { createRolloutSearchPolicy } from "./policies";
import { replayableSummary, runHeadlessMatch } from "./headless";
import { runBaselineTournament } from "./tournament";

describe("headless AI simulator", () => {
  it("runs a deterministic 2-deck training match with replay-friendly logs", () => {
    const first = runHeadlessMatch({
      playerCount: 6,
      decks: 2,
      tricksPerHand: 5,
      maxRounds: 2,
      seed: "training-smoke",
    });
    const second = runHeadlessMatch({
      playerCount: 6,
      decks: 2,
      tricksPerHand: 5,
      maxRounds: 2,
      seed: "training-smoke",
    });

    expect(replayableSummary(first)).toEqual(replayableSummary(second));
    expect(first.rounds).toHaveLength(2);
    expect(first.plays).toHaveLength(6 * 5 * 2);
    expect(first.bids).toHaveLength(6 * 2);
    expect(first.finalState.phase).toBe("match-end");
    first.rounds.forEach((round) => {
      expect(round.won.reduce((sum, won) => sum + won, 0)).toBe(5);
      expect(round.scores).toHaveLength(6);
    });
  });

  it("supports 4-12 players in 2-deck training configs with variable tricks per hand", () => {
    for (const playerCount of [4, 8, 12]) {
      const result = runHeadlessMatch({
        playerCount,
        decks: 2,
        tricksPerHand: playerCount === 12 ? 4 : 7,
        seed: `players-${playerCount}`,
      });
      expect(result.config.playerCount).toBe(playerCount);
      expect(result.config.decks).toBe(2);
      expect(result.rounds[0].won.reduce((sum, won) => sum + won, 0)).toBe(
        result.config.tricksPerHand,
      );
    }
  });

  it("rejects non-2-deck training configs for the current roadmap target", () => {
    expect(() =>
      runHeadlessMatch({
        playerCount: 4,
        decks: 1,
        tricksPerHand: 3,
      }),
    ).toThrow("Training decks must be exactly 2");
  });

  it("can run a baseline tournament and aggregate standings", () => {
    const tournament = runBaselineTournament({
      playerCount: 4,
      decks: 2,
      tricksPerHand: 4,
      matches: 3,
      seed: "baseline-cup",
    });
    expect(tournament.matches).toHaveLength(3);
    expect(tournament.standings).toHaveLength(4);
    expect(tournament.standings.reduce((sum, row) => sum + row.wins, 0)).toBe(3);
  });

  it("accepts a light rollout-search policy in the headless runner", () => {
    const search = createRolloutSearchPolicy({ rolloutsPerMove: 2, depthTricks: 1 });
    const result = runHeadlessMatch({
      playerCount: 4,
      decks: 2,
      tricksPerHand: 3,
      seed: "rollout-smoke",
      policyByPlayer: [search],
    });
    expect(result.policyIds[0]).toContain("rollout");
    expect(result.finalState.phase).toBe("match-end");
    expect(result.rounds).toHaveLength(1);
  });
});
