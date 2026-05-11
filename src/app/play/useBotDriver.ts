"use client";

import { useEffect } from "react";
import { useMatch } from "@/store/match";
import { botBid, botPlay } from "@/lib/bot";
import { lastBidderRestriction } from "@/lib/game";

/**
 * Side-effect hook: when it's a bot's turn (during bidding or playing),
 * compute its action and dispatch after a short delay (so the human can
 * watch what's happening).
 */
export function useBotDriver() {
  const state = useMatch((s) => s.state);
  const bid = useMatch((s) => s.bid);
  const play = useMatch((s) => s.play);

  // Bot bidding
  useEffect(() => {
    if (!state) return;
    if (state.phase !== "bidding") return;
    const idx = state.bidTurn;
    const player = state.players[idx];
    if (!player || player.isHuman) return;
    if (state.bids[idx] != null) return;

    const placedBefore = state.bids.filter((b) => b != null).length;
    const isLast = placedBefore === state.players.length - 1;
    const restricted = isLast
      ? lastBidderRestriction(state.bids, state.tricksTotal)
      : null;

    const trumpSuit = state.trumpCard?.s ?? null;
    const t = setTimeout(() => {
      const value = botBid({
        hand: state.hands[idx],
        trumpSuit,
        personality: player.personality,
        tricksTotal: state.tricksTotal,
        isLast,
        restricted,
      });
      try {
        bid(idx, value);
      } catch {
        // Race condition guard — state may have moved on.
      }
    }, 700 + Math.random() * 400);
    return () => clearTimeout(t);
  }, [state, bid]);

  // Bot playing
  useEffect(() => {
    if (!state) return;
    if (state.phase !== "playing") return;
    const idx = state.turnIdx;
    const player = state.players[idx];
    if (!player || player.isHuman) return;

    const trumpSuit = state.trumpCard?.s ?? null;
    const t = setTimeout(() => {
      const card = botPlay({
        hand: state.hands[idx],
        currentTrick: state.currentTrick,
        trumpSuit,
        bid: state.bids[idx] ?? 0,
        won: state.won[idx] ?? 0,
      });
      try {
        play(idx, card);
      } catch {
        // Race guard.
      }
    }, 750 + Math.random() * 350);
    return () => clearTimeout(t);
  }, [state, play]);
}
