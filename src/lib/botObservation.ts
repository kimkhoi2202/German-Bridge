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

export interface OpponentProfile {
  playerIdx: number;
  currentBid: number | null;
  currentWon: number;
  currentBidGap: number;
  cardsPlayed: number;
  tricksWon: number;
  leadCount: number;
  trumpPlayed: number;
  offSuitDiscards: number;
  voidSuits: Record<Suit, boolean>;
  priorRounds: number;
  priorBidTotal: number;
  priorWonTotal: number;
  priorMadeBidCount: number;
  priorOverBidCount: number;
  priorUnderBidCount: number;
  priorScoreTotal: number;
}

export interface BotObservation {
  playerIdx: number;
  playerCount: number;
  players: PublicPlayer[];
  decks: number;
  round: number;
  maxRounds: number;
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
  trickIdx: number;
  legalBids: number[];
  legalCards: Card[];
  remainingHandCounts: number[];
  opponentProfiles: OpponentProfile[];
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
    round: state.round,
    maxRounds: state.maxRounds,
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
    trickIdx: state.trickIdx,
    legalBids: legalBidsFor(state, playerIdx),
    legalCards: legalCardsFor(state, playerIdx),
    remainingHandCounts: state.hands.map((hand) => hand.length),
    opponentProfiles: buildOpponentProfiles(state),
  };
}

function buildOpponentProfiles(state: GameState): OpponentProfile[] {
  const leadSuitByTrick = new Map<number, Suit>();
  for (const entry of state.playLog) {
    if (entry.order === 1) {
      leadSuitByTrick.set(entry.trick, entry.card.s);
    }
  }

  return state.players.map((_, playerIdx) => {
    const bid = state.bids[playerIdx] ?? null;
    const won = state.won[playerIdx] ?? 0;
    const played = state.playLog.filter((entry) => entry.playerIdx === playerIdx);
    const voidSuits: Record<Suit, boolean> = { s: false, h: false, d: false, c: false };
    let offSuitDiscards = 0;

    for (const entry of played) {
      const leadSuit = leadSuitByTrick.get(entry.trick);
      if (leadSuit && entry.order > 1 && entry.card.s !== leadSuit) {
        offSuitDiscards += 1;
        voidSuits[leadSuit] = true;
      }
    }

    const prior = state.history.reduce(
      (acc, round) => {
        const priorBid = round.bids[playerIdx] ?? 0;
        const priorWon = round.won[playerIdx] ?? 0;
        acc.rounds += 1;
        acc.bidTotal += priorBid;
        acc.wonTotal += priorWon;
        acc.scoreTotal += round.scores[playerIdx] ?? 0;
        if (priorBid === priorWon) acc.madeBid += 1;
        if (priorBid > priorWon) acc.overBid += 1;
        if (priorBid < priorWon) acc.underBid += 1;
        return acc;
      },
      {
        rounds: 0,
        bidTotal: 0,
        wonTotal: 0,
        madeBid: 0,
        overBid: 0,
        underBid: 0,
        scoreTotal: 0,
      },
    );

    return {
      playerIdx,
      currentBid: bid,
      currentWon: won,
      currentBidGap: bid == null ? 0 : bid - won,
      cardsPlayed: played.length,
      tricksWon: played.filter((entry) => entry.winner === true).length,
      leadCount: played.filter((entry) => entry.order === 1).length,
      trumpPlayed: state.trumpCard ? played.filter((entry) => entry.card.s === state.trumpCard?.s).length : 0,
      offSuitDiscards,
      voidSuits,
      priorRounds: prior.rounds,
      priorBidTotal: prior.bidTotal,
      priorWonTotal: prior.wonTotal,
      priorMadeBidCount: prior.madeBid,
      priorOverBidCount: prior.overBid,
      priorUnderBidCount: prior.underBid,
      priorScoreTotal: prior.scoreTotal,
    };
  });
}
