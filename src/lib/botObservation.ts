import { legalCards as legalCardsForHand, type Card, type Suit } from "./cards";
import {
  lastBidderRestriction,
  type GameState,
  type Phase,
  type PlayLogEntry,
  type Player,
} from "./game";
import type { Play } from "./trick";

export interface PublicPlayer {
  id: string;
  name: string;
  isHuman: boolean;
  personality: Player["personality"];
}

export interface BotObservation {
  playerIdx: number;
  playerCount: number;
  players: PublicPlayer[];
  decks: number;
  tricksPerHand: number;
  tricksTotal: number;
  phase: Phase;
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  ownHand: Card[];
  bids: (number | null)[];
  won: number[];
  currentTrick: Play[];
  playLog: PlayLogEntry[];
  leadIdx: number;
  turnIdx: number;
  bidTurn: number;
  legalBids: number[];
  legalCards: Card[];
  remainingHandCounts: number[];
}

export function legalBidsFor(state: GameState, playerIdx: number): number[] {
  if (state.phase !== "bidding" || state.bidTurn !== playerIdx) return [];
  const placedBefore = state.bids.filter((b) => b != null).length;
  const isLast = placedBefore === state.players.length - 1;
  const restricted = isLast
    ? lastBidderRestriction(state.bids, state.tricksTotal)
    : null;

  return Array.from({ length: state.tricksTotal + 1 }, (_, bid) => bid).filter(
    (bid) => restricted == null || bid !== restricted,
  );
}

export function legalCardsFor(state: GameState, playerIdx: number): Card[] {
  if (state.phase !== "playing" || state.turnIdx !== playerIdx) return [];
  const hand = state.hands[playerIdx] ?? [];
  const leadSuit = state.currentTrick.length ? state.currentTrick[0].card.s : null;
  return legalCardsForHand(hand, leadSuit);
}

export function createObservation(state: GameState, playerIdx: number): BotObservation {
  const ownHand = [...(state.hands[playerIdx] ?? [])];
  return {
    playerIdx,
    playerCount: state.players.length,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHuman: p.isHuman,
      personality: p.personality,
    })),
    decks: state.decks,
    tricksPerHand: state.tricksPerHand,
    tricksTotal: state.tricksTotal,
    phase: state.phase,
    trumpCard: state.trumpCard,
    trumpSuit: state.trumpCard?.s ?? null,
    ownHand,
    bids: [...state.bids],
    won: [...state.won],
    currentTrick: state.currentTrick.map((play) => ({ ...play })),
    playLog: state.playLog.map((entry) => ({ ...entry })),
    leadIdx: state.leadIdx,
    turnIdx: state.turnIdx,
    bidTurn: state.bidTurn,
    legalBids: legalBidsFor(state, playerIdx),
    legalCards: legalCardsFor(state, playerIdx),
    remainingHandCounts: state.hands.map((hand) => hand.length),
  };
}
