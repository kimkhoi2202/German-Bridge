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
  const cardBack = useSettings((s) => s.cardBack);
  const layout = useSettings((s) => s.layout);
  const phase = state?.phase;
  const round = state?.round;
  const trickIdx = state?.trickIdx;
  useGameViewportLock();

  // Auto-advance dealing → trump → bidding with timed reveals.
  useEffect(() => {
    if (!phase) return;
    if (phase === "dealing") {
      const t = setTimeout(() => revealTrump(), 900);
      return () => clearTimeout(t);
    }
    if (phase === "trump") {
      const t = setTimeout(() => beginBidding(), 1400);
      return () => clearTimeout(t);
    }
    if (phase === "trick-end") {
      const t = setTimeout(() => settle(), 1300);
      return () => clearTimeout(t);
    }
  }, [phase, round, trickIdx, revealTrump, beginBidding, settle]);

  // Drive bots automatically when it's their turn.
  useBotDriver();

  useEffect(() => {
    if (!state) router.replace("/");
  }, [state, router]);

  if (!state) {
    return (
      <div className="gb-play-screen gb-route-fallback">
        <div className="eyebrow">Returning to lobby</div>
      </div>
    );
  }

  return (
    <div
      className="gb-play-screen relative"
      data-cardback={cardBack}
      data-layout={layout}
    >
      <Table />
      <TrickBanner />
      {state.phase === "round-end" && <RoundSummary />}
      {state.phase === "match-end" && <MatchEnd />}
    </div>
  );
}
