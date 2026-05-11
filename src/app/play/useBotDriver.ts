"use client";

import { useEffect } from "react";
import { useMatch } from "@/store/match";
import { chooseBid, chooseCard } from "@/lib/bot";
import { createObservation } from "@/lib/botObservation";

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

    const t = setTimeout(() => {
      const value = chooseBid(createObservation(state, idx));
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

    const t = setTimeout(() => {
      const card = chooseCard(createObservation(state, idx));
      try {
        play(idx, card);
      } catch {
        // Race guard.
      }
    }, 750 + Math.random() * 350);
    return () => clearTimeout(t);
  }, [state, play]);
}
