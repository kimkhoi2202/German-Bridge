"use client";

import { memo, useEffect, useId, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useMatch } from "@/store/match";
import { useSettings } from "@/store/settings";
import { PlayingCard } from "@/components/PlayingCard";
import { CardMark } from "@/components/CardMark";
import { useRouter } from "next/navigation";
import { SUIT_CHAR, SUIT_NAME, isRed, sortHand, legalCards } from "@/lib/cards";
import type { Card } from "@/lib/cards";
import type { GameState, PlayLogEntry } from "@/lib/game";
import { formatCurrentHand } from "@/lib/matchLabels";
import { exitTransition, stateTransition } from "@/lib/uiMotion";
import { BiddingDial } from "./BiddingDial";

type SeatZone = "left" | "top" | "right";

function distribute(slot: number, count: number, start: number, end: number) {
  if (count <= 1) return (start + end) / 2;
  return start + ((end - start) * slot) / (count - 1);
}

function sideRailCount(opponents: number) {
  if (opponents <= 1) return 0;
  return Math.min(3, Math.max(1, Math.ceil((opponents - 5) / 3) + 1));
}

function topRailBounds(count: number) {
  if (count >= 5) return { start: 18, end: 82 };
  if (count === 4) return { start: 22, end: 78 };
  if (count === 3) return { start: 30, end: 70 };
  return { start: 36, end: 64 };
}

function seatPos(playerIdx: number, playerCount: number): { x: number; y: number; zone: SeatZone } {
  const opponents = playerCount - 1;
  const slot = playerIdx - 1;
  const sideCount = sideRailCount(opponents);
  const topCount = Math.max(0, opponents - sideCount * 2);

  if (slot < sideCount) {
    return {
      x: 4.8,
      y: sideCount === 1 ? 50 : distribute(slot, sideCount, 70, 30),
      zone: "left",
    };
  }

  if (slot < sideCount + topCount) {
    const topSlot = slot - sideCount;
    const { start, end } = topRailBounds(topCount);
    return {
      x: distribute(topSlot, topCount, start, end),
      y: 11,
      zone: "top",
    };
  }

  return {
    x: 95.2,
    y: sideCount === 1 ? 50 : distribute(slot - sideCount - topCount, sideCount, 30, 70),
    zone: "right",
  };
}

function seatDensity(playerCount: number) {
  if (playerCount >= 9) return "dense";
  if (playerCount >= 7) return "compact";
  return "normal";
}

export function Table() {
  return <TableView />;
}

export function TableView({
  state: stateProp,
  onPlay,
  onAbandon,
  onBid,
  cardPlayDisabled = false,
}: {
  state?: GameState | null;
  onPlay?: (card: Card) => void;
  onAbandon?: () => void;
  onBid?: (value: number) => void;
  cardPlayDisabled?: boolean;
}) {
  const router = useRouter();
  const localState = useMatch((s) => s.state);
  const localPlay = useMatch((s) => s.play);
  const localAbandon = useMatch((s) => s.abandonMatch);
  const layout = useSettings((s) => s.layout);
  const showTrumpHints = useSettings((s) => s.showTrumpHints);
  const state = stateProp ?? localState;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tableFanMaxWidth, setTableFanMaxWidth] = useState(780);
  const historyTitleId = useId();

  useEffect(() => {
    const updateFanWidth = () => setTableFanMaxWidth(Math.min(window.innerWidth - 32, 780));
    updateFanWidth();
    window.addEventListener("resize", updateFanWidth);
    return () => window.removeEventListener("resize", updateFanWidth);
  }, []);

  if (!state) return null;

  const trumpSuit = state.trumpCard?.s ?? null;
  const youHand = state.hands[0] ?? [];
  const sortedYou = trumpSuit ? sortHand(youHand, trumpSuit) : youHand;
  const leadSuit = state.currentTrick.length ? state.currentTrick[0].card.s : null;
  const myLegal =
    state.phase === "playing" ? new Set(legalCards(youHand, leadSuit).map((c) => c.key)) : null;
  const playLog = state.playLog ?? [];
  const trickCards = state.currentTrick.length;
  const trickGapBase = trickCards >= 10 ? 4 : trickCards >= 8 ? 6 : trickCards >= 6 ? 8 : 10;
  const trickCardMin = trickCards >= 10 ? 44 : trickCards >= 8 ? 50 : trickCards >= 6 ? 58 : 70;
  const playedCardSize = trickCards
    ? Math.max(
        trickCardMin,
        Math.min(104, Math.floor((tableFanMaxWidth - (trickCards - 1) * trickGapBase) / trickCards)),
      )
    : 104;
  const playedCardGap = trickCards > 1
    ? Math.max(
        3,
        Math.min(
          trickGapBase,
          Math.floor((tableFanMaxWidth - playedCardSize * trickCards) / (trickCards - 1)),
        ),
      )
    : 0;
  const density = seatDensity(state.players.length);
  const seatPositions = state.players.map((_, i) =>
    i === 0 ? null : seatPos(i, state.players.length),
  );
  const tablePlayers = `${state.players.length} player${state.players.length === 1 ? "" : "s"}`;
  const tableDecks = `${state.decks} deck${state.decks === 1 ? "" : "s"}`;

  const totalBid = state.bids.filter((b) => b != null).reduce<number>((a, b) => a + (b ?? 0), 0);

  return (
    <div className={"gb-table-wrap layout-" + layout} data-phase={state.phase}>
      {/* HUD */}
      <div className="gb-hud">
        <div className="gb-hud-pill">
          <span className="lbl">Table</span>
          <span className="mono">
            {tablePlayers} · {tableDecks}
          </span>
        </div>
        <div className="gb-hud-pill">
          <span className="lbl">Hand</span>
          <span className="mono">
            {formatCurrentHand(state.round, state.maxRounds, state.tricksTotal)}
          </span>
        </div>
        <div className="gb-hud-pill">
          <span className="lbl">Tricks</span>
          <span className="mono">
            {state.trickIdx}/{state.tricksTotal}
          </span>
        </div>
        <div className="gb-hud-pill gb-trump-pill">
          <span className="lbl">Trump</span>
          {state.trumpCard ? (
            <CardMark card={state.trumpCard} size="sm" />
          ) : (
            <span className="mono">—</span>
          )}
        </div>
        <div className="gb-hud-spacer" />
        <button
          type="button"
          className="gb-hud-btn history"
          aria-haspopup="dialog"
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen(true)}
        >
          <span>History</span>
          <span className="mono">{playLog.length}</span>
        </button>
        <button
          type="button"
          className="gb-hud-btn danger"
          onClick={() => {
            if (confirm("Abandon this match? Progress will be lost.")) {
              if (onAbandon) onAbandon();
              else {
                localAbandon();
                router.push("/");
              }
            }
          }}
        >
          Quit
        </button>
      </div>

      {/* Stage */}
      <div className="gb-stage">
        <div className="gb-play-area">
          <div className="gb-felt" data-density={density}>
            {/* Center trick well */}
            <div className="gb-trick-well">
              <AnimatePresence mode="wait">
                {state.phase === "dealing" && (
                  <motion.div
                    key="dealing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={stateTransition}
                    className="gb-deal-msg"
                  >
                    Dealing…
                  </motion.div>
                )}

                {state.phase === "trump" && state.trumpCard && (
                  <motion.div
                    key="trump"
                    initial={{ opacity: 0, transform: "translateY(10px) scale(0.98)" }}
                    animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
                    exit={{ opacity: 0 }}
                    transition={stateTransition}
                    className="gb-trump-reveal"
                  >
                    <div className="eyebrow">Trump for the hand</div>
                    <CardMark card={state.trumpCard} size="xl" />
                    <div className="gb-trump-name">{SUIT_NAME[state.trumpCard.s]}</div>
                  </motion.div>
                )}

                {state.phase === "bidding" && (
                  <motion.div
                    key="bidding"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={stateTransition}
                    className="gb-center-meta"
                  >
                    <div className="eyebrow">Bidding</div>
                    <div
                      className="gb-bid-tally"
                      aria-label={`${totalBid} bid so far, ${state.tricksTotal} available`}
                    >
                      <div>
                        <b>{totalBid}</b>
                        {" "}
                        <span>bid so far</span>
                      </div>
                      <div>
                        <b>{state.tricksTotal}</b>
                        {" "}
                        <span>available</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {(state.phase === "playing" || state.phase === "trick-end") && (
                  <motion.div
                    key="playing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={exitTransition}
                    style={{ gap: `${playedCardGap}px` }}
                    className="gb-played-fan"
                  >
                    {state.currentTrick.map((p, index) => {
                      const isWinner = state.trickWinner === p.playerIdx;
                      return (
                        <motion.div
                          key={`${p.playerIdx}-${p.card.key}-${index}`}
                          initial={{ opacity: 0, transform: "translateY(10px) scale(0.96)" }}
                          animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
                          transition={stateTransition}
                          className={"gb-trick-card" + (isWinner ? " winner" : "")}
                        >
                          <div className="gb-trick-name">
                            <span>{index + 1}</span>
                            {state.players[p.playerIdx]?.name.split(" ")[0]}
                          </div>
                          <PlayingCard card={p.card} size={playedCardSize} priority />
                        </motion.div>
                      );
                    })}
                    {state.currentTrick.length === 0 && (
                      <div className="gb-deal-msg gb-lead-msg">
                        {state.players[state.turnIdx]?.name} leads
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Seats around the felt */}
            {state.players.map((p, i) => {
              if (i === 0) return null;
              const isActing =
                (state.phase === "bidding" && state.bidTurn === i) ||
                (state.phase === "playing" && state.turnIdx === i && state.trickWinner == null);
              const isDealer = state.dealerIdx === i;
              const pos = seatPositions[i]!;
              return (
                <div
                  key={p.id}
                  className={"gb-seat" + (isActing ? " acting" : "")}
                  data-zone={pos.zone}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  <div className="gb-seat-id">
                    <div className="gb-seat-info">
                      <div className="gb-seat-name">{p.name}</div>
                      <div className="gb-seat-meta">
                        {state.bids[i] != null ? (
                          <>
                            bid <b>{state.bids[i]}</b> · won <b>{state.won[i] ?? 0}</b>
                          </>
                        ) : state.phase === "bidding" ? (
                          <i>thinking…</i>
                        ) : (
                          <i>—</i>
                        )}
                      </div>
                    </div>
                    {isDealer && (
                      <div className="gb-dealer-chip" title="Dealer">
                        D
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {state.phase === "bidding" && (
              <div className="gb-table-dock" data-mode="bid">
                <BiddingDial variant="panel" state={state} onBid={onBid} />
              </div>
            )}
          </div>
        </div>

        {/* Hero hand */}
        <div className="gb-hero">
          <div className="gb-hero-meta">
            <div>
              <div className="gb-seat-name">{state.players[0].name}</div>
              <div className="gb-seat-meta">
                {state.bids[0] != null ? (
                  <>
                    bid <b>{state.bids[0]}</b> · won <b>{state.won[0] ?? 0}</b>
                  </>
                ) : state.phase === "bidding" ? (
                  <i>place your bid</i>
                ) : (
                  <i>—</i>
                )}
              </div>
            </div>
            {state.dealerIdx === 0 && <div className="gb-dealer-chip">D</div>}
          </div>

          <div className="gb-hero-hand">
            {sortedYou.map((c, index) => {
              const isYourTurn =
                state.phase === "playing" && state.turnIdx === 0 && state.trickWinner == null;
              const isLegal = state.phase !== "playing" || myLegal?.has(c.key) === true;
              const isTrump = c.s === trumpSuit && showTrumpHints;
              const isPlayable = !cardPlayDisabled && isYourTurn && isLegal;
              const disabled = cardPlayDisabled || !isYourTurn || !isLegal;
              const rank = c.r === "T" ? "10" : c.r;
              const cardName = `${rank} of ${SUIT_NAME[c.s]}`;
              return (
                <button
                  key={c.key}
                  className={
                    "gb-hero-card" +
                    (isPlayable ? " playable" : "") +
                    (isYourTurn && !isLegal ? " unavailable" : "") +
                    (isTrump ? " trump" : "") +
                    (isTrump && isRed(c.s) ? " trump-red" : "")
                  }
                  data-trump-suit={isTrump ? SUIT_CHAR[c.s] : undefined}
                  disabled={disabled}
                  aria-label={
                    isYourTurn
                      ? isLegal
                        ? `Play ${cardName}`
                        : `${cardName} unavailable; follow suit`
                      : `${cardName} in your hand`
                  }
                  onClick={() => (onPlay ? onPlay(c) : localPlay(0, c))}
                >
                  <PlayingCard card={c} size={108} priority={index === 0} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {historyOpen && (
          <PlayedCardsModal
            state={state}
            playLog={playLog}
            titleId={historyTitleId}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function rankLabel(card: Card): string {
  return card.r === "T" ? "10" : card.r;
}

function cardLabel(card: Card): string {
  return `${rankLabel(card)}${SUIT_CHAR[card.s]}`;
}

function groupByTrick(entries: PlayLogEntry[]): Array<[number, PlayLogEntry[]]> {
  const groups = new Map<number, PlayLogEntry[]>();
  for (const entry of entries) {
    const next = groups.get(entry.trick) ?? [];
    next.push(entry);
    groups.set(entry.trick, next);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([trick, plays]) => [
      trick,
      [...plays].sort((a, b) => a.order - b.order),
    ]);
}

const PlayedCardsModal = memo(function PlayedCardsModal({
  state,
  playLog,
  titleId,
  onClose,
}: {
  state: GameState;
  playLog: PlayLogEntry[];
  titleId: string;
  onClose: () => void;
}) {
  const groups = useMemo(() => groupByTrick(playLog), [playLog]);
  const totalCards = state.tricksTotal * state.players.length;

  return (
    <motion.div
      className="gb-history-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={exitTransition}
      onClick={onClose}
    >
      <motion.section
        className="gb-history-modal"
        role="dialog"
        aria-labelledby={titleId}
        initial={{ opacity: 0, transform: "translateY(12px) scale(0.98)" }}
        animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
        exit={{ opacity: 0, transform: "translateY(8px) scale(0.985)" }}
        transition={stateTransition}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="gb-history-head">
          <div>
            <div className="eyebrow">History</div>
            <h2 id={titleId}>Played cards</h2>
          </div>
          <button type="button" className="gb-history-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="gb-history-summary">
          <span className="mono">
            {playLog.length}/{totalCards} cards
          </span>
          {state.trumpCard && (
            <span className="gb-log-trump">
              <CardMark card={state.trumpCard} size="xs" />
            </span>
          )}
        </div>

        <div className="gb-history-list">
          {groups.length === 0 && <div className="gb-history-empty">No cards played yet</div>}
          {groups.map(([trick, plays]) => {
            const winner = plays.find((entry) => entry.winner);
            return (
              <section
                key={trick}
                className={"gb-play-log-trick" + (winner ? " complete" : " current")}
              >
                <div className="gb-play-log-trick-head">
                  <span>Trick {trick}</span>
                  <span>{winner ? state.players[winner.playerIdx]?.name : "In play"}</span>
                </div>

                <div className="gb-play-log-plays">
                  {plays.map((entry) => {
                    const player = state.players[entry.playerIdx];
                    return (
                      <div
                        key={`${entry.trick}-${entry.order}-${entry.card.key}`}
                        className={"gb-play-log-row" + (entry.winner ? " winner" : "")}
                      >
                        <span className="gb-play-order mono">{entry.order}</span>
                        <span className="gb-play-player">{player?.name ?? "Player"}</span>
                        <span
                          className={"gb-play-card-chip mono " + (isRed(entry.card.s) ? "red" : "black")}
                          aria-label={`${rankLabel(entry.card)} of ${SUIT_NAME[entry.card.s]}`}
                        >
                          {cardLabel(entry.card)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </motion.section>
    </motion.div>
  );
});
