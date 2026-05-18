"use client";

import { useId } from "react";
import { useMatch } from "@/store/match";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/base/buttons/button";
import { Icon } from "@/components/Icon";
import { CardMark } from "@/components/CardMark";
import { cumulativeScores, type GameState } from "@/lib/game";

export function RoundSummary({
  state: stateProp,
  onAdvance,
  isAdvancing = false,
}: {
  state?: GameState | null;
  onAdvance?: () => void;
  isAdvancing?: boolean;
}) {
  const localState = useMatch((s) => s.state);
  const localAdvance = useMatch((s) => s.advanceRound);
  const state = stateProp ?? localState;
  const advance = onAdvance ?? localAdvance;
  const titleId = useId();
  if (!state || state.phase !== "round-end") return null;

  const last = state.history[state.history.length - 1];
  const cum = cumulativeScores(state);
  const rankedPlayers = state.players
    .map((player, playerIndex) => ({
      player,
      playerIndex,
      total: cum[playerIndex] ?? 0,
      handScore: last.scores[playerIndex] ?? 0,
      bid: last.bids[playerIndex] ?? 0,
      won: last.won[playerIndex] ?? 0,
    }))
    .sort((a, b) => b.total - a.total || a.playerIndex - b.playerIndex);
  const isFinalHand = state.round >= state.maxRounds;
  const nextHandSize = Math.min(state.round + 1, state.tricksPerHand);

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
              <div className="eyebrow">Trump</div>
              <CardMark card={last.trump} size="lg" />
            </div>
          )}
        </div>

        <div className="gb-summary-rows">
          {rankedPlayers.map(({ player, playerIndex, total, handScore, bid, won }) => {
            const made = bid === won;
            return (
              <div
                key={player.id}
                className={"gb-summary-row " + (made ? "made" : "missed")}
              >
                <Avatar name={player.name} seed={playerIndex} size={32} />
                <div className="gb-sum-name">{player.name}</div>
                <div className="gb-sum-bid">
                  bid <b>{bid}</b>
                </div>
                <div className="gb-sum-won">
                  took <b>{won}</b>
                </div>
                <div className={"gb-sum-delta " + (handScore >= 0 ? "pos" : "neg")}>
                  {handScore >= 0 ? `+${handScore}` : handScore}
                </div>
                <div className="gb-sum-cum mono">→ {total}</div>
              </div>
            );
          })}
        </div>

        <div className="gb-summary-foot">
          <div className="gb-progress">
            <span>{isFinalHand ? "Final score is ready" : `Next hand has ${nextHandSize} cards`}</span>
            <div className="gb-progress-bar">
              <div style={{ width: `${Math.min(100, (state.round / state.maxRounds) * 100)}%` }} />
            </div>
          </div>
          <Button
            size="md"
            isDisabled={isAdvancing}
            isLoading={isAdvancing}
            showTextWhileLoading
            onClick={() => {
              if (!isAdvancing) advance();
            }}
          >
            {isFinalHand ? "See final" : "Deal next hand"} <Icon name="chevR" size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
