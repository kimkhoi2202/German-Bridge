import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("starts with no selected bid and keeps the restricted value disabled", () => {
    useMatch.setState({ state: biddingState() });

    render(<BiddingDial />);

    const restrictedBid = screen.getByRole("button", {
      name: "Bid 0 unavailable; total bids cannot equal total cards",
    });
    expect(restrictedBid).toBeDisabled();
    expect(restrictedBid).toHaveAttribute("title", "Total bids can't equal total cards");
    expect(screen.getByRole("button", { name: "Bid 1" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Bid 2" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { name: "Your bid" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bid" })).not.toBeInTheDocument();
    expect(screen.getByText("Total bids: 2")).toBeInTheDocument();
    expect(screen.queryByText("2 bids total so far")).not.toBeInTheDocument();
    expect(screen.queryByText("2 bid so far")).not.toBeInTheDocument();
    expect(screen.queryByText("2 bid / 2 total")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place bid" })).toBeDisabled();
  });

  it("uses the Total bids label for each bid sum", () => {
    const { rerender } = render(
      <BiddingDial state={biddingState({ bids: [null, 0, 0] })} />,
    );

    expect(screen.getByText("Total bids: 0")).toBeInTheDocument();

    rerender(<BiddingDial state={biddingState({ bids: [null, 1, 0] })} />);

    expect(screen.getByText("Total bids: 1")).toBeInTheDocument();

    rerender(<BiddingDial state={biddingState({ bids: [null, 1, 1] })} />);

    expect(screen.getByText("Total bids: 2")).toBeInTheDocument();
  });

  it("toggles a selected bid off and disables submit again", () => {
    render(<BiddingDial state={biddingState()} />);

    const bidOne = screen.getByRole("button", { name: "Bid 1" });
    const submit = screen.getByRole("button", { name: "Place bid" });

    expect(submit).toBeDisabled();

    fireEvent.click(bidOne);

    expect(bidOne).toHaveAttribute("aria-pressed", "true");
    expect(submit).not.toBeDisabled();

    fireEvent.click(bidOne);

    expect(bidOne).toHaveAttribute("aria-pressed", "false");
    expect(submit).toBeDisabled();
  });

  it("lets the viewer queue and update a bid before their turn", () => {
    const onBid = vi.fn();
    useMatch.setState({
      state: biddingState({
        bidTurn: 1,
        bids: [null, null, 1],
        players: [
          { id: "you", name: "You", isHuman: true, personality: "mixed" },
          { id: "bot1", name: "Margot", isHuman: false, personality: "mixed" },
          { id: "bot2", name: "Theodore", isHuman: false, personality: "mixed" },
        ],
      }),
    });

    render(<BiddingDial onBid={onBid} />);

    expect(screen.getByRole("heading", { name: "Waiting for Margot" })).toBeInTheDocument();
    expect(screen.getByText("Margot is choosing a bid.")).toBeInTheDocument();
    expect(screen.getByText("Your bid is coming up.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place bid" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Bid 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Place bid" }));

    expect(onBid).not.toHaveBeenCalled();
    expect(screen.getByText("Queued bid: 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bid 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Place bid" }));

    expect(onBid).not.toHaveBeenCalled();
    expect(screen.getByText("Queued bid: 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bid 2" }));

    expect(screen.queryByText("Queued bid: 2")).not.toBeInTheDocument();
    expect(screen.getByText("Your bid is coming up.")).toBeInTheDocument();
  });

  it("submits a queued bid once the viewer's turn arrives", async () => {
    const onBid = vi.fn();
    const waiting = biddingState({
      bidTurn: 1,
      bids: [null, null, 1],
    });
    const { rerender } = render(<BiddingDial state={waiting} onBid={onBid} />);

    fireEvent.click(screen.getByRole("button", { name: "Bid 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Place bid" }));

    expect(screen.getByText("Queued bid: 2")).toBeInTheDocument();

    rerender(
      <BiddingDial
        state={biddingState({
          bidTurn: 0,
          bids: [null, 0, 1],
        })}
        onBid={onBid}
      />,
    );

    await waitFor(() => expect(onBid).toHaveBeenCalledWith(2));
  });

  it("closes after the viewer places a bid", () => {
    const onBid = vi.fn();
    render(<BiddingDial state={biddingState()} onBid={onBid} />);

    fireEvent.click(screen.getByRole("button", { name: "Bid 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Place bid" }));

    expect(onBid).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("heading", { name: "Your bid" })).not.toBeInTheDocument();
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

    expect(screen.queryByRole("heading", { name: "Your bid" })).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting for your turn")).not.toBeInTheDocument();
  });
});
