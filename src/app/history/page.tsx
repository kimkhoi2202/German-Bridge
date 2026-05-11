"use client";

import { useState } from "react";
import { useMatch } from "@/store/match";
import { Avatar } from "@/components/Avatar";
import { TallyTable } from "@/components/Tally";
import { useGameViewportLock } from "../useGameViewportLock";
import { finiteNumber, sanitizePlayerName } from "@/lib/hardening";

export default function HistoryPage() {
  const archive = useMatch((s) => s.archive);
  const clearArchive = useMatch((s) => s.clearArchive);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  useGameViewportLock();

  return (
    <div className="gb-lobby gb-history-page">
      <div className="gb-history-shell">
        <div className="eyebrow">German Bridge</div>
        <h1 className="gb-history-title">History</h1>

        {archive.length === 0 && (
          <div className="gb-history-card gb-history-empty">
            <div className="eyebrow">No matches yet</div>
          </div>
        )}

        {archive.length > 0 && (
          <div className="gb-history-list">
            <div className="gb-history-toolbar">
              <button
                className="btn ghost gb-history-clear"
                onClick={() => {
                  if (confirm("Clear all match history? This can't be undone.")) clearArchive();
                }}
              >
                Clear history
              </button>
            </div>
            {archive.map((m, i) => {
              const players = m.players.length ? m.players : [{ name: "Player", isHuman: true }];
              const winner = players[m.winnerIdx] ?? players[0];
              const date = new Date(finiteNumber(m.finishedAt, Date.now()));
              const isOpen = openIdx === i;
              const playerNames = players.map((p, idx) =>
                sanitizePlayerName(p.name, idx === 0 ? "You" : `Player ${idx + 1}`),
              );
              const cumulative = players.map((_, idx) => finiteNumber(m.cumulative[idx], 0));
              const config = {
                players: finiteNumber(m.config.players, players.length),
                decks: finiteNumber(m.config.decks, 1),
                tricksPerHand: finiteNumber(m.config.tricksPerHand, 1),
              };
              return (
                <div key={i} className="gb-history-card">
                  <button
                    type="button"
                    className="gb-history-top"
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                  >
                    <div>
                      <div className="gb-history-winner">
                        {sanitizePlayerName(winner.name, "Player")} won
                      </div>
                      <div className="gb-history-meta mono">
                        {date.toLocaleString()} · {config.players} players · {config.decks}{" "}
                        deck{config.decks > 1 ? "s" : ""} · {config.tricksPerHand} tricks
                      </div>
                    </div>
                    <div className="eyebrow">{isOpen ? "Hide" : "Open"}</div>
                  </button>

                  <div className="gb-history-score-grid">
                    {players.map((p, idx) => {
                      const score = cumulative[idx];
                      const isWinner = idx === m.winnerIdx;
                      return (
                        <div
                          key={idx}
                          className={"gb-history-score" + (isWinner ? " winner" : "")}
                        >
                          <Avatar name={p.name} seed={idx} size={28} />
                          <div className="gb-history-score-copy">
                            <div className="gb-history-score-name">{playerNames[idx]}</div>
                            <div
                              className={"gb-history-score-num mono " + (score >= 0 ? "pos" : "neg")}
                            >
                              {score >= 0 ? `+${score}` : score}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {isOpen && (
                    <div className="gb-history-detail">
                      <TallyTable
                        playerNames={playerNames}
                        isYou={players.map((p) => p.isHuman)}
                        history={m.hands ?? m.rounds ?? []}
                        cumulative={cumulative}
                      />
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
