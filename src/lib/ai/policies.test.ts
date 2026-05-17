import { describe, expect, it } from "vitest";
import { type Card } from "../cards";
import { createObservation } from "../botObservation";
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
      maxRounds: 4,
    });
    const dealt = startRound({ ...initial, round: 3 }, createSeededRng("policy-no-cheat").next);
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

  it("exposes rollout scores for legal card actions", () => {
    const initial = initialState({
      players: players(4),
      decks: 2,
      tricksPerHand: 4,
      maxRounds: 4,
    });
    const dealt = startRound({ ...initial, round: 3 }, createSeededRng("policy-score-actions").next);
    const state: GameState = {
      ...dealt,
      phase: "playing",
      bids: [1, 2, 1, 0],
      won: [0, 0, 0, 0],
      turnIdx: 1,
      currentTrick: [],
      playLog: [],
    };
    const policy = createRolloutSearchPolicy({ rolloutsPerMove: 2, depthTricks: 1 });
    const scored = policy.scorePlayActions?.({
      state,
      playerIdx: 1,
      rng: createSeededRng("same-score-rollout"),
    });
    const selected = policy.play({
      state,
      playerIdx: 1,
      rng: createSeededRng("same-score-rollout"),
    });

    expect(scored?.length).toBe(createObservation(state, 1).legalCards.length);
    expect(scored?.[0]?.action.key).toBe(selected.key);
    expect(scored?.every((entry) => Number.isFinite(entry.score))).toBe(true);
  });

  it("can search bids without reading hidden opponent cards", () => {
    const initial = initialState({
      players: players(4),
      decks: 2,
      tricksPerHand: 4,
      maxRounds: 4,
    });
    const dealt = startRound({ ...initial, round: 3 }, createSeededRng("bid-policy-no-cheat").next);
    const state: GameState = {
      ...dealt,
      phase: "bidding",
      bids: [null, null, null, null],
      bidTurn: 1,
    };
    const changedHidden: GameState = {
      ...state,
      hands: state.hands.map((hand, idx) =>
        idx === 1
          ? hand
          : hand.map((_, cardIdx) =>
              C(
                cardIdx % 2 === 0 ? "K" : "4",
                idx % 2 === 0 ? "h" : "c",
                cardIdx % 2,
                `bid-hidden-${idx}-${cardIdx}`,
              ),
            ),
      ),
    };
    const policy = createRolloutSearchPolicy({
      rolloutsPerMove: 0,
      bidRolloutsPerCandidate: 2,
      bidDepthTricks: 1,
      depthTricks: 1,
    });
    const first = policy.bid({
      state,
      playerIdx: 1,
      rng: createSeededRng("same-bid-rollout"),
    });
    const second = policy.bid({
      state: changedHidden,
      playerIdx: 1,
      rng: createSeededRng("same-bid-rollout"),
    });

    expect(createObservation(state, 1).legalBids).toContain(first);
    expect(second).toBe(first);
  });
});
