import { describe, expect, it } from "vitest";
import { type Card } from "../cards";
import { initialState, startRound, type GameState, type Player } from "../game";
import { createSeededRng } from "./rng";
import { createRolloutSearchPolicy } from "./policies";

const C = (r: string, s: string, d = 0, suffix = "test"): Card => ({
  r: r as Card["r"],
  s: s as Card["s"],
  d,
  key: `${r}${s}-${d}-${suffix}`,
});

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    isHuman: false,
    personality: "mixed",
  }));
}

describe("rollout policy", () => {
  it("does not change its decision when only hidden opponent cards change", () => {
    const initial = initialState({
      players: players(4),
      decks: 2,
      tricksPerHand: 4,
      maxRounds: 1,
    });
    const dealt = startRound(initial, createSeededRng("policy-no-cheat").next);
    const state: GameState = {
      ...dealt,
      phase: "playing",
      bids: [1, 2, 1, 0],
      won: [0, 0, 0, 0],
      turnIdx: 1,
      currentTrick: [],
      playLog: [],
    };
    const changedHidden: GameState = {
      ...state,
      hands: state.hands.map((hand, idx) =>
        idx === 1
          ? hand
          : hand.map((_, cardIdx) =>
              C(
                cardIdx % 2 === 0 ? "A" : "2",
                idx % 2 === 0 ? "s" : "d",
                cardIdx % 2,
                `hidden-${idx}-${cardIdx}`,
              ),
            ),
      ),
    };
    const policy = createRolloutSearchPolicy({ rolloutsPerMove: 3, depthTricks: 1 });
    const first = policy.play({
      state,
      playerIdx: 1,
      rng: createSeededRng("same-rollout"),
    });
    const second = policy.play({
      state: changedHidden,
      playerIdx: 1,
      rng: createSeededRng("same-rollout"),
    });

    expect(second.key).toBe(first.key);
  });
});
