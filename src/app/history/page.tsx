"use client";

import { useState } from "react";
import { useMatch } from "@/store/match";
import { Avatar } from "@/components/Avatar";
import { TallyTable } from "@/components/Tally";
import { useGameViewportLock } from "../useGameViewportLock";

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
              const winner = m.players[m.winnerIdx];
              const date = new Date(m.finishedAt);
              const isOpen = openIdx === i;
              return (
                <div key={i} className="gb-history-card">
                  <button
                    type="button"
                    className="gb-history-top"
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                  >
                    <div>
                      <div className="gb-history-winner">
                        {winner.name} won
                      </div>
                      <div className="gb-history-meta mono">
                        {date.toLocaleString()} · {m.config.players} players · {m.config.decks}{" "}
                        deck{m.config.decks > 1 ? "s" : ""} · {m.config.tricksPerHand} tricks
                      </div>
                    </div>
                    <div className="eyebrow">{isOpen ? "Hide" : "Open"}</div>
                  </button>

                  <div className="gb-history-score-grid">
                    {m.players.map((p, idx) => {
                      const score = m.cumulative[idx];
                      const isWinner = idx === m.winnerIdx;
                      return (
                        <div
                          key={idx}
                          className={"gb-history-score" + (isWinner ? " winner" : "")}
                        >
                          <Avatar name={p.name} seed={idx} size={28} />
                          <div className="gb-history-score-copy">
                            <div className="gb-history-score-name">{p.name}</div>
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
                        playerNames={m.players.map((p) => p.name)}
                        isYou={m.players.map((p) => p.isHuman)}
                        history={m.hands ?? m.rounds ?? []}
                        cumulative={m.cumulative}
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
