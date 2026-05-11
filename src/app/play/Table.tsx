"use client";

import { motion, AnimatePresence } from "motion/react";
import { useMatch } from "@/store/match";
import { useSettings } from "@/store/settings";
import { PlayingCard } from "@/components/PlayingCard";
import { Avatar } from "@/components/Avatar";
import { useRouter } from "next/navigation";
import { SUIT_CHAR, SUIT_NAME, isRed, sortHand, legalCards } from "@/lib/cards";
import type { Card } from "@/lib/cards";
import type { GameState, PlayLogEntry } from "@/lib/game";
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
      x: 4.2,
      y: sideCount === 1 ? 50 : distribute(slot, sideCount, 70, 30),
      zone: "left",
    };
  }

  if (slot < sideCount + topCount) {
    const topSlot = slot - sideCount;
    const { start, end } = topRailBounds(topCount);
    return {
      x: distribute(topSlot, topCount, start, end),
      y: 3.8,
      zone: "top",
    };
  }

  return {
    x: 95.8,
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
  const router = useRouter();
  const state = useMatch((s) => s.state);
  const play = useMatch((s) => s.play);
  const abandon = useMatch((s) => s.abandonMatch);
  const settings = useSettings();

  if (!state) return null;

  const trumpSuit = state.trumpCard?.s ?? null;
  const youHand = state.hands[0] ?? [];
  const sortedYou = trumpSuit ? sortHand(youHand, trumpSuit) : youHand;
  const leadSuit = state.currentTrick.length ? state.currentTrick[0].card.s : null;
  const myLegal =
    state.phase === "playing"
      ? new Set(legalCards(youHand, leadSuit).map((c) => c.key))
      : new Set<string>();
  const playLog = state.playLog ?? [];
  const trickCards = state.currentTrick.length;
  const tableFanMaxWidth = typeof window === "undefined" ? 620 : Math.min(window.innerWidth * 0.9, 620);
  const trickGapBase = trickCards >= 10 ? 4 : trickCards >= 8 ? 6 : trickCards >= 6 ? 8 : 10;
  const trickCardMin = trickCards >= 10 ? 20 : trickCards >= 8 ? 24 : trickCards >= 6 ? 28 : 32;
  const playedCardSize = trickCards
    ? Math.max(
        trickCardMin,
        Math.min(58, Math.floor((tableFanMaxWidth - (trickCards - 1) * trickGapBase) / trickCards)),
      )
    : 58;
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
  const miniCardLimit = density === "dense" ? 4 : 5;
  const miniCardOverlap = density === "dense" ? -7 : density === "compact" ? -8 : -10;

  const totalBid = state.bids.filter((b) => b != null).reduce<number>((a, b) => a + (b ?? 0), 0);

  return (
    <div className={"gb-table-wrap layout-" + settings.layout} data-phase={state.phase}>
      {/* HUD */}
      <div className="gb-hud">
        <div className="gb-hud-pill">
          <span className="lbl">Hand</span>
          <span className="mono">
            {state.players.length}p · {state.decks}d
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
            <>
              <span
                className={
                  "gb-trump-glyph " + (trumpSuit && isRed(trumpSuit) ? "red" : "black")
                }
              >
                {SUIT_CHAR[trumpSuit!]}
              </span>
              <span className="mono">{state.trumpCard.r}</span>
            </>
          ) : (
            <span className="mono">—</span>
          )}
        </div>
        <div className="gb-hud-spacer" />
        <button
          className="gb-hud-btn danger"
          onClick={() => {
            if (confirm("Abandon this match? Progress will be lost.")) {
              abandon();
              router.push("/");
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
                    <PlayingCard card={state.trumpCard} size={92} />
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
                    <div className="gb-bid-tally">
                      <div>
                        <b>{totalBid}</b>
                        <span>bid so far</span>
                      </div>
                      <div>
                        <b>{state.tricksTotal}</b>
                        <span>available</span>
                      </div>
                    </div>
                    {state.trumpCard && (
                      <div className="gb-mini-trump">
                        <PlayingCard card={state.trumpCard} size={42} />
                        <span>trump</span>
                      </div>
                    )}
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
                          <PlayingCard card={p.card} size={playedCardSize} />
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
              const pos = seatPos(i, state.players.length);
              const isActing =
                (state.phase === "bidding" && state.bidTurn === i) ||
                (state.phase === "playing" && state.turnIdx === i && state.trickWinner == null);
              const isDealer = state.dealerIdx === i;
              return (
                <div
                  key={p.id}
                  className={"gb-seat" + (isActing ? " acting" : "")}
                  data-zone={pos.zone}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  <div className="gb-seat-cards">
                    {(state.hands[i] ?? []).slice(0, miniCardLimit).map((_, j) => {
                      const center = (Math.min(miniCardLimit, state.hands[i]?.length ?? 0) - 1) / 2;
                      return (
                        <div
                          key={j}
                          className={"gb-mini-back back-" + settings.cardBack}
                          style={{
                            marginLeft: j === 0 ? 0 : miniCardOverlap,
                            transform: `translateY(${Math.abs(j - center) * 1.5}px) rotate(${(j - center) * 4}deg)`,
                          }}
                        />
                      );
                    })}
                    {(state.hands[i]?.length ?? 0) > miniCardLimit && (
                      <div className="gb-card-count">×{state.hands[i].length}</div>
                    )}
                  </div>
                  <div className="gb-seat-id">
                    <Avatar name={p.name} seed={i + 1} size={36} />
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
          </div>

          {state.phase === "bidding" ? <BiddingDial variant="panel" /> : <PlayedCardsRail state={state} playLog={playLog} />}
        </div>

        {/* Hero hand */}
        <div className="gb-hero">
          <div className="gb-hero-meta">
            <Avatar name={state.players[0].name} seed={0} size={36} />
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
            {sortedYou.map((c) => {
              const isYourTurn =
                state.phase === "playing" && state.turnIdx === 0 && state.trickWinner == null;
              const isLegal = state.phase !== "playing" || myLegal.has(c.key);
              const isTrump = c.s === trumpSuit && settings.showTrumpHints;
              const disabled = !isYourTurn || !isLegal;
              const rank = c.r === "T" ? "10" : c.r;
              const cardName = `${rank} of ${SUIT_NAME[c.s]}`;
              return (
                <button
                  key={c.key}
                  className={
                    "gb-hero-card" +
                    (isYourTurn && isLegal ? " playable" : "") +
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
                  onClick={() => play(0, c)}
                >
                  <PlayingCard card={c} size={72} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
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
    .sort(([a], [b]) => b - a)
    .map(([trick, plays]) => [
      trick,
      [...plays].sort((a, b) => a.order - b.order),
    ]);
}

function PlayedCardsRail({
  state,
  playLog,
}: {
  state: GameState;
  playLog: PlayLogEntry[];
}) {
  const groups = groupByTrick(playLog);
  const totalCards = state.tricksTotal * state.players.length;

  return (
    <aside className="gb-play-log" aria-label="Played cards in order">
      <div className="gb-play-log-head">
        <div>
          <div className="eyebrow">Played cards</div>
          <div className="gb-play-log-sub mono">
            {playLog.length}/{totalCards}
          </div>
        </div>
        {state.trumpCard && (
          <div className={"gb-log-trump" + (isRed(state.trumpCard.s) ? " red" : "")}>
            <span>{SUIT_CHAR[state.trumpCard.s]}</span>
            <b>{rankLabel(state.trumpCard)}</b>
          </div>
        )}
      </div>

      <div className="gb-play-log-list">
        {groups.length === 0 && <div className="gb-play-log-empty">No cards played yet</div>}
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
    </aside>
  );
}
