import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BiddingDial } from "./BiddingDial";
import { useMatch } from "@/store/match";
import type { GameState, Player } from "@/lib/game";

const players: Player[] = [
  { id: "you", name: "You", isHuman: true, personality: "mixed" },
  { id: "bot1", name: "Margot", isHuman: false, personality: "mixed" },
  { id: "bot2", name: "Theodore", isHuman: false, personality: "mixed" },
];

function biddingState(partial: Partial<GameState> = {}): GameState {
  return {
    players,
    decks: 1,
    tricksPerHand: 2,
    maxRounds: 1,
    phase: "bidding",
    round: 1,
    dealerIdx: 2,
    history: [],
    hands: [[], [], []],
    trumpCard: { r: "A", s: "s", d: 0, key: "As-0-test" },
    tricksTotal: 2,
    bids: [null, 1, 1],
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

beforeEach(() => {
  useMatch.setState({ state: null, archive: [] });
  localStorage.clear();
});

describe("BiddingDial", () => {
  it("keeps the last-bidder restricted value disabled and selects a legal fallback", () => {
    useMatch.setState({ state: biddingState() });

    render(<BiddingDial />);

    const restrictedBid = screen.getByRole("button", {
      name: "Bid 0 unavailable; total cannot equal tricks",
    });
    expect(restrictedBid).toBeDisabled();
    expect(restrictedBid).toHaveAttribute("title", "Total can't equal tricks");
    expect(screen.getByRole("button", { name: "Bid 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Bid" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your bid" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place bid" })).not.toBeDisabled();
  });

  it("is visible during bidding even when it's not the human player's turn", () => {
    useMatch.setState({
      state: biddingState({
        bidTurn: 1,
        players: [
          { id: "you", name: "You", isHuman: true, personality: "mixed" },
          { id: "bot1", name: "Margot", isHuman: false, personality: "mixed" },
          { id: "bot2", name: "Theodore", isHuman: false, personality: "mixed" },
        ],
      }),
    });

    render(<BiddingDial />);

    expect(screen.getByRole("heading", { name: "Bid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place bid" })).toBeDisabled();
  });

  it("does not enable bidding for another human seat in a live-room view", () => {
    useMatch.setState({
      state: biddingState({
        bidTurn: 1,
        bids: [0, null, 1],
        players: [
          { id: "you", name: "You", isHuman: true, personality: "mixed" },
          { id: "guest", name: "Guest", isHuman: true, personality: "mixed" },
          { id: "bot2", name: "Theodore", isHuman: false, personality: "mixed" },
        ],
      }),
    });

    render(<BiddingDial />);

    expect(screen.getByRole("heading", { name: "Bid" })).toBeInTheDocument();
    expect(screen.getByText("Waiting for your turn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bid 2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Place bid" })).toBeDisabled();
  });
});
