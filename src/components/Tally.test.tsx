import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TallyTable } from "./Tally";
import type { Card } from "@/lib/cards";

const trump: Card = { r: "A", s: "s", d: 0, key: "As-0-0" };

describe("TallyTable", () => {
  it("sorts players by total score while preserving each player's hand history", () => {
    const { container } = render(
      <TallyTable
        playerNames={["Ada", "Ben", "Cora"]}
        isYou={[false, true, false]}
        cumulative={[10, 30, 20]}
        history={[
          {
            round: 1,
            trump,
            bids: [1, 2, 3],
            won: [1, 0, 3],
            scores: [11, -2, 13],
          },
        ]}
      />,
    );

    const rows = Array.from(container.querySelectorAll(".gb-tally-row"));

    expect(rows).toHaveLength(3);
    expect(within(rows[0] as HTMLElement).getByText("Ben")).toBeInTheDocument();
    expect(rows[0]).toHaveClass("you");
    expect(rows[0]).toHaveTextContent("2/0");
    expect(rows[0]).toHaveTextContent("30");

    expect(within(rows[1] as HTMLElement).getByText("Cora")).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("3/3");
    expect(rows[1]).toHaveTextContent("20");

    expect(within(rows[2] as HTMLElement).getByText("Ada")).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent("1/1");
    expect(rows[2]).toHaveTextContent("10");
  });
});
