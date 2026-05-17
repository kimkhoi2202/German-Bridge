import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoundSummary } from "./RoundSummary";
import type { Card } from "@/lib/cards";
import type { GameState, Player } from "@/lib/game";

const players: Player[] = [
  { id: "ada", name: "Ada", isHuman: true, personality: "mixed" },
  { id: "ben", name: "Ben", isHuman: false, personality: "mixed" },
  { id: "cora", name: "Cora", isHuman: false, personality: "mixed" },
  { id: "dax", name: "Dax", isHuman: false, personality: "mixed" },
];

const trump: Card = { r: "A", s: "s", d: 0, key: "As-0-test" };

function roundEndState(): GameState {
  return {
    players,
    decks: 1,
    tricksPerHand: 2,
    maxRounds: 2,
    phase: "round-end",
    round: 2,
    dealerIdx: 0,
    history: [
      {
        round: 1,
        trump,
        bids: [1, 1, 0, 0],
        won: [1, 1, 1, 0],
        scores: [10, 20, 10, 6],
        dealerIdx: 0,
      },
      {
        round: 2,
        trump,
        bids: [1, 2, 3, 1],
        won: [1, 2, 3, 0],
        scores: [12, 20, 30, -1],
        dealerIdx: 1,
      },
    ],
    hands: [[], [], [], []],
    trumpCard: trump,
    tricksTotal: 2,
    bids: [1, 2, 3, 1],
    bidTurn: 0,
    won: [1, 2, 3, 0],
    trickIdx: 2,
    currentTrick: [],
    playLog: [],
    leadIdx: 0,
    turnIdx: 0,
    trickWinner: null,
  };
}

describe("RoundSummary", () => {
  it("sorts the updated leaderboard from highest total score to lowest", () => {
    const { container } = render(
      <RoundSummary state={roundEndState()} onAdvance={() => undefined} />,
    );

    const rows = Array.from(container.querySelectorAll(".gb-summary-row"));

    expect(rows).toHaveLength(4);
    expect(within(rows[0] as HTMLElement).getByText("Ben")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("bid 2");
    expect(rows[0]).toHaveTextContent("took 2");
    expect(rows[0]).toHaveTextContent("+20");
    expect(rows[0]).toHaveTextContent("→ 40");

    expect(within(rows[1] as HTMLElement).getByText("Cora")).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("→ 40");

    expect(within(rows[2] as HTMLElement).getByText("Ada")).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent("→ 22");

    expect(within(rows[3] as HTMLElement).getByText("Dax")).toBeInTheDocument();
    expect(rows[3]).toHaveTextContent("→ 5");
  });
});
