"use client";

import { useMatch } from "@/store/match";

export function TrickBanner() {
  const state = useMatch((s) => s.state);
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
