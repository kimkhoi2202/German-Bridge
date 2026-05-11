import { describe, expect, it } from "vitest";
import { chooseBid, chooseCard } from "./bot";
import { type Card } from "./cards";
import { createObservation, legalBidsFor, legalCardsFor } from "./botObservation";
import { initialState, startRound, type GameState, type Player } from "./game";

const C = (r: string, s: string, d = 0, suffix = "test"): Card => ({
  r: r as Card["r"],
  s: s as Card["s"],
  d,
  key: `${r}${s}-${d}-${suffix}`,
});

function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    isHuman: i === 0,
    personality: i % 3 === 0 ? "aggressive" : i % 3 === 1 ? "mixed" : "cautious",
  }));
}

function twoDeckState(): GameState {
  const state = initialState({
    players: players(4),
    decks: 2,
    tricksPerHand: 5,
    maxRounds: 1,
  });
  return { ...startRound(state, seededRng(2026)), phase: "bidding" };
}

describe("createObservation", () => {
  it("exposes only own hand plus public state, not hidden opponent cards", () => {
    const state = twoDeckState();
    const hidden = state.hands[2][0];
    const observation = createObservation(state, 1);
    const serialized = JSON.stringify(observation);

    expect(serialized).toContain(state.hands[1][0].key);
    expect(serialized).not.toContain(hidden.key);
    expect(observation.remainingHandCounts).toEqual([5, 5, 5, 5]);
  });

  it("keeps bid choices stable when hidden hands change behind the same public state", () => {
    const state = twoDeckState();
    const changedHidden: GameState = {
      ...state,
      hands: state.hands.map((hand, idx) =>
        idx === 2
          ? hand.map((_, i) => C("A", i % 2 === 0 ? "s" : "h", i % 2, `secret-${i}`))
          : hand,
      ),
    };

    expect(chooseBid(createObservation(changedHidden, 1))).toBe(
      chooseBid(createObservation(state, 1)),
    );
  });

  it("keeps card choices stable when hidden hands change behind the same public trick", () => {
    const base = twoDeckState();
    const state: GameState = {
      ...base,
      phase: "playing",
      bids: [1, 2, 0, 1],
      won: [0, 0, 0, 0],
      turnIdx: 1,
      currentTrick: [{ playerIdx: 0, card: C("9", "h", 0, "lead") }],
      playLog: [{ trick: 1, order: 1, playerIdx: 0, card: C("9", "h", 0, "lead") }],
      hands: [
        [C("2", "s", 0, "p0")],
        [C("J", "h", 0, "own-a"), C("3", "h", 1, "own-b"), C("A", "s", 0, "own-c")],
        [C("A", "c", 0, "hidden-a"), C("K", "c", 0, "hidden-b")],
        [C("Q", "d", 0, "hidden-c"), C("T", "d", 0, "hidden-d")],
      ],
    };
    const changedHidden: GameState = {
      ...state,
      hands: state.hands.map((hand, idx) =>
        idx === 2 ? [C("2", "d", 0, "secret-a"), C("3", "d", 0, "secret-b")] : hand,
      ),
    };

    expect(chooseCard(createObservation(changedHidden, 1)).key).toBe(
      chooseCard(createObservation(state, 1)).key,
    );
  });

  it("returns legal bid and card masks from public turn state", () => {
    const state: GameState = {
      ...twoDeckState(),
      bids: [1, 2, 1, null],
      bidTurn: 3,
    };
    expect(legalBidsFor(state, 3)).not.toContain(1);

    const playing: GameState = {
      ...state,
      phase: "playing",
      turnIdx: 1,
      currentTrick: [{ playerIdx: 0, card: C("7", "c", 0, "lead") }],
      hands: [
        [],
        [C("A", "s", 0, "own-a"), C("2", "c", 0, "own-b")],
        [],
        [],
      ],
    };
    expect(legalCardsFor(playing, 1).map((card) => card.s)).toEqual(["c"]);
  });
});
