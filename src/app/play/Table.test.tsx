import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { humanSeatPos, seatPos } from "./tableLayout";
import { TableView } from "./Table";
import type { Card } from "@/lib/cards";
import type { GameState, Player } from "@/lib/game";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
}));

vi.mock("./BiddingDial", () => ({
  BiddingDial: () => null,
}));

const players: Player[] = [
  { id: "you", name: "You", isHuman: true, personality: "mixed" },
  { id: "bot1", name: "Margot", isHuman: false, personality: "mixed" },
  { id: "bot2", name: "Theodore", isHuman: false, personality: "mixed" },
];

const trump: Card = { r: "A", s: "s", d: 0, key: "As-0-test" };

function tableState(partial: Partial<GameState> = {}): GameState {
  return {
    players,
    decks: 2,
    tricksPerHand: 10,
    maxRounds: 10,
    phase: "playing",
    round: 1,
    dealerIdx: 2,
    history: [],
    hands: [[{ r: "K", s: "h", d: 0, key: "Kh-0-test" }], [], []],
    trumpCard: trump,
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

describe("seatPos", () => {
  it("keeps every seat evenly spaced around the full oval for 4 through 12 player tables", () => {
    for (let playerCount = 4; playerCount <= 12; playerCount += 1) {
      const humanSeat = humanSeatPos();
      const seats = Array.from({ length: playerCount - 1 }, (_, index) =>
        seatPos(index + 1, playerCount),
      );
      const topY = Math.min(...seats.map((seat) => seat.y));
      const topSeatIndex = seats.findIndex((seat) => seat.y === topY);
      const bottomLeft = seats[0];
      const bottomRight = seats.at(-1)!;

      expect(topSeatIndex).toBeGreaterThan(0);
      expect(topSeatIndex).toBeLessThan(seats.length - 1);
      expect(bottomLeft.x).toBeLessThan(humanSeat.x);
      expect(bottomRight.x).toBeGreaterThan(humanSeat.x);
      expect(bottomLeft.y).toBeGreaterThanOrEqual(50);
      expect(bottomRight.y).toBeGreaterThanOrEqual(50);
      expect(Math.abs(bottomLeft.y - bottomRight.y)).toBeLessThanOrEqual(0.1);

      for (let index = 1; index <= Math.floor(playerCount / 2) - 1; index += 1) {
        expect(seats[index].y).toBeLessThanOrEqual(seats[index - 1].y);
      }

      for (let index = Math.ceil(playerCount / 2); index < seats.length; index += 1) {
        expect(seats[index].y).toBeGreaterThanOrEqual(seats[index - 1].y);
      }
    }
  });

  it("places six-player top seats on the curve instead of one flat row", () => {
    const [, theodore, imani, kasper] = Array.from({ length: 5 }, (_, index) =>
      seatPos(index + 1, 6),
    );

    expect(theodore.y).toBeGreaterThan(imani.y);
    expect(kasper.y).toBeGreaterThan(imani.y);
    expect(Math.round(Math.abs(theodore.y - kasper.y) * 10) / 10).toBeLessThanOrEqual(0.1);
  });

  it("keeps the top seat close enough to read as part of the table oval", () => {
    const [, topSeat] = Array.from({ length: 3 }, (_, index) => seatPos(index + 1, 4));

    expect(topSeat.x).toBe(50);
    expect(topSeat.y).toBeGreaterThanOrEqual(12);
    expect(topSeat.y).toBeLessThanOrEqual(14);
  });

  it("places the human seat on the same oval rim path as the other seats", () => {
    const humanSeat = humanSeatPos();

    expect(humanSeat.zone).toBe("bottom");
    expect(humanSeat.x).toBe(50);
    expect(humanSeat.y).toBeGreaterThanOrEqual(88);
    expect(humanSeat.y).toBeLessThanOrEqual(90);
  });

  it("shows the compact hand label and a separate current bid total pill", () => {
    const { container } = render(<TableView state={tableState()} />);

    expect(container.querySelector(".gb-felt > .gb-seat-human")).toBeInTheDocument();
    expect(container.querySelector(".gb-hero > .gb-hero-meta")).not.toBeInTheDocument();

    const hudPills = Array.from(container.querySelectorAll(".gb-hud-pill"));
    const handPill = hudPills.find((pill) => pill.textContent?.includes("Hand"));
    const bidPill = hudPills.find((pill) => pill.textContent?.includes("Total Bids"));
    const cardsPill = hudPills.find((pill) => pill.textContent?.includes("Total Cards Played"));

    expect(handPill).toHaveTextContent("Hand");
    expect(handPill).toHaveTextContent("1/10");
    expect(handPill).not.toHaveTextContent("bid total");
    expect(bidPill).toHaveTextContent("Total Bids");
    expect(bidPill).toHaveTextContent("1");
    expect(cardsPill).toHaveTextContent("Total Cards Played");
    expect(cardsPill).toHaveTextContent("0/1");
    expect(screen.queryByText(/1 card/)).not.toBeInTheDocument();
  });

  it("does not duplicate bid totals in the table center while bidding", () => {
    const { container } = render(
      <TableView state={tableState({ phase: "bidding", bids: [null, 0, 0] })} />,
    );

    expect(container.querySelector(".gb-bid-tally")).not.toBeInTheDocument();
    expect(container.querySelector(".gb-center-meta")).not.toBeInTheDocument();
  });
});
