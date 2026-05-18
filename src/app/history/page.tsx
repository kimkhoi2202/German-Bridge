"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AuthGate } from "@/components/AuthGate";
import { Avatar } from "@/components/Avatar";
import { TallyTable } from "@/components/Tally";
import { cumulativeScores, type GameState } from "@/lib/game";
import { finiteNumber, sanitizePlayerName } from "@/lib/hardening";
import { formatHandLadder } from "@/lib/matchLabels";
import { useGameViewportLock } from "../useGameViewportLock";

export default function HistoryPage() {
  return (
    <AuthGate>
      <HistoryContent />
    </AuthGate>
  );
}

function HistoryContent() {
  const history = useQuery(api.games.history);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  useGameViewportLock();

  const isLoading = history === undefined;
  const rows = history ?? [];
  const selectedGameId =
    openIdx != null ? (rows[openIdx]?.game._id as Id<"games"> | undefined) : undefined;
  const aiDebug = useQuery(
    api.games.aiDebug,
    selectedGameId ? { gameId: selectedGameId } : "skip",
  );

  return (
    <div className="gb-lobby gb-history-page">
      <div className="gb-history-shell">
        <h1 className="gb-history-title">History</h1>

        {isLoading && (
          <div className="gb-history-card gb-history-empty">
            <div>
              <div className="gb-history-empty-title">Loading history</div>
            </div>
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="gb-history-card gb-history-empty">
            <div>
              <div className="gb-history-empty-title">No saved games yet</div>
              <div className="gb-history-empty-sub">Completed private rooms will appear here.</div>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="gb-history-list">
            {rows.map((row, i) => {
              const state = row.state as GameState | null;
              const players = row.participants
                .sort((a, b) => a.seatIdx - b.seatIdx)
                .map((p) => ({ name: p.name, isHuman: p.kind === "human" }));
              const playerNames = players.map((p, idx) =>
                sanitizePlayerName(p.name, idx === 0 ? "You" : `Player ${idx + 1}`),
              );
              const cumulative = state ? cumulativeScores(state) : players.map(() => 0);
              const winnerIdx = row.game.winnerSeatIdx ?? 0;
              const winner = players[winnerIdx] ?? players[0];
              const isOpen = openIdx === i;
              const detailId = `history-detail-${i}`;
              const finishedAt = finiteNumber(row.game.finishedAt, row.game.updatedAt);
              return (
                <div key={row.game._id} className="gb-history-card">
                  <button
                    type="button"
                    className="gb-history-top"
                    aria-expanded={isOpen}
                    aria-controls={detailId}
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                  >
                    <div>
                      <div className="gb-history-winner">
                        {row.game.status === "abandoned"
                          ? "Game abandoned"
                          : `${sanitizePlayerName(winner?.name, "Player")} won`}
                      </div>
                      <div className="gb-history-meta mono">
                        {new Date(finishedAt).toLocaleString()} · {row.game.playerCount} players ·{" "}
                        {row.game.decks} deck{row.game.decks > 1 ? "s" : ""} ·{" "}
                        {formatHandLadder(row.game.tricksPerHand, row.game.maxRounds)}
                      </div>
                    </div>
                    <div className="eyebrow">{isOpen ? "Close" : "Details"}</div>
                  </button>

                  <div className="gb-history-score-grid">
                    {players.map((p, idx) => {
                      const score = cumulative[idx] ?? 0;
                      const isWinner = row.game.status === "completed" && idx === winnerIdx;
                      return (
                        <div key={idx} className={"gb-history-score" + (isWinner ? " winner" : "")}>
                          <Avatar name={p.name} seed={idx} size={28} />
                          <div className="gb-history-score-copy">
                            <div className="gb-history-score-name">{playerNames[idx]}</div>
                            <div className={"gb-history-score-num mono " + (score >= 0 ? "pos" : "neg")}>
                              {score >= 0 ? `+${score}` : score}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {isOpen && state && (
                    <div id={detailId} className="gb-history-detail">
                      <TallyTable
                        playerNames={playerNames}
                        isYou={players.map((p) => p.isHuman)}
                        history={state.history}
                        cumulative={cumulative}
                      />
                      <AiDebugPanel debug={aiDebug} playerNames={playerNames} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type AiDebugAction = {
  kind?: "bid" | "card";
  label?: string;
  bid?: number;
  cardKey?: string;
  score?: number;
  isChosen?: boolean;
};

type AiDebugTrace = {
  _id: Id<"aiDecisionTraces">;
  sequence: number;
  seatIdx: number;
  phase: "bidding" | "playing";
  round: number;
  trickIdx: number;
  policyId: string;
  requestedPolicyId: string;
  personality: string;
  checkpointId?: string;
  fallback: boolean;
  fallbackReason?: string;
  chosenAction: AiDebugAction;
  legalActionCount: number;
  topActions: AiDebugAction[];
  heuristic?: Record<string, unknown>;
  observation?: Record<string, unknown>;
};

type AiDebugData = {
  locked: boolean;
  reason: string | null;
  summary: {
    traceCount: number;
    championTraceCount: number;
    gptTraceCount: number;
    fallbackCount: number;
    bySeat: {
      seatIdx: number;
      name: string;
      personality: string;
      traceCount: number;
      fallbackCount: number;
    }[];
  };
  traces: AiDebugTrace[];
};

function AiDebugPanel({
  debug,
  playerNames,
}: {
  debug: AiDebugData | undefined;
  playerNames: string[];
}) {
  if (debug === undefined) {
    return (
      <section className="gb-ai-debug">
        <div className="gb-ai-debug-head">
          <div>
            <div className="eyebrow">AI Debug</div>
            <h2>Loading decision traces</h2>
          </div>
        </div>
      </section>
    );
  }

  const checkpointId = debug.traces.find((trace) => trace.checkpointId)?.checkpointId ?? "none";
  const visibleTraces = debug.traces.slice(0, 120);

  return (
    <section className="gb-ai-debug">
      <div className="gb-ai-debug-head">
        <div>
          <div className="eyebrow">AI Debug</div>
          <h2>Bot decision trace</h2>
        </div>
        <div className="gb-ai-debug-pills">
          <span>{debug.summary.traceCount} decisions</span>
          <span>{debug.summary.championTraceCount} champion</span>
          {debug.summary.gptTraceCount > 0 && <span>{debug.summary.gptTraceCount} GPT</span>}
          <span>{debug.summary.fallbackCount} fallbacks</span>
        </div>
      </div>

      <div className="gb-ai-debug-meta mono">Checkpoint {checkpointId}</div>

      {debug.locked && <div className="gb-ai-debug-empty">{debug.reason}</div>}
      {!debug.locked && debug.traces.length === 0 && (
        <div className="gb-ai-debug-empty">No bot decision traces were captured for this game.</div>
      )}

      {!debug.locked && visibleTraces.length > 0 && (
        <div className="gb-ai-debug-list">
          {visibleTraces.map((trace) => (
            <details key={trace._id} className="gb-ai-debug-row">
              <summary>
                <div className="gb-ai-debug-row-main">
                  <span className="eyebrow">
                    {trace.phase === "bidding" ? "Bid" : "Play"} · R{trace.round}
                    {trace.phase === "playing" ? ` Card ${trace.trickIdx + 1}` : ""}
                  </span>
                  <strong>{playerNames[trace.seatIdx] ?? `Seat ${trace.seatIdx + 1}`}</strong>
                  <span>chose {formatAction(trace.chosenAction)}</span>
                </div>
                <div className="gb-ai-debug-policy mono">
                  {formatPolicy(trace.policyId)}
                  {trace.fallback ? " fallback" : ""}
                </div>
              </summary>
              <div className="gb-ai-debug-expanded">
                <div className="gb-ai-debug-actions">
                  {trace.topActions.map((action, index) => (
                    <span key={`${trace._id}-${index}`} className={action.isChosen ? "chosen" : ""}>
                      {formatAction(action)}
                      {typeof action.score === "number" ? ` ${formatScore(action.score)}` : ""}
                    </span>
                  ))}
                </div>
                <div className="gb-ai-debug-observation mono">
                  {formatObservation(trace)}
                </div>
                {trace.fallbackReason && (
                  <div className="gb-ai-debug-observation mono">Fallback: {trace.fallbackReason}</div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function formatPolicy(policyId: string) {
  if (policyId.startsWith("champion:")) return "Champion";
  if (policyId.startsWith("openai:")) return "GPT";
  if (policyId.startsWith("heuristic:")) return policyId.replace("heuristic:", "Heuristic ");
  return policyId;
}

function formatScore(score: number) {
  const abs = Math.abs(score);
  if (abs >= 100) return score.toFixed(0);
  if (abs >= 10) return score.toFixed(1);
  return score.toFixed(2);
}

function formatAction(action: AiDebugAction | undefined) {
  if (!action) return "unknown";
  if (typeof action.label === "string") return action.label;
  if (typeof action.bid === "number") return `Bid ${action.bid}`;
  if (typeof action.cardKey === "string") return action.cardKey;
  return "unknown";
}

function formatObservation(trace: AiDebugTrace) {
  const observation = trace.observation;
  const hand = Array.isArray(observation?.ownHand)
    ? observation.ownHand.map(formatCardLike).join(" ")
    : "hidden";
  const bids = Array.isArray(observation?.bids)
    ? observation.bids.map((bid) => (bid == null ? "-" : String(bid))).join("/")
    : "-";
  const won = Array.isArray(observation?.won) ? observation.won.join("/") : "-";
  const legal = trace.legalActionCount;
  return `hand ${hand || "-"} · bids ${bids} · won ${won} · legal ${legal}`;
}

function formatCardLike(value: unknown) {
  if (!value || typeof value !== "object") return "?";
  const card = value as { r?: unknown; s?: unknown; d?: unknown };
  const rank = typeof card.r === "string" ? card.r : "?";
  const suit = typeof card.s === "string" ? card.s.toUpperCase() : "?";
  const deck = typeof card.d === "number" ? card.d + 1 : "?";
  return `${rank}${suit}.${deck}`;
}
