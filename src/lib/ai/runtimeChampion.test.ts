import { describe, expect, it } from "vitest";
import type { Card } from "../cards";
import { createObservation } from "../botObservation";
import { initialState, startRound, type GameState, type Player } from "../game";
import {
  chooseRuntimeBotBid,
  chooseRuntimeBotBidWithTrace,
  chooseRuntimeBotCard,
  runtimeChampionPolicyId,
} from "./runtimeChampion";
import { createSeededRng } from "./rng";

const C = (r: string, s: string, d = 0, suffix = "runtime"): Card => ({
  r: r as Card["r"],
  s: s as Card["s"],
  d,
  key: `${r}${s}-${d}-${suffix}`,
});

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    isHuman: i === 0,
    personality: i === 1 ? "champion" : "mixed",
  }));
}

describe("runtime champion bot", () => {
  it("chooses legal bids through the playable champion policy", () => {
    const initial = initialState({
      players: players(4),
      decks: 2,
      tricksPerHand: 4,
      maxRounds: 4,
    });
    const dealt = startRound({ ...initial, round: 3 }, createSeededRng("runtime-bid").next);
    const state: GameState = {
      ...dealt,
      phase: "bidding",
      bids: [null, null, null, null],
      bidTurn: 1,
    };

    const bid = chooseRuntimeBotBid(state, 1);

    expect(createObservation(state, 1).legalBids).toContain(bid);
  });

  it("scores champion bids with the runtime rollout policy instead of the raw snapshot only", () => {
    const initial = initialState({
      players: players(4),
      decks: 2,
      tricksPerHand: 5,
      maxRounds: 5,
    });
    const dealt = startRound({ ...initial, round: 4 }, createSeededRng("runtime-bid-trace").next);
    const state: GameState = {
      ...dealt,
      phase: "bidding",
      bids: [1, null, null, null],
      bidTurn: 1,
    };

    const decision = chooseRuntimeBotBidWithTrace(state, 1);

    expect(createObservation(state, 1).legalBids).toContain(decision.action);
    expect(decision.trace.policyId).toBe(runtimeChampionPolicyId);
    expect(decision.trace.requestedPolicyId).toMatch(/^champion:/);
    expect(decision.trace.legalActions.length).toBeGreaterThan(1);
    expect(decision.trace.heuristic).toMatchObject({
      bidRolloutsPerCandidate: 4,
      utilityMode: "scored",
    });
  });

  it("does not let hidden opponent cards influence champion runtime play decisions", () => {
    const initial = initialState({
      players: players(4),
      decks: 2,
      tricksPerHand: 4,
      maxRounds: 4,
    });
    const dealt = startRound({ ...initial, round: 3 }, createSeededRng("runtime-play").next);
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

    const first = chooseRuntimeBotCard(state, 1);
    const second = chooseRuntimeBotCard(changedHidden, 1);

    expect(second.key).toBe(first.key);
  });
});
