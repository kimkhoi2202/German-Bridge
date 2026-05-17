"use client";

import { useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { useMatch } from "@/store/match";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/base/buttons/button";
import { TallyTable } from "@/components/Tally";
import { cumulativeScores, type GameState } from "@/lib/game";
import { formatHandLadder } from "@/lib/matchLabels";

export function MatchEnd({
  state: stateProp,
  onFinish,
}: {
  state?: GameState | null;
  onFinish?: (destination: "history" | "lobby") => void;
}) {
  const router = useRouter();
  const localState = useMatch((s) => s.state);
  const archiveCurrent = useMatch((s) => s.archiveCurrent);
  const finishMatch = useMatch((s) => s.finishMatch);
  const titleId = useId();
  const state = stateProp ?? localState;

  useEffect(() => {
    if (!stateProp && state?.phase === "match-end") {
      archiveCurrent();
    }
  }, [stateProp, state?.phase, archiveCurrent]);

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
          {formatHandLadder(state.tricksPerHand, state.maxRounds)}
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
          <Button
            color="tertiary"
            size="md"
            onClick={() => {
              if (onFinish) onFinish("history");
              else {
                finishMatch();
                router.push("/history");
              }
            }}
          >
            View history
          </Button>
          <Button
            size="md"
            onClick={() => {
              if (onFinish) onFinish("lobby");
              else {
                finishMatch();
                router.push("/");
              }
            }}
          >
            Another night
          </Button>
        </div>
      </div>
    </div>
  );
}
