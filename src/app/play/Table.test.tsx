import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { humanSeatPos, seatPos } from "./tableLayout";
import {
  LANDING_IMPACT_TOTAL_MS,
  cardFlightCompletionHoldMs,
  shouldShowLandingImpact,
  TableView,
  TRICK_COLLECT_SETTLE_DELAY_MS,
} from "./Table";
import type { Card } from "@/lib/cards";
import type { GameState, Player } from "@/lib/game";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
}));

vi.mock("./BiddingDial", () => ({
  BiddingDial: () => null,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const players: Player[] = [
  { id: "you", name: "You", isHuman: true, personality: "mixed" },
  { id: "bot1", name: "Margot", isHuman: false, personality: "mixed" },
  { id: "bot2", name: "Theodore", isHuman: false, personality: "mixed" },
];

const trump: Card = { r: "A", s: "s", d: 0, key: "As-0-test" };
const kingHearts: Card = { r: "K", s: "h", d: 0, key: "Kh-0-test" };
const aceSpades: Card = { r: "A", s: "s", d: 0, key: "As-1-test" };
const fourClubs: Card = { r: "4", s: "c", d: 0, key: "4c-0-test" };
const queenClubs: Card = { r: "Q", s: "c", d: 0, key: "Qc-0-test" };
const aceClubs: Card = { r: "A", s: "c", d: 0, key: "Ac-0-test" };
const twoSpades: Card = { r: "2", s: "s", d: 0, key: "2s-0-test" };

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
    hands: [[kingHearts], [], []],
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

function trickCardByAltText(altText: string): HTMLElement {
  const trickCard = screen.getByAltText(altText).closest(".gb-trick-card");
  expect(trickCard).not.toBeNull();
  return trickCard as HTMLElement;
}

function trickPlay(playerIdx: number, card: Card, order: number) {
  return {
    playerIdx,
    card,
    order,
    playKey: `1:0:${order}:${playerIdx}:${card.key}`,
  };
}

function mockPrimaryTapPreMove(matches: boolean) {
  const mediaQuery = {
    matches,
    media: "(hover: none), (pointer: coarse)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } satisfies Partial<MediaQueryList>;

  vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery));
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
    expect(topSeat.y).toBeGreaterThanOrEqual(9);
    expect(topSeat.y).toBeLessThanOrEqual(11);
  });

  it("places the human seat on the same oval rim path as the other seats", () => {
    const humanSeat = humanSeatPos();

    expect(humanSeat.zone).toBe("bottom");
    expect(humanSeat.x).toBe(50);
    expect(humanSeat.y).toBeGreaterThanOrEqual(91);
    expect(humanSeat.y).toBeLessThanOrEqual(92);
  });

  it("pulls exact left and right side seats outward onto the table rim", () => {
    const leftSeat = seatPos(3, 12);
    const rightSeat = seatPos(9, 12);

    expect(leftSeat.zone).toBe("left");
    expect(leftSeat.x).toBeGreaterThanOrEqual(1.8);
    expect(leftSeat.x).toBeLessThanOrEqual(2.2);
    expect(rightSeat.zone).toBe("right");
    expect(rightSeat.x).toBeGreaterThanOrEqual(97.8);
    expect(rightSeat.x).toBeLessThanOrEqual(98.2);
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

  it("uses the custom abandon confirmation instead of the browser confirm", async () => {
    const handleAbandon = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);
    render(<TableView state={tableState()} onAbandon={handleAbandon} />);

    fireEvent.click(screen.getByRole("button", { name: "Quit" }));

    expect(screen.getByRole("dialog", { name: "Abandon this match?" })).toBeInTheDocument();
    expect(screen.getByText("Your current table will close and progress from this match will be lost.")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Abandon this match?" })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Quit" }));
    fireEvent.click(screen.getByRole("button", { name: "Quit match" }));

    expect(handleAbandon).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("offers desktop pre-move on right-click before the lead suit is known", () => {
    const handlePreMove = vi.fn();
    const { container } = render(
      <TableView
        state={tableState({ hands: [[kingHearts, aceSpades], [], []], turnIdx: 1 })}
        onPreMove={handlePreMove}
      />,
    );
    const card = screen.getByRole("button", { name: "Right-click to pre-move A of Spades" });

    expect(card).toHaveAttribute("title", "Right-click to pre-move");
    expect(card).toHaveClass("pre-move-selectable");
    expect(card).not.toBeDisabled();
    expect(container.querySelectorAll(".gb-hero-card.pre-move-selectable")).toHaveLength(2);

    fireEvent.click(card);

    expect(handlePreMove).not.toHaveBeenCalled();

    fireEvent.contextMenu(card);

    expect(handlePreMove).toHaveBeenCalledWith(aceSpades);
  });

  it("keeps tap-to-pre-move available on touch devices", async () => {
    mockPrimaryTapPreMove(true);
    const handlePreMove = vi.fn();
    render(
      <TableView
        state={tableState({ hands: [[kingHearts, aceSpades], [], []], turnIdx: 1 })}
        onPreMove={handlePreMove}
      />,
    );
    const card = await screen.findByRole("button", { name: "Tap to pre-move A of Spades" });

    expect(card).toHaveAttribute("title", "Tap to pre-move");

    fireEvent.pointerDown(card, { button: 0, pointerType: "touch" });
    fireEvent.click(card);

    expect(handlePreMove).toHaveBeenCalledWith(aceSpades);
  });

  it("does not pre-move from a mouse left-click even when the browser reports touch support", async () => {
    mockPrimaryTapPreMove(true);
    const handlePreMove = vi.fn();
    render(
      <TableView
        state={tableState({ hands: [[kingHearts, aceSpades], [], []], turnIdx: 1 })}
        onPreMove={handlePreMove}
      />,
    );
    const card = await screen.findByRole("button", { name: "Tap to pre-move A of Spades" });

    fireEvent.pointerDown(card, { button: 0, pointerType: "mouse" });
    fireEvent.click(card);

    expect(handlePreMove).not.toHaveBeenCalled();

    fireEvent.contextMenu(card);

    expect(handlePreMove).toHaveBeenCalledWith(aceSpades);
  });

  it("only offers pre-move on legal cards after the first card is led", () => {
    render(
      <TableView
        state={tableState({
          hands: [[kingHearts, aceSpades], [], []],
          turnIdx: 2,
          currentTrick: [{ playerIdx: 1, card: { r: "2", s: "h", d: 0, key: "2h-0-test" } }],
        })}
        onPreMove={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Right-click to pre-move K of Hearts" })).toHaveClass(
      "pre-move-selectable",
    );
    expect(screen.getByRole("button", { name: "A of Spades in your hand" })).toBeDisabled();
  });

  it("click plays a legal card when it is your turn", () => {
    const handlePlay = vi.fn();
    render(
      <TableView
        state={tableState({ hands: [[kingHearts, aceSpades]], turnIdx: 0 })}
        onPlay={handlePlay}
        onPreMove={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", { name: "Play A of Spades" });

    fireEvent.click(card);

    expect(handlePlay).toHaveBeenCalledWith(aceSpades);
  });

  it("does not play a legal card from desktop right-click when it is your turn", () => {
    const handlePlay = vi.fn();
    render(
      <TableView
        state={tableState({ hands: [[kingHearts, aceSpades]], turnIdx: 0 })}
        onPlay={handlePlay}
        onPreMove={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", { name: "Play A of Spades" });

    fireEvent.contextMenu(card);

    expect(handlePlay).not.toHaveBeenCalled();
  });

  it("marks trump cards with the supplied star svg", () => {
    const { container } = render(
      <TableView state={tableState({ hands: [[kingHearts, aceSpades]], turnIdx: 1 })} />,
    );

    const starPath = container.querySelector(".gb-hero-card.trump .gb-trump-card-star path");

    expect(starPath).toHaveAttribute(
      "d",
      "M24 3L28.8937 18.695H45L32.174 28.372L37.2312 44L24 34.3481L10.7688 44L15.826 28.372L3 18.695H19.1063L24 3Z",
    );
    expect(starPath).toHaveAttribute("fill", "currentColor");
  });

  it("offers next-trick pre-move after the viewer has already played this trick", () => {
    const handlePreMove = vi.fn();
    render(
      <TableView
        state={tableState({
          hands: [[kingHearts, aceSpades], [], []],
          turnIdx: 2,
          currentTrick: [
            { playerIdx: 1, card: { r: "2", s: "h", d: 0, key: "2h-0-test" } },
            { playerIdx: 0, card: { r: "3", s: "c", d: 0, key: "3c-0-test" } },
          ],
        })}
        onPreMove={handlePreMove}
      />,
    );
    const card = screen.getByRole("button", { name: "Right-click to pre-move A of Spades" });

    expect(card).toHaveClass("pre-move-selectable");
    expect(card).not.toBeDisabled();

    fireEvent.contextMenu(card);

    expect(handlePreMove).toHaveBeenCalledWith(aceSpades);
  });

  it("highlights the strongest current trick card in the lead suit", () => {
    const { container } = render(
      <TableView
        state={tableState({
          currentTrick: [
            { playerIdx: 1, card: fourClubs },
            { playerIdx: 2, card: queenClubs },
          ],
          turnIdx: 0,
        })}
      />,
    );

    expect(container.querySelectorAll(".gb-trick-card.current-winner")).toHaveLength(1);
    expect(trickCardByAltText("4 Clubs of playing card")).not.toHaveClass("current-winner");
    expect(trickCardByAltText("Q Clubs of playing card")).toHaveClass("current-winner");
  });

  it("highlights trump as the strongest current trick card", () => {
    const { container } = render(
      <TableView
        state={tableState({
          currentTrick: [
            { playerIdx: 1, card: aceClubs },
            { playerIdx: 2, card: twoSpades },
          ],
          turnIdx: 0,
        })}
      />,
    );

    expect(container.querySelectorAll(".gb-trick-card.current-winner")).toHaveLength(1);
    expect(trickCardByAltText("A Clubs of playing card")).not.toHaveClass("current-winner");
    expect(trickCardByAltText("2 Spades of playing card")).toHaveClass("current-winner");
  });

  it("flags a landing impact when a new card beats an existing king-or-higher winner", () => {
    const previous = [trickPlay(1, kingHearts, 0)];
    const aceHearts = { r: "A", s: "h", d: 0, key: "Ah-0-test" } satisfies Card;
    const current = [...previous, trickPlay(2, aceHearts, 1)];

    expect(shouldShowLandingImpact(previous, current, current[1].playKey, "s")).toBe(true);
  });

  it("does not flag a landing impact for ordinary low-card overtakes", () => {
    const previous = [trickPlay(1, queenClubs, 0)];
    const current = [...previous, trickPlay(2, aceClubs, 1)];

    expect(shouldShowLandingImpact(previous, current, current[1].playKey, "s")).toBe(false);
  });

  it("flags a landing impact when trump beats a king-or-higher lead winner", () => {
    const previous = [trickPlay(1, aceClubs, 0)];
    const current = [...previous, trickPlay(2, twoSpades, 1)];

    expect(shouldShowLandingImpact(previous, current, current[1].playKey, "s")).toBe(true);
  });

  it("keeps impact flights mounted until the landing burst can finish before the collect pause starts", () => {
    expect(cardFlightCompletionHoldMs(0.34, true)).toBe(LANDING_IMPACT_TOTAL_MS);
    expect(cardFlightCompletionHoldMs(0.56, true)).toBe(LANDING_IMPACT_TOTAL_MS);
    expect(cardFlightCompletionHoldMs(0.56, false)).toBe(0);
    expect(TRICK_COLLECT_SETTLE_DELAY_MS).toBe(500);
  });

  it("lets the history modal navigate between completed and current hands", () => {
    const { container } = render(
      <TableView
        state={tableState({
          round: 2,
          maxRounds: 10,
          tricksTotal: 2,
          history: [
            {
              round: 1,
              tricksTotal: 1,
              trump: fourClubs,
              bids: [0, 1, 0],
              won: [0, 1, 0],
              scores: [10, 11, 10],
              dealerIdx: 2,
              playLog: [
                { trick: 1, order: 1, playerIdx: 1, card: queenClubs },
                { trick: 1, order: 2, playerIdx: 2, card: aceClubs, winner: true },
              ],
            },
          ],
          playLog: [{ trick: 1, order: 1, playerIdx: 0, card: kingHearts }],
        })}
      />,
    );

    fireEvent.click(container.querySelector(".gb-hud-btn.history")!);

    expect(screen.getByRole("dialog", { name: "History" })).toBeInTheDocument();
    expect(screen.queryByText("Played cards")).not.toBeInTheDocument();
    expect(screen.getByText("Latest hand 2/10")).toBeInTheDocument();
    expect(screen.getByText("2 hands shown")).toBeInTheDocument();
    expect(screen.getByText("1/6 cards")).toBeInTheDocument();
    expect(screen.getByText("2/3 cards")).toBeInTheDocument();
    expect([...container.querySelectorAll(".gb-history-round-title")].map((node) => node.textContent)).toEqual([
      "Hand 2",
      "Hand 1",
    ]);
    expect(screen.getByText("Hand 1")).toBeInTheDocument();
    expect(screen.getAllByText("Trick 1")).toHaveLength(2);
    expect(screen.queryByText("Cards 1")).not.toBeInTheDocument();
    expect(screen.getByText("K♥")).toBeInTheDocument();
    expect(screen.getByText("Q♣")).toBeInTheDocument();
    expect(screen.getByText("A♣")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous hand" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next hand" })).not.toBeInTheDocument();
  });
});
