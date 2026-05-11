"use client";

import { useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { useMatch } from "@/store/match";
import { Avatar } from "@/components/Avatar";
import { TallyTable } from "@/components/Tally";
import { cumulativeScores } from "@/lib/game";

export function MatchEnd() {
  const router = useRouter();
  const state = useMatch((s) => s.state);
  const archiveCurrent = useMatch((s) => s.archiveCurrent);
  const finishMatch = useMatch((s) => s.finishMatch);
  const titleId = useId();

  useEffect(() => {
    if (state?.phase === "match-end") {
      archiveCurrent();
    }
  }, [state?.phase, archiveCurrent]);

  if (!state || state.phase !== "match-end") return null;

  const cum = cumulativeScores(state);
  const ranked = state.players
    .map((p, i) => ({ ...p, idx: i, score: cum[i] }))
    .sort((a, b) => b.score - a.score);
  const winner = ranked[0];

  return (
    <div
      className="gb-modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="gb-end-card">
        <div className="eyebrow">Final book</div>
        <h2 id={titleId} className="display gb-end-h">
          {winner.name} take{winner.isHuman ? " " : "s "}the night.
        </h2>
        <p className="gb-end-sub">
          {state.players.length} players · {state.decks} deck{state.decks > 1 ? "s" : ""} ·{" "}
          {state.tricksPerHand} tricks
        </p>

        <div className="gb-podium">
          {ranked.slice(0, 3).map((p, rank) => (
            <div key={p.id} className={"gb-podium-step rank-" + rank}>
              <Avatar name={p.name} seed={p.idx} size={56} />
              <div className="gb-podium-name">{p.name}</div>
              <div className="gb-podium-score mono">{p.score}</div>
              <div className="gb-podium-rank">{["1st", "2nd", "3rd"][rank]}</div>
            </div>
          ))}
        </div>

        <TallyTable
          playerNames={state.players.map((p) => p.name)}
          isYou={state.players.map((p) => p.isHuman)}
          history={state.history}
          cumulative={cum}
        />

        <div className="gb-end-foot">
          <button
            className="btn ghost"
            onClick={() => {
              finishMatch();
              router.push("/history");
            }}
          >
            View history
          </button>
          <button
            className="btn brass"
            onClick={() => {
              finishMatch();
              router.push("/");
            }}
          >
            Another night
          </button>
        </div>
      </div>
    </div>
  );
}
