"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMatch } from "@/store/match";
import { useSettings } from "@/store/settings";
import { Table } from "./Table";
import { RoundSummary } from "./RoundSummary";
import { MatchEnd } from "./MatchEnd";
import { TrickBanner } from "./TrickBanner";
import { useBotDriver } from "./useBotDriver";
import { useGameViewportLock } from "../useGameViewportLock";

export default function PlayPage() {
  const router = useRouter();
  const state = useMatch((s) => s.state);
  const revealTrump = useMatch((s) => s.revealTrump);
  const beginBidding = useMatch((s) => s.beginBidding);
  const settle = useMatch((s) => s.settle);
  const settings = useSettings();
  useGameViewportLock();

  // Auto-advance dealing → trump → bidding with timed reveals.
  useEffect(() => {
    if (!state) return;
    if (state.phase === "dealing") {
      const t = setTimeout(() => revealTrump(), 900);
      return () => clearTimeout(t);
    }
    if (state.phase === "trump") {
      const t = setTimeout(() => beginBidding(), 1400);
      return () => clearTimeout(t);
    }
    if (state.phase === "trick-end") {
      const t = setTimeout(() => settle(), 1300);
      return () => clearTimeout(t);
    }
  }, [state?.phase, state?.round, revealTrump, beginBidding, settle, state]);

  // Drive bots automatically when it's their turn.
  useBotDriver();

  if (!state) {
    return (
      <div className="px-7 py-12 max-w-[680px] mx-auto text-center">
        <div className="eyebrow">No active match</div>
        <h1 className="display text-5xl mt-2 mb-4">Set the table first.</h1>
        <p className="opacity-70 mb-6">
          Head to the Lobby to choose players, decks, and tricks per hand. Your match auto-saves
          while you play.
        </p>
        <button className="btn brass" onClick={() => router.push("/")}>
          Go to Lobby
        </button>
      </div>
    );
  }

  return (
    <div
      className="gb-play-screen relative"
      data-cardback={settings.cardBack}
      data-layout={settings.layout}
    >
      <Table />
      <TrickBanner />
      {state.phase === "round-end" && <RoundSummary />}
      {state.phase === "match-end" && <MatchEnd />}
    </div>
  );
}
