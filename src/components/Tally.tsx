"use client";

import { CardMark } from "@/components/CardMark";
import type { Card } from "@/lib/cards";

export interface TallyRound {
  round: number;
  trump: Card;
  bids: number[];
  won: number[];
  scores: number[];
}

export function TallyTable({
  playerNames,
  isYou,
  history,
  cumulative,
}: {
  playerNames: string[];
  isYou: boolean[];
  history: TallyRound[];
  cumulative: number[];
}) {
  const rankedPlayers = playerNames
    .map((name, playerIndex) => ({
      name,
      playerIndex,
      total: cumulative[playerIndex] ?? 0,
      isYou: isYou[playerIndex] ?? false,
    }))
    .sort((a, b) => b.total - a.total || a.playerIndex - b.playerIndex);

  return (
    <div className="gb-tally">
      <div
        className="gb-tally-paper"
        style={{ ["--rounds" as string]: history.length || 1 }}
      >
        <div className="gb-tally-head">
          <div className="gb-tally-cell head">Player</div>
          {history.map((h) => (
            <div key={h.round} className="gb-tally-cell head round">
              <span className="r-num">{history.length === 1 ? "Hand" : `H${h.round}`}</span>
              {h.trump && <CardMark card={h.trump} size="xs" />}
            </div>
          ))}
          <div className="gb-tally-cell head total">Total</div>
        </div>

        {rankedPlayers.map(({ name, playerIndex, total, isYou: rowIsYou }) => (
          <div
            key={playerIndex}
            className={"gb-tally-row" + (rowIsYou ? " you" : "")}
          >
            <div className="gb-tally-cell">
              <span className="gb-name-strong">{name}</span>
            </div>
            {history.map((h) => {
              const s = h.scores[playerIndex] ?? 0;
              const made = h.bids[playerIndex] === h.won[playerIndex];
              return (
                <div
                  key={h.round}
                  className={"gb-tally-cell entry " + (made ? "made" : "missed")}
                >
                  <span className="bid-pair mono">
                    {h.bids[playerIndex]}/{h.won[playerIndex]}
                  </span>
                  <span className={"score " + (s >= 0 ? "pos" : "neg")}>
                    {s >= 0 ? "+" : ""}
                    {s}
                  </span>
                </div>
              );
            })}
            <div className="gb-tally-cell total">
              <Marks n={total} />
              <span className="gb-tally-num mono">{total}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Render a number as 5-bar gates (only positive part); negatives render as red text. */
function Marks({ n }: { n: number }) {
  const v = Math.max(0, n);
  const fives = Math.floor(v / 5);
  const ones = v % 5;
  const groups: number[] = [];
  for (let i = 0; i < fives; i++) groups.push(5);
  if (ones > 0) groups.push(ones);
  return (
    <span className="gb-tally-marks">
      {groups.map((g, i) => (
        <span key={i} className="gb-tally-group">
          {Array.from({ length: Math.min(g, 4) }).map((_, k) => (
            <span key={k} className="t-mark" />
          ))}
          {g === 5 && <span className="t-cross" />}
        </span>
      ))}
      {n < 0 && <span className="t-neg">−{Math.abs(n)}</span>}
    </span>
  );
}
