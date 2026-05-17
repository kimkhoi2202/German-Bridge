// German Bridge — pure state machine.
//
// All game logic lives here as pure functions over a `GameState` object.
// The Zustand store wraps these and provides UI bindings; everything is
// deterministic given the rng seed.

import { buildShoe, shuffle, type Card, type Suit, maxTricks } from "./cards";
import { resolveTrick, type Play } from "./trick";
import { score as scoreFn } from "./scoring";
import type { Personality } from "./bot";

export type Phase =
  | "lobby"
  | "dealing"
  | "trump"
  | "bidding"
  | "playing"
  | "trick-end"
  | "round-end"
  | "match-end";

export interface Player {
  id: string;
  name: string;
  isHuman: boolean;
  personality: Personality;
}

export interface RoundRecord {
  round: number;
  trump: Card;
  bids: number[];
  won: number[];
  scores: number[];
  dealerIdx: number;
}

export interface PlayLogEntry {
  trick: number;
  order: number;
  playerIdx: number;
  card: Card;
  winner?: boolean;
}

export interface GameState {
  // ── Match config ────────────────────────────────────────
  players: Player[];
  decks: number;
  /** Maximum hand size. A match plays scored hands from 1 card up to this value. */
  tricksPerHand: number;
  maxRounds: number;

  // ── Match progress ──────────────────────────────────────
  phase: Phase;
  round: number;
  dealerIdx: number;
  history: RoundRecord[];

  // ── Round state ─────────────────────────────────────────
  hands: Card[][];        // hands[playerIdx] = cards still in hand
  trumpCard: Card | null;
  tricksTotal: number;
  bids: (number | null)[];
  bidTurn: number;
  won: number[];
  trickIdx: number;
  currentTrick: Play[];
  playLog: PlayLogEntry[];
  leadIdx: number;
  turnIdx: number;
  trickWinner: number | null;
}

export interface MatchConfig {
  players: Player[];
  decks: number;
  /** Maximum hand size. A match plays scored hands from 1 card up to this value. */
  tricksPerHand: number;
  maxRounds: number;
}

export function tricksForRound(round: number, maxTricksPerHand: number): number {
  const normalizedRound = Math.max(1, Math.trunc(round));
  const normalizedMax = Math.max(1, Math.trunc(maxTricksPerHand));
  return Math.min(normalizedRound, normalizedMax);
}

/** Build initial game state in the `lobby` phase. */
export function initialState(config: MatchConfig): GameState {
  return {
    players: config.players,
    decks: config.decks,
    tricksPerHand: config.tricksPerHand,
    maxRounds: Math.max(1, Math.min(config.maxRounds, config.tricksPerHand)),
    phase: "lobby",
    round: 0,
    dealerIdx: 0,
    history: [],
    hands: [],
    trumpCard: null,
    tricksTotal: 0,
    bids: [],
    bidTurn: 0,
    won: [],
    trickIdx: 0,
    currentTrick: [],
    playLog: [],
    leadIdx: 0,
    turnIdx: 0,
    trickWinner: null,
  };
}

function randomSeatIndex(playerCount: number, rng: () => number): number {
  const raw = rng();
  const normalized = Number.isFinite(raw) ? raw : 0;
  return Math.max(0, Math.min(playerCount - 1, Math.floor(normalized * playerCount)));
}

/** Compute the bid value the last bidder cannot pick (or null if any is OK). */
export function lastBidderRestriction(
  bids: readonly (number | null)[],
  tricksTotal: number,
): number | null {
  const placed = bids.filter((b): b is number => b != null);
  if (placed.length !== bids.length - 1) return null;
  const sumOthers = placed.reduce((a, b) => a + b, 0);
  const r = tricksTotal - sumOthers;
  if (r < 0 || r > tricksTotal) return null;
  return r;
}

/**
 * Begin the next round: deal hands, flip trump.
 * Mutates a copy of state — caller must replace store.
 */
export function startRound(
  state: GameState,
  rng: () => number = Math.random,
): GameState {
  const { players, decks, tricksPerHand } = state;
  const max = maxTricks(players.length, decks);
  if (tricksPerHand > max || tricksPerHand < 1) {
    throw new Error(
      `Invalid tricksPerHand=${tricksPerHand} for players=${players.length}, decks=${decks} (max ${max}).`,
    );
  }
  const nextRoundNumber = state.round + 1;
  const tricksThisHand = tricksForRound(nextRoundNumber, tricksPerHand);
  const dealerIdx = state.round === 0
    ? randomSeatIndex(players.length, rng)
    : state.dealerIdx;

  const shoe = shuffle(buildShoe(decks), rng);
  const hands: Card[][] = players.map(() => []);
  for (let r = 0; r < tricksThisHand; r++) {
    for (let p = 0; p < players.length; p++) {
      const c = shoe.pop();
      if (!c) throw new Error("Shoe exhausted while dealing");
      hands[p].push(c);
    }
  }
  const trumpCard = shoe.pop();
  if (!trumpCard) throw new Error("No card available for trump flip");

  const lead = (dealerIdx + 1) % players.length;

  return {
    ...state,
    phase: "dealing",
    round: nextRoundNumber,
    dealerIdx,
    hands,
    trumpCard,
    tricksTotal: tricksThisHand,
    bids: Array(players.length).fill(null),
    bidTurn: lead,
    won: Array(players.length).fill(0),
    trickIdx: 0,
    currentTrick: [],
    playLog: [],
    leadIdx: lead,
    turnIdx: lead,
    trickWinner: null,
  };
}

/** Place a bid for the player whose turn it currently is. */
export function placeBid(state: GameState, playerIdx: number, bid: number): GameState {
  if (state.phase !== "bidding") {
    throw new Error(`placeBid called in phase=${state.phase}`);
  }
  if (state.bidTurn !== playerIdx) {
    throw new Error(`placeBid: not player ${playerIdx}'s turn`);
  }
  if (state.bids[playerIdx] != null) {
    throw new Error(`placeBid: player ${playerIdx} already bid`);
  }
  if (bid < 0 || bid > state.tricksTotal) {
    throw new Error(`placeBid: bid ${bid} out of range 0..${state.tricksTotal}`);
  }

  const placedBefore = state.bids.filter((b) => b != null).length;
  const isLast = placedBefore === state.players.length - 1;
  if (isLast) {
    const restricted = lastBidderRestriction(state.bids, state.tricksTotal);
    if (restricted != null && bid === restricted) {
      throw new Error(
        `placeBid: last bidder cannot choose ${bid} (totals would equal ${state.tricksTotal})`,
      );
    }
  }

  const bids = [...state.bids];
  bids[playerIdx] = bid;
  const filled = bids.filter((b) => b != null).length;

  if (filled === state.players.length) {
    return { ...state, bids, phase: "playing", turnIdx: state.leadIdx };
  }
  return {
    ...state,
    bids,
    bidTurn: (playerIdx + 1) % state.players.length,
  };
}

/** Play a card from the player whose turn it currently is. */
export function playCard(state: GameState, playerIdx: number, card: Card): GameState {
  if (state.phase !== "playing") {
    throw new Error(`playCard called in phase=${state.phase}`);
  }
  if (state.turnIdx !== playerIdx) {
    throw new Error(`playCard: not player ${playerIdx}'s turn`);
  }
  const hand = state.hands[playerIdx];
  if (!hand.some((c) => c.key === card.key)) {
    throw new Error(`playCard: card ${card.key} not in hand`);
  }
  // Must follow suit if able.
  const leadSuit: Suit | null = state.currentTrick.length
    ? state.currentTrick[0].card.s
    : null;
  if (leadSuit && card.s !== leadSuit) {
    if (hand.some((c) => c.s === leadSuit)) {
      throw new Error(`playCard: must follow suit ${leadSuit}`);
    }
  }

  const newHands = state.hands.map((h, i) =>
    i === playerIdx ? h.filter((c) => c.key !== card.key) : h,
  );
  const newTrick = [...state.currentTrick, { playerIdx, card }];
  const trickNumber = state.trickIdx + 1;
  const playLog: PlayLogEntry[] = [
    ...(state.playLog ?? []),
    {
      trick: trickNumber,
      order: state.currentTrick.length + 1,
      playerIdx,
      card,
    },
  ];

  if (newTrick.length < state.players.length) {
    return {
      ...state,
      hands: newHands,
      currentTrick: newTrick,
      playLog,
      turnIdx: (playerIdx + 1) % state.players.length,
    };
  }

  // Trick complete — resolve.
  const trumpSuit: Suit | null = state.trumpCard?.s ?? null;
  const winner = resolveTrick(newTrick, newTrick[0].card.s, trumpSuit);
  const resolvedPlayLog = playLog.map((entry) =>
    entry.trick === trickNumber
      ? { ...entry, winner: entry.playerIdx === winner.playerIdx }
      : entry,
  );
  return {
    ...state,
    hands: newHands,
    currentTrick: newTrick,
    playLog: resolvedPlayLog,
    phase: "trick-end",
    trickWinner: winner.playerIdx,
  };
}

/** Move past the trick-end animation: increment won counters & start next trick or end the round. */
export function settleTrick(state: GameState): GameState {
  if (state.phase !== "trick-end" || state.trickWinner == null) {
    throw new Error("settleTrick: not at trick-end");
  }
  const winner = state.trickWinner;
  const won = [...state.won];
  won[winner] += 1;

  const nextTrickIdx = state.trickIdx + 1;
  if (nextTrickIdx >= state.tricksTotal) {
    return finalizeRound({
      ...state,
      won,
      trickIdx: nextTrickIdx,
      currentTrick: [],
      trickWinner: null,
      leadIdx: winner,
      turnIdx: winner,
    });
  }

  return {
    ...state,
    won,
    trickIdx: nextTrickIdx,
    currentTrick: [],
    trickWinner: null,
    leadIdx: winner,
    turnIdx: winner,
    phase: "playing",
  };
}

function finalizeRound(state: GameState): GameState {
  const bids = state.bids.map((b) => b ?? 0);
  const scores = bids.map((b, i) => scoreFn(b, state.won[i]));
  const record: RoundRecord = {
    round: state.round,
    trump: state.trumpCard!,
    bids,
    won: [...state.won],
    scores,
    dealerIdx: state.dealerIdx,
  };
  return { ...state, history: [...state.history, record], phase: "round-end" };
}

/** Advance to the next round, or move to match-end if done. */
export function nextRound(state: GameState, rng: () => number = Math.random): GameState {
  if (state.phase !== "round-end") {
    throw new Error("nextRound: not at round-end");
  }
  if (state.round >= state.maxRounds) {
    return { ...state, phase: "match-end" };
  }
  const nextDealer = (state.dealerIdx + 1) % state.players.length;
  return startRound({ ...state, dealerIdx: nextDealer }, rng);
}

/** Cumulative score per player across all rounds played so far. */
export function cumulativeScores(state: GameState): number[] {
  return state.players.map((_, i) =>
    state.history.reduce((a, h) => a + (h.scores[i] ?? 0), 0),
  );
}
