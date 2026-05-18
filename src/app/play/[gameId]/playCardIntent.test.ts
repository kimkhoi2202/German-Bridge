import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/cards";
import type { GameState, Player } from "@/lib/game";
import {
  canKeepPreMoveIntent,
  canQueuePreMoveIntent,
  canSendPlayCardIntent,
} from "./playCardIntent";

const aceSpades: Card = { r: "A", s: "s", d: 0, key: "As-0" };
const kingHearts: Card = { r: "K", s: "h", d: 0, key: "Kh-0" };

const players: Player[] = [
  { id: "you", name: "You", isHuman: true, personality: "mixed" },
  { id: "bot1", name: "Margot", isHuman: false, personality: "mixed" },
  { id: "bot2", name: "Theodore", isHuman: false, personality: "mixed" },
];

function playingState(partial: Partial<GameState> = {}): GameState {
  return {
    players,
    decks: 1,
    tricksPerHand: 1,
    maxRounds: 1,
    phase: "playing",
    round: 1,
    dealerIdx: 2,
    history: [],
    hands: [[aceSpades, kingHearts], [], []],
    trumpCard: { r: "2", s: "c", d: 0, key: "2c-0" },
    tricksTotal: 1,
    bids: [0, 1, 0],
    bidTurn: 0,
    won: [0, 0, 0],
    trickIdx: 0,
    currentTrick: [],
    playLog: [],
    leadIdx: 0,
    turnIdx: 0,
    trickWinner: null,
    ...partial,
  };
}

describe("canSendPlayCardIntent", () => {
  it("allows a legal human card play when the watched state says it is your turn", () => {
    expect(
      canSendPlayCardIntent({
        state: playingState(),
        legalCardKeys: [aceSpades.key, kingHearts.key],
        card: aceSpades,
        isPlayInFlight: false,
      }),
    ).toBe(true);
  });

  it("ignores card taps outside the playing phase", () => {
    expect(
      canSendPlayCardIntent({
        state: playingState({ phase: "bidding" }),
        legalCardKeys: [aceSpades.key],
        card: aceSpades,
        isPlayInFlight: false,
      }),
    ).toBe(false);
  });

  it("ignores out-of-turn left taps", () => {
    expect(
      canSendPlayCardIntent({
        state: playingState({ turnIdx: 1 }),
        legalCardKeys: [],
        card: aceSpades,
        isPlayInFlight: false,
      }),
    ).toBe(false);
  });

  it("ignores duplicate card taps while a play is already in flight", () => {
    expect(
      canSendPlayCardIntent({
        state: playingState(),
        legalCardKeys: [aceSpades.key],
        card: aceSpades,
        isPlayInFlight: true,
      }),
    ).toBe(false);
  });

  it("ignores stale or illegal card taps", () => {
    expect(
      canSendPlayCardIntent({
        state: playingState(),
        legalCardKeys: [kingHearts.key],
        card: aceSpades,
        isPlayInFlight: false,
      }),
    ).toBe(false);

    expect(
      canSendPlayCardIntent({
        state: playingState({ hands: [[kingHearts], [], []] }),
        legalCardKeys: [aceSpades.key],
        card: aceSpades,
        isPlayInFlight: false,
      }),
    ).toBe(false);
  });
});

describe("canQueuePreMoveIntent", () => {
  it("does not queue a pre-move before the lead suit is known", () => {
    expect(
      canQueuePreMoveIntent({
        state: playingState({ turnIdx: 1, currentTrick: [] }),
        card: aceSpades,
        isPlayInFlight: false,
      }),
    ).toBe(false);
  });

  it("queues an out-of-turn legal follow-suit card after the first card is led", () => {
    expect(
      canQueuePreMoveIntent({
        state: playingState({
          turnIdx: 2,
          currentTrick: [{ playerIdx: 1, card: kingHearts }],
        }),
        card: kingHearts,
        isPlayInFlight: false,
      }),
    ).toBe(true);
  });

  it("rejects an illegal off-suit pre-move when the viewer can follow suit", () => {
    expect(
      canQueuePreMoveIntent({
        state: playingState({
          turnIdx: 2,
          currentTrick: [{ playerIdx: 1, card: kingHearts }],
        }),
        card: aceSpades,
        isPlayInFlight: false,
      }),
    ).toBe(false);
  });

  it("keeps the selected pre-move through the handoff to the viewer turn", () => {
    const state = playingState({
      turnIdx: 0,
      currentTrick: [{ playerIdx: 1, card: kingHearts }],
    });

    expect(canKeepPreMoveIntent({ state, cardKey: kingHearts.key })).toBe(true);
    expect(
      canSendPlayCardIntent({
        state,
        legalCardKeys: [kingHearts.key],
        card: kingHearts,
        isPlayInFlight: false,
      }),
    ).toBe(true);
  });
});
