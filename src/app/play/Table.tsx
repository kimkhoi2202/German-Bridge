"use client";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useMatch } from "@/store/match";
import { useSettings } from "@/store/settings";
import { PlayingCard } from "@/components/PlayingCard";
import { CardMark } from "@/components/CardMark";
import { useRouter } from "next/navigation";
import { SUIT_CHAR, SUIT_NAME, isRed, sortHand, legalCards } from "@/lib/cards";
import type { Card } from "@/lib/cards";
import { cumulativeScores, type GameState, type PlayLogEntry } from "@/lib/game";
import { formatCurrentHand } from "@/lib/matchLabels";
import { easeOutQuart, exitTransition, stateTransition } from "@/lib/uiMotion";
import { BiddingDial } from "./BiddingDial";
import { humanSeatPos, seatDensity, seatPos } from "./tableLayout";

type RectSnapshot = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CardFlight = {
  id: string;
  playKey: string;
  card: Card;
  rect: RectSnapshot;
  fromX: number;
  fromY: number;
  trailX: number;
  trailY: number;
  startScale: number;
  startRotate: number;
  duration: number;
};

type TrickCollectCard = {
  id: string;
  playKey: string;
  card: Card;
  rect: RectSnapshot;
  liftX: number;
  liftY: number;
  toX: number;
  toY: number;
  startRotate: number;
  liftRotate: number;
  endRotate: number;
  delay: number;
};

type TrickCollectFlight = {
  id: string;
  trickKey: string;
  cards: TrickCollectCard[];
  duration: number;
};

const RAD_TO_DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function snapshotRect(rect: DOMRectReadOnly | RectSnapshot): RectSnapshot {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function centerOf(rect: RectSnapshot) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function targetCardRect(node: HTMLElement) {
  const cardNode = node.querySelector<HTMLElement>(".card");
  return snapshotRect((cardNode ?? node).getBoundingClientRect());
}

function fallbackOriginRect(playerIdx: number, playerCount: number, target: RectSnapshot): RectSnapshot {
  const width = Math.max(42, Math.min(78, target.width * 0.72));
  const height = width * 1.4;
  let x = window.innerWidth / 2;
  let y = window.innerHeight - Math.max(92, height * 0.7);

  if (playerIdx > 0) {
    const pos = seatPos(playerIdx, playerCount);
    x = (window.innerWidth * pos.x) / 100;
    y = (window.innerHeight * pos.y) / 100;
  }

  return {
    left: x - width / 2,
    top: y - height / 2,
    width,
    height,
  };
}

function playKey(play: { playerIdx: number; card: Card }, round: number, trickIdx: number, order: number) {
  return `${round}:${trickIdx}:${order}:${play.playerIdx}:${play.card.key}`;
}

function normalizeRotation(degrees: number) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

function cardStartRotation(fromX: number, fromY: number, order: number) {
  if (Math.abs(fromX) < 0.1 && Math.abs(fromY) < 0.1) return 0;
  const tableFacing = -Math.atan2(fromX, fromY) * RAD_TO_DEG;
  const wristAngle = clamp(fromX * 0.003 + (order - 1.5) * 0.35, -3.5, 3.5);
  return normalizeRotation(tableFacing + wristAngle);
}

function trickCollectKey(state: GameState, playKeys: readonly string[]) {
  return `${state.round}:${state.trickIdx}:${state.trickWinner ?? "none"}:${playKeys.join("|")}`;
}

export function Table() {
  return <TableView />;
}

export function TableView({
  state: stateProp,
  onPlay,
  onAbandon,
  onBid,
  onPreMove,
  cardPlayDisabled = false,
  bidSubmitting = false,
  preMoveCardKey = null,
}: {
  state?: GameState | null;
  onPlay?: (card: Card) => void;
  onAbandon?: () => void;
  onBid?: (value: number) => void;
  onPreMove?: (card: Card | null) => void;
  cardPlayDisabled?: boolean;
  bidSubmitting?: boolean;
  preMoveCardKey?: string | null;
}) {
  const router = useRouter();
  const localState = useMatch((s) => s.state);
  const localPlay = useMatch((s) => s.play);
  const localAbandon = useMatch((s) => s.abandonMatch);
  const layout = useSettings((s) => s.layout);
  const showTrumpHints = useSettings((s) => s.showTrumpHints);
  const animationsEnabled = useSettings((s) => s.animations);
  const state = stateProp ?? localState;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [tableFanMaxWidth, setTableFanMaxWidth] = useState(780);
  const [flights, setFlights] = useState<CardFlight[]>([]);
  const [collectFlights, setCollectFlights] = useState<TrickCollectFlight[]>([]);
  const [hiddenPlayKeys, setHiddenPlayKeys] = useState<Set<string>>(() => new Set());
  const [collectingPlayKeys, setCollectingPlayKeys] = useState<Set<string>>(() => new Set());
  const prefersReducedMotion = useReducedMotion();
  const shouldReduceMotion = prefersReducedMotion || !animationsEnabled;
  const historyTitleId = useId();
  const leaderboardTitleId = useId();
  const originRefs = useRef(new Map<number, HTMLElement>());
  const winnerRefs = useRef(new Map<number, HTMLElement>());
  const targetRefs = useRef(new Map<string, HTMLElement>());
  const clickOriginsRef = useRef(new Map<string, RectSnapshot>());
  const prevPlayKeysRef = useRef<string[]>([]);
  const collectedTricksRef = useRef(new Set<string>());

  useEffect(() => {
    const updateFanWidth = () => setTableFanMaxWidth(Math.min(window.innerWidth - 32, 780));
    updateFanWidth();
    window.addEventListener("resize", updateFanWidth);
    return () => window.removeEventListener("resize", updateFanWidth);
  }, []);

  const setSeatNodeRef = useCallback(
    (playerIdx: number) => (node: HTMLDivElement | null) => {
      if (node) {
        originRefs.current.set(playerIdx, node);
        winnerRefs.current.set(playerIdx, node);
      } else {
        originRefs.current.delete(playerIdx);
        winnerRefs.current.delete(playerIdx);
      }
    },
    [],
  );

  const setHumanWinnerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) winnerRefs.current.set(0, node);
    else winnerRefs.current.delete(0);
  }, []);

  const setTargetRef = useCallback(
    (key: string) => (node: HTMLDivElement | null) => {
      if (node) targetRefs.current.set(key, node);
      else targetRefs.current.delete(key);
    },
    [],
  );

  const captureClickOrigin = useCallback((cardKey: string, node: HTMLElement) => {
    clickOriginsRef.current.set(cardKey, snapshotRect(node.getBoundingClientRect()));
  }, []);

  const completeFlight = useCallback((flightId: string, playKeyToReveal: string) => {
    setFlights((current) => current.filter((flight) => flight.id !== flightId));
    setHiddenPlayKeys((current) => {
      if (!current.has(playKeyToReveal)) return current;
      const next = new Set(current);
      next.delete(playKeyToReveal);
      return next;
    });
  }, []);

  const completeCollectFlight = useCallback((flightId: string) => {
    setCollectFlights((current) => current.filter((flight) => flight.id !== flightId));
  }, []);

  const currentTrickPlays = useMemo(
    () =>
      state
        ? state.currentTrick.map((play, index) => ({
            ...play,
            order: index,
            playKey: playKey(play, state.round, state.trickIdx, index),
          }))
        : [],
    [state],
  );
  const currentPlayKeys = useMemo(
    () => currentTrickPlays.map((play) => play.playKey),
    [currentTrickPlays],
  );

  useLayoutEffect(() => {
    if (!state) {
      prevPlayKeysRef.current = [];
      setFlights((current) => (current.length ? [] : current));
      setCollectFlights((current) => (current.length ? [] : current));
      setHiddenPlayKeys((current) => (current.size ? new Set() : current));
      setCollectingPlayKeys((current) => (current.size ? new Set() : current));
      collectedTricksRef.current.clear();
      return;
    }

    const previousKeys = prevPlayKeysRef.current;
    const previousKeySet = new Set(previousKeys);
    const addedPlays = currentTrickPlays.filter((play) => !previousKeySet.has(play.playKey));
    prevPlayKeysRef.current = currentPlayKeys;

    setHiddenPlayKeys((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of current) {
        if (currentPlayKeys.includes(key)) next.add(key);
        else changed = true;
      }
      return changed ? next : current;
    });
    setCollectingPlayKeys((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of current) {
        if (currentPlayKeys.includes(key)) next.add(key);
        else changed = true;
      }
      return changed ? next : current;
    });
    setFlights((current) => {
      const next = current.filter((flight) => currentPlayKeys.includes(flight.playKey));
      return next.length === current.length ? current : next;
    });

    if (shouldReduceMotion || addedPlays.length === 0) {
      return;
    }

    const newFlights = addedPlays.flatMap((play) => {
      const targetNode = targetRefs.current.get(play.playKey);
      if (!targetNode) return [];

      const targetRect = targetCardRect(targetNode);
      if (targetRect.width <= 0 || targetRect.height <= 0) return [];

      const clickOrigin = clickOriginsRef.current.get(play.card.key);
      const originRect =
        clickOrigin ??
        (play.playerIdx === 0 ? undefined : originRefs.current.get(play.playerIdx)?.getBoundingClientRect()) ??
        originRefs.current.get(play.playerIdx)?.getBoundingClientRect();
      clickOriginsRef.current.delete(play.card.key);

      const source = originRect
        ? snapshotRect(originRect)
        : fallbackOriginRect(play.playerIdx, state.players.length, targetRect);
      const sourceCenter = centerOf(source);
      const targetCenter = centerOf(targetRect);
      const fromX = sourceCenter.x - targetCenter.x;
      const fromY = sourceCenter.y - targetCenter.y;
      const distance = Math.hypot(fromX, fromY);
      const duration = clamp(0.24 + distance / 2100, 0.34, 0.56);
      const startRotate = cardStartRotation(fromX, fromY, play.order);
      const trailLength = distance > 0 ? clamp(distance / 52, 4, 14) : 0;
      const trailX = distance > 0 ? (fromX / distance) * trailLength : 0;
      const trailY = distance > 0 ? (fromY / distance) * trailLength : 0;

      return [{
        id: `${play.playKey}:${performance.now()}`,
        playKey: play.playKey,
        card: play.card,
        rect: targetRect,
        fromX,
        fromY,
        trailX,
        trailY,
        startScale: clickOrigin ? clamp(source.width / targetRect.width, 0.72, 1.08) : 0.76,
        startRotate,
        duration,
      }];
    });

    if (newFlights.length === 0) {
      return;
    }

    setHiddenPlayKeys((current) => {
      const next = new Set(current);
      for (const flight of newFlights) next.add(flight.playKey);
      return next;
    });
    setFlights((current) => [...current, ...newFlights]);
  }, [currentPlayKeys, currentTrickPlays, shouldReduceMotion, state]);

  useLayoutEffect(() => {
    if (
      !state ||
      shouldReduceMotion ||
      state.phase !== "trick-end" ||
      state.trickWinner == null ||
      currentTrickPlays.length === 0 ||
      flights.length > 0 ||
      hiddenPlayKeys.size > 0
    ) {
      return;
    }

    const collectKey = trickCollectKey(state, currentPlayKeys);
    if (collectedTricksRef.current.has(collectKey)) return;

    const referenceNode = targetRefs.current.get(currentTrickPlays[0]?.playKey ?? "");
    const referenceRect = referenceNode
      ? targetCardRect(referenceNode)
      : {
          left: window.innerWidth / 2 - 40,
          top: window.innerHeight / 2 - 56,
          width: 80,
          height: 112,
        };
    const winnerRect = winnerRefs.current.get(state.trickWinner)
      ? snapshotRect(winnerRefs.current.get(state.trickWinner)!.getBoundingClientRect())
      : fallbackOriginRect(state.trickWinner, state.players.length, referenceRect);
    if (winnerRect.width <= 0 || winnerRect.height <= 0) return;

    const winnerCenter = centerOf(winnerRect);
    const midpoint = (currentTrickPlays.length - 1) / 2;
    let farthestDistance = 0;
    const cards = currentTrickPlays.flatMap((play, index) => {
      const targetNode = targetRefs.current.get(play.playKey);
      if (!targetNode) return [];

      const rect = targetCardRect(targetNode);
      if (rect.width <= 0 || rect.height <= 0) return [];

      const sourceCenter = centerOf(rect);
      const spread = index - midpoint;
      const baseToX = winnerCenter.x - sourceCenter.x;
      const baseToY = winnerCenter.y - sourceCenter.y;
      const distance = Math.hypot(baseToX, baseToY);
      farthestDistance = Math.max(farthestDistance, distance);
      const pullAngle = Math.atan2(baseToY, baseToX) * RAD_TO_DEG;

      return [{
        id: `${collectKey}:${play.playKey}`,
        playKey: play.playKey,
        card: play.card,
        rect,
        liftX: clamp(-baseToX * 0.055 + spread * 8, -30, 30),
        liftY: clamp(-18 - Math.abs(baseToY) * 0.028, -46, -18),
        toX: baseToX + clamp(spread * 4.5, -18, 18),
        toY: baseToY + clamp(Math.abs(spread) * 2.2, -2, 10),
        startRotate: normalizeRotation(spread * 2.4),
        liftRotate: normalizeRotation(spread * 4.4),
        endRotate: normalizeRotation(clamp(pullAngle * 0.08, -11, 11) + spread * 5.6),
        delay: index * 0.018,
      }];
    });

    if (cards.length !== currentTrickPlays.length) return;

    collectedTricksRef.current.add(collectKey);
    setCollectingPlayKeys((current) => {
      const next = new Set(current);
      for (const card of cards) next.add(card.playKey);
      return next;
    });
    setCollectFlights((current) => [
      ...current,
      {
        id: `${collectKey}:${performance.now()}`,
        trickKey: collectKey,
        cards,
        duration: clamp(0.48 + farthestDistance / 2600 + cards.length * 0.008, 0.56, 0.82),
      },
    ]);
  }, [
    currentPlayKeys,
    currentTrickPlays,
    flights.length,
    hiddenPlayKeys.size,
    shouldReduceMotion,
    state,
  ]);

  if (!state) return null;

  const trumpSuit = state.trumpCard?.s ?? null;
  const youHand = state.hands[0] ?? [];
  const sortedYou = trumpSuit ? sortHand(youHand, trumpSuit) : youHand;
  const leadSuit = state.currentTrick.length ? state.currentTrick[0].card.s : null;
  const myLegal =
    state.phase === "playing" ? new Set(legalCards(youHand, leadSuit).map((c) => c.key)) : null;
  const playLog = state.playLog ?? [];
  const trickCards = state.currentTrick.length;
  const isHumanActing =
    (state.phase === "bidding" && state.bidTurn === 0) ||
    (state.phase === "playing" && state.turnIdx === 0 && state.trickWinner == null);
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
  const humanSeat = humanSeatPos();
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
            {formatCurrentHand(state.round, state.maxRounds)}
          </span>
        </div>
        <div className="gb-hud-pill">
          <span className="lbl">Total Bids</span>
          <span className="mono">
            {totalBid}
          </span>
        </div>
        <div className="gb-hud-pill">
          <span className="lbl">Total Cards Played</span>
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
          onClick={() => {
            setLeaderboardOpen(false);
            setHistoryOpen(true);
          }}
        >
          <span>History</span>
          <span className="mono">{playLog.length}</span>
        </button>
        <button
          type="button"
          className="gb-hud-btn history"
          aria-haspopup="dialog"
          aria-expanded={leaderboardOpen}
          onClick={() => {
            setHistoryOpen(false);
            setLeaderboardOpen(true);
          }}
        >
          <span>Leaderboard</span>
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
                    {currentTrickPlays.map((p, index) => {
                      const isWinner = state.trickWinner === p.playerIdx;
                      return (
                        <motion.div
                          ref={setTargetRef(p.playKey)}
                          key={p.playKey}
                          initial={
                            hiddenPlayKeys.has(p.playKey)
                              ? false
                              : { opacity: 0, transform: "translateY(10px) scale(0.96)" }
                          }
                          animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
                          transition={stateTransition}
                          className={
                            "gb-trick-card" +
                            (isWinner ? " winner" : "") +
                            (hiddenPlayKeys.has(p.playKey) ? " settling" : "") +
                            (collectingPlayKeys.has(p.playKey) ? " collecting" : "")
                          }
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
                  <div ref={setSeatNodeRef(i)} className="gb-seat-id">
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

            <div
              className={"gb-seat gb-seat-human" + (isHumanActing ? " acting" : "")}
              data-zone={humanSeat.zone}
              style={{ left: `${humanSeat.x}%`, top: `${humanSeat.y}%` }}
            >
              <div ref={setHumanWinnerRef} className="gb-seat-id gb-hero-meta">
                <div className="gb-seat-info">
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
            </div>
          </div>
        </div>

        {state.phase === "bidding" && (
          <div className="gb-bid-stack">
            <div className="gb-table-dock" data-mode="bid">
              <BiddingDial
                variant="panel"
                state={state}
                onBid={onBid}
                isSubmitting={bidSubmitting}
              />
            </div>
          </div>
        )}

        {/* Hero hand */}
        <div className="gb-hero">
          <div className="gb-hero-hand">
            {sortedYou.map((c, index) => {
              const isYourTurn =
                state.phase === "playing" && state.turnIdx === 0 && state.trickWinner == null;
              const isLegal = state.phase !== "playing" || myLegal?.has(c.key) === true;
              const isTrump = c.s === trumpSuit && showTrumpHints;
              const isPlayable = !cardPlayDisabled && isYourTurn && isLegal;
              const canPreMove =
                !!onPreMove &&
                !cardPlayDisabled &&
                state.phase === "playing" &&
                !isYourTurn &&
                state.trickWinner == null &&
                leadSuit != null &&
                state.players[0]?.isHuman === true &&
                isLegal;
              const isPreMove = preMoveCardKey === c.key;
              const disabled = !isPlayable && !canPreMove;
              const rank = c.r === "T" ? "10" : c.r;
              const cardName = `${rank} of ${SUIT_NAME[c.s]}`;
              const preMoveLabel = isPreMove
                ? `Pre-move selected: ${cardName}`
                : `Right-click to pre-move ${cardName}`;
              const handlePreMove = (node: HTMLElement) => {
                if (!canPreMove) return;
                captureClickOrigin(c.key, node);
                onPreMove?.(isPreMove ? null : c);
              };
              return (
                <button
                  key={c.key}
                  className={
                    "gb-hero-card" +
                    (isPlayable ? " playable" : "") +
                    (canPreMove ? " pre-move-selectable" : "") +
                    (isPreMove ? " pre-move" : "") +
                    (isYourTurn && !isLegal ? " unavailable" : "") +
                    (isTrump ? " trump" : "") +
                    (isTrump && isRed(c.s) ? " trump-red" : "")
                  }
                  data-trump-suit={isTrump ? SUIT_CHAR[c.s] : undefined}
                  disabled={disabled}
                  aria-label={
                    canPreMove || isPreMove
                      ? preMoveLabel
                      : isYourTurn
                      ? isLegal
                        ? `Play ${cardName}`
                        : `${cardName} unavailable; follow suit`
                      : `${cardName} in your hand`
                  }
                  aria-pressed={isPreMove ? true : undefined}
                  title={canPreMove ? "Right-click to pre-move" : undefined}
                  onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                    if (!isPlayable) return;
                    captureClickOrigin(c.key, event.currentTarget);
                    if (onPlay) onPlay(c);
                    else localPlay(0, c);
                  }}
                  onContextMenu={(event: ReactMouseEvent<HTMLButtonElement>) => {
                    if (!canPreMove) return;
                    event.preventDefault();
                    handlePreMove(event.currentTarget);
                  }}
                  onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
                    if (!canPreMove || (event.key !== "Enter" && event.key !== " ")) return;
                    event.preventDefault();
                    handlePreMove(event.currentTarget);
                  }}
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
        {leaderboardOpen && (
          <LeaderboardModal
            state={state}
            titleId={leaderboardTitleId}
            onClose={() => setLeaderboardOpen(false)}
          />
        )}
      </AnimatePresence>
      <CardFlightLayer flights={flights} onComplete={completeFlight} />
      <TrickCollectLayer flights={collectFlights} onComplete={completeCollectFlight} />
    </div>
  );
}

const flightMoveEase: [number, number, number, number] = [0.645, 0.045, 0.355, 1];
const flightCollectEase: [number, number, number, number] = [0.76, 0, 0.24, 1];

function flightTransform(x: number, y: number, rotate: number, scale: number) {
  return `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg) scale(${scale})`;
}

function CardFlightLayer({
  flights,
  onComplete,
}: {
  flights: CardFlight[];
  onComplete: (flightId: string, playKey: string) => void;
}) {
  return (
    <div className="gb-card-flight-layer" aria-hidden="true">
      <AnimatePresence>
        {flights.map((flight) => (
          <motion.div
            key={flight.id}
            className="gb-card-flight"
            style={{
              left: flight.rect.left,
              top: flight.rect.top,
              width: flight.rect.width,
              height: flight.rect.height,
            }}
            initial={{
              opacity: 1,
              transform: flightTransform(flight.fromX, flight.fromY, flight.startRotate, flight.startScale),
            }}
            animate={{
              opacity: 1,
              transform: flightTransform(0, 0, 0, 1),
            }}
            exit={{ opacity: 0, transition: { duration: 0.04 } }}
            transition={{
              duration: flight.duration,
              ease: flightMoveEase,
            }}
            onAnimationComplete={() => onComplete(flight.id, flight.playKey)}
          >
            <motion.div
              className="gb-card-flight-smear"
              style={{
                transform: `translate3d(${flight.trailX}px, ${flight.trailY}px, 0) scale(1.01)`,
              }}
              initial={{
                opacity: 0.18,
              }}
              animate={{
                opacity: 0,
              }}
              transition={{
                duration: flight.duration * 0.82,
                ease: easeOutQuart,
              }}
            >
              <PlayingCard card={flight.card} size={flight.rect.width} priority />
            </motion.div>
            <div className="gb-card-flight-body">
              <PlayingCard card={flight.card} size={flight.rect.width} priority />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function TrickCollectLayer({
  flights,
  onComplete,
}: {
  flights: TrickCollectFlight[];
  onComplete: (flightId: string) => void;
}) {
  return (
    <div className="gb-card-flight-layer gb-trick-collect-layer" aria-hidden="true">
      <AnimatePresence>
        {flights.flatMap((flight) =>
          flight.cards.map((card, index) => {
            const isLastCard = index === flight.cards.length - 1;
            return (
              <motion.div
                key={`${flight.id}:${card.id}`}
                className="gb-trick-collect-card"
                style={{
                  left: card.rect.left,
                  top: card.rect.top,
                  width: card.rect.width,
                  height: card.rect.height,
                }}
                initial={{
                  opacity: 1,
                  transform: flightTransform(0, 0, card.startRotate, 1),
                }}
                animate={{
                  opacity: [1, 1, 0.96, 0],
                  transform: [
                    flightTransform(0, 0, card.startRotate, 1),
                    flightTransform(card.liftX, card.liftY, card.startRotate + card.liftRotate, 1.035),
                    flightTransform(
                      card.toX * 0.78 + card.liftX * 0.18,
                      card.toY * 0.78 + card.liftY * 0.18,
                      card.endRotate,
                      0.58,
                    ),
                    flightTransform(card.toX, card.toY, card.endRotate, 0.34),
                  ],
                }}
                exit={{ opacity: 0, transition: { duration: 0.04 } }}
                transition={{
                  duration: flight.duration,
                  times: [0, 0.18, 0.80, 1],
                  ease: flightCollectEase,
                  delay: card.delay,
                }}
                onAnimationComplete={isLastCard ? () => onComplete(flight.id) : undefined}
              >
                <PlayingCard card={card.card} size={card.rect.width} priority />
              </motion.div>
            );
          }),
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

function ModalCloseButton({
  label,
  onClose,
}: {
  label: string;
  onClose: () => void;
}) {
  return (
    <button type="button" className="gb-history-close" aria-label={label} onClick={onClose}>
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle className="gb-history-close-disc" cx="24" cy="24" r="22" />
        <path
          className="gb-history-close-mark"
          d="M16.5 16.5L31.5 31.5M31.5 16.5L16.5 31.5"
        />
      </svg>
    </button>
  );
}

const LeaderboardModal = memo(function LeaderboardModal({
  state,
  titleId,
  onClose,
}: {
  state: GameState;
  titleId: string;
  onClose: () => void;
}) {
  const cumulative = useMemo(() => cumulativeScores(state), [state]);
  const ranked = useMemo(
    () =>
      state.players
        .map((player, playerIndex) => ({
          player,
          playerIndex,
          total: cumulative[playerIndex] ?? 0,
          bid: state.bids[playerIndex],
          won: state.won[playerIndex] ?? 0,
        }))
        .sort((a, b) => b.total - a.total || a.playerIndex - b.playerIndex),
    [cumulative, state],
  );

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
        className="gb-history-modal gb-leaderboard-modal"
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
            <div className="eyebrow">Leaderboard</div>
            <h2 id={titleId}>Standings</h2>
          </div>
          <ModalCloseButton label="Close leaderboard" onClose={onClose} />
        </div>

        <div className="gb-history-summary">
          <span className="mono">
            Hand {state.round}/{state.maxRounds}
          </span>
          <span className="mono">
            Cards played {state.trickIdx}/{state.tricksTotal}
          </span>
        </div>

        <div className="gb-leaderboard-list">
          {ranked.map(({ player, playerIndex, total, bid, won }, rank) => (
            <div
              key={player.id}
              className={"gb-leaderboard-row" + (player.isHuman ? " you" : "")}
            >
              <div className="gb-leaderboard-rank mono">{rank + 1}</div>
              <div className="gb-leaderboard-player">
                <span>{player.name}</span>
                <small>{player.isHuman ? "You" : `Seat ${playerIndex + 1}`}</small>
              </div>
              <div className="gb-leaderboard-hand mono">
                bid {bid ?? "-"} · won {won}
              </div>
              <div className="gb-leaderboard-score mono">{total}</div>
            </div>
          ))}
        </div>
      </motion.section>
    </motion.div>
  );
});

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
          <ModalCloseButton label="Close history" onClose={onClose} />
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
                  <span>Cards {trick}</span>
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
