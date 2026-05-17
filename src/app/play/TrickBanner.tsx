"use client";

import { useMatch } from "@/store/match";
import type { GameState } from "@/lib/game";

export function TrickBanner({ state: stateProp }: { state?: GameState | null }) {
  const localState = useMatch((s) => s.state);
  const state = stateProp ?? localState;
  const winner =
    state && state.phase === "trick-end" && state.trickWinner != null
      ? state.players[state.trickWinner]
      : null;

  if (!winner) return null;

  return (
    <div className="gb-trick-banner">
      <span>Trick to</span>
      <b>{winner.name}</b>
    </div>
  );
}
