"use client";

import { useId } from "react";
import { useMatch } from "@/store/match";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { PlayingCard } from "@/components/PlayingCard";
import { cumulativeScores } from "@/lib/game";

export function RoundSummary() {
  const state = useMatch((s) => s.state);
  const advance = useMatch((s) => s.advanceRound);
  const titleId = useId();
  if (!state || state.phase !== "round-end") return null;

  const last = state.history[state.history.length - 1];
  const cum = cumulativeScores(state);

  return (
    <div
      className="gb-modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="gb-summary-card">
        <div className="gb-summary-head">
          <div>
            <div className="eyebrow">Hand settled</div>
            <h2 id={titleId} className="display gb-summary-h">The book closes.</h2>
          </div>
          {last?.trump && (
            <div className="gb-summary-trump">
              <PlayingCard card={last.trump} size={66} />
              <div className="eyebrow">Trump</div>
            </div>
          )}
        </div>

        <div className="gb-summary-rows">
          {state.players.map((p, i) => {
            const score = last.scores[i];
            const made = last.bids[i] === last.won[i];
            return (
              <div
                key={p.id}
                className={"gb-summary-row " + (made ? "made" : "missed")}
              >
                <Avatar name={p.name} seed={i} size={32} />
                <div className="gb-sum-name">{p.name}</div>
                <div className="gb-sum-bid">
                  bid <b>{last.bids[i]}</b>
                </div>
                <div className="gb-sum-won">
                  took <b>{last.won[i]}</b>
                </div>
                <div className={"gb-sum-delta " + (score >= 0 ? "pos" : "neg")}>
                  {score >= 0 ? `+${score}` : score}
                </div>
                <div className="gb-sum-cum mono">→ {cum[i]}</div>
              </div>
            );
          })}
        </div>

        <div className="gb-summary-foot">
          <div className="gb-progress">
            <span>Final score is ready</span>
            <div className="gb-progress-bar">
              <div style={{ width: "100%" }} />
            </div>
          </div>
          <button className="btn brass" onClick={() => advance()}>
            See final <Icon name="chevR" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
