import { describe, expect, it, beforeEach } from "vitest";
import { useMatch } from "./match";
import { botBid, botPlay } from "@/lib/bot";
import { lastBidderRestriction } from "@/lib/game";

// Note: Zustand persist uses localStorage which jsdom provides.
// We reset between tests to keep them independent.
beforeEach(() => {
  useMatch.setState({ state: null, archive: [] });
  if (typeof localStorage !== "undefined") localStorage.clear();
});

describe("useMatch — store integration", () => {
  it("starts a match and exposes a fresh GameState", () => {
    useMatch.getState().startMatch({
      playerCount: 4,
      decks: 1,
      tricksPerHand: 3,
      botMood: "mixed",
      botOverrides: [],
      playerName: "Test",
    });
    const s = useMatch.getState().state;
    expect(s).not.toBeNull();
    expect(s!.players).toHaveLength(4);
    expect(s!.players[0].isHuman).toBe(true);
    expect(s!.players[0].name).toBe("Test");
    expect(s!.tricksPerHand).toBe(3);
    expect(s!.phase).toBe("dealing");
    expect(s!.hands.every((h) => h.length === 3)).toBe(true);
  });

  it("drives a full match through every phase to match-end and archives the result", () => {
    const m = useMatch.getState();
    m.startMatch({
      playerCount: 3,
      decks: 1,
      tricksPerHand: 2,
      botMood: "mixed",
      botOverrides: [],
      playerName: "Tester",
    });

    // Skip dealing/trump animation directly to bidding
    useMatch.getState().revealTrump();
    useMatch.getState().beginBidding();

    let safety = 0;
    while (useMatch.getState().state?.phase !== "match-end" && safety++ < 1000) {
      const cur = useMatch.getState().state!;
      if (cur.phase === "bidding") {
        const idx = cur.bidTurn;
        const placedBefore = cur.bids.filter((b) => b != null).length;
        const isLast = placedBefore === cur.players.length - 1;
        const restricted = isLast
          ? lastBidderRestriction(cur.bids, cur.tricksTotal)
          : null;
        const value = botBid({
          hand: cur.hands[idx],
          trumpSuit: cur.trumpCard?.s ?? null,
          personality: cur.players[idx].personality,
          tricksTotal: cur.tricksTotal,
          isLast,
          restricted,
        });
        useMatch.getState().bid(idx, value);
      } else if (cur.phase === "playing") {
        const idx = cur.turnIdx;
        const card = botPlay({
          hand: cur.hands[idx],
          currentTrick: cur.currentTrick,
          trumpSuit: cur.trumpCard?.s ?? null,
          bid: cur.bids[idx] ?? 0,
          won: cur.won[idx] ?? 0,
        });
        useMatch.getState().play(idx, card);
      } else if (cur.phase === "trick-end") {
        useMatch.getState().settle();
      } else if (cur.phase === "round-end") {
        useMatch.getState().advanceRound();
      } else if (cur.phase === "trump") {
        useMatch.getState().beginBidding();
      } else if (cur.phase === "dealing") {
        useMatch.getState().revealTrump();
      } else {
        break;
      }
    }

    expect(useMatch.getState().state?.phase).toBe("match-end");
    useMatch.getState().archiveCurrent();
    const archive = useMatch.getState().archive;
    expect(archive).toHaveLength(1);
    expect(archive[0].players).toHaveLength(3);
    expect(archive[0].cumulative).toHaveLength(3);
  });

  it("abandonMatch clears the in-progress state", () => {
    useMatch.getState().startMatch({
      playerCount: 3,
      decks: 1,
      tricksPerHand: 2,
      botMood: "mixed",
      botOverrides: [],
      playerName: "X",
    });
    expect(useMatch.getState().state).not.toBeNull();
    useMatch.getState().abandonMatch();
    expect(useMatch.getState().state).toBeNull();
  });

  it("respects per-bot personality overrides", () => {
    useMatch.getState().startMatch({
      playerCount: 4,
      decks: 1,
      tricksPerHand: 2,
      botMood: "cautious",
      botOverrides: [null, "aggressive", null],
      playerName: "Hero",
    });
    const s = useMatch.getState().state!;
    expect(s.players[0].isHuman).toBe(true);
    expect(s.players[1].personality).toBe("cautious"); // global default
    expect(s.players[2].personality).toBe("aggressive"); // override
    expect(s.players[3].personality).toBe("cautious");
  });
});
