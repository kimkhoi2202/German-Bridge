import { chooseBidWithTrace, chooseCardWithTrace, type BotDecisionTrace, type Personality } from "../../src/lib/bot";
import type { Card } from "../../src/lib/cards";
import { legalCards } from "../../src/lib/cards";
import {
  chooseRuntimeBotBidWithTrace,
  chooseRuntimeBotCardWithTrace,
} from "../../src/lib/ai/runtimeChampion";
import { createObservation } from "../../src/lib/botObservation";
import type { BotObservation } from "../../src/lib/botObservation";
import {
  cumulativeScores,
  initialState,
  nextRound,
  placeBid,
  playCard,
  settleTrick,
  startRound,
  type GameState,
  type MatchConfig,
  type Player,
} from "../../src/lib/game";
import type { Doc, Id } from "../_generated/dataModel";

const BOT_NAMES = [
  "Margot",
  "Theodore",
  "Imani",
  "Kasper",
  "Vesna",
  "Reuben",
  "Saoirse",
  "Bertram",
  "Ondine",
  "Fabien",
  "Linnea",
];

const BOT_MOODS: Personality[] = ["cautious", "mixed", "aggressive"];

export type Participant = Doc<"gameParticipants">;

export interface BotTurnTrace {
  seatIdx: number;
  phase: "bidding" | "playing";
  round: number;
  trickIdx: number;
  decision: BotDecisionTrace;
  observation: BotObservation;
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function rngFromSeed(seed: string) {
  let state = hashString(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function botNameForSeat(seatIdx: number) {
  return BOT_NAMES[(seatIdx - 1 + BOT_NAMES.length) % BOT_NAMES.length];
}

export function botMoodForSeat(seatIdx: number): Personality {
  return BOT_MOODS[(seatIdx - 1 + BOT_MOODS.length) % BOT_MOODS.length];
}

export function playersFromParticipants(participants: Participant[]): Player[] {
  return [...participants]
    .sort((a, b) => a.seatIdx - b.seatIdx)
    .map((participant) => ({
      id: participant.kind === "human" ? String(participant.userId) : `bot-${participant.seatIdx}`,
      name: participant.name,
      isHuman: participant.kind === "human",
      personality: participant.personality,
    }));
}

export function createStartedState(args: {
  game: Doc<"games">;
  participants: Participant[];
  seed: string;
}) {
  const config: MatchConfig = {
    players: playersFromParticipants(args.participants),
    decks: args.game.decks,
    startingTricksPerHand: args.game.startingTricksPerHand ?? 1,
    tricksPerHand: args.game.tricksPerHand,
    maxRounds: args.game.maxRounds,
  };
  return startRound(initialState(config), rngFromSeed(args.seed));
}

export function isBotTurn(state: GameState) {
  if (state.phase === "bidding") {
    return state.players[state.bidTurn]?.isHuman === false;
  }
  if (state.phase === "playing") {
    return state.players[state.turnIdx]?.isHuman === false;
  }
  return false;
}

export function isGptBotTurn(state: GameState) {
  if (!isBotTurn(state)) return false;
  const seatIdx = state.phase === "bidding" ? state.bidTurn : state.turnIdx;
  return state.players[seatIdx]?.personality === "gpt";
}

export function applyBotTurn(state: GameState) {
  if (state.phase === "bidding") {
    const seatIdx = state.bidTurn;
    const observation = createObservation(state, seatIdx);
    const decision =
      state.players[seatIdx]?.personality === "champion"
        ? chooseRuntimeBotBidWithTrace(state, seatIdx)
        : chooseBidWithTrace(observation);
    const value = decision.action;
    return {
      state: placeBid(state, seatIdx, value),
      event: { type: "bid", seatIdx, payload: { bid: value, bot: true } },
      aiTrace: {
        seatIdx,
        phase: "bidding",
        round: state.round,
        trickIdx: state.trickIdx,
        decision: decision.trace,
        observation,
      } satisfies BotTurnTrace,
    };
  }

  if (state.phase === "playing") {
    const seatIdx = state.turnIdx;
    const observation = createObservation(state, seatIdx);
    const decision =
      state.players[seatIdx]?.personality === "champion"
        ? chooseRuntimeBotCardWithTrace(state, seatIdx)
        : chooseCardWithTrace(observation);
    const card = decision.action;
    return {
      state: playCard(state, seatIdx, card),
      event: { type: "play", seatIdx, payload: { card, bot: true } },
      aiTrace: {
        seatIdx,
        phase: "playing",
        round: state.round,
        trickIdx: state.trickIdx,
        decision: decision.trace,
        observation,
      } satisfies BotTurnTrace,
    };
  }

  throw new Error("No bot turn to apply");
}

export function legalBidValues(state: GameState, seatIdx: number) {
  if (state.phase !== "bidding" || state.bidTurn !== seatIdx) return [];
  const placed = state.bids.filter((bid): bid is number => bid != null);
  const restricted =
    placed.length === state.players.length - 1
      ? state.tricksTotal - placed.reduce((sum, bid) => sum + bid, 0)
      : null;
  return Array.from({ length: state.tricksTotal + 1 }, (_, bid) => bid).filter(
    (bid) => bid !== restricted,
  );
}

export function legalCardKeys(state: GameState, seatIdx: number) {
  if (state.phase !== "playing" || state.turnIdx !== seatIdx) return [];
  const hand = state.hands[seatIdx] ?? [];
  const leadSuit = state.currentTrick.length ? state.currentTrick[0].card.s : null;
  return legalCards(hand, leadSuit).map((card) => card.key);
}

function hiddenCard(seatIdx: number, index: number): Card {
  return { r: "A", s: "s", d: 0, key: `hidden-${seatIdx}-${index}` };
}

function remapIndex(index: number, viewerSeatIdx: number, playerCount: number) {
  return (index - viewerSeatIdx + playerCount) % playerCount;
}

function remapArray<T>(values: readonly T[], viewerSeatIdx: number) {
  return values.map((_, index) => values[(index + viewerSeatIdx) % values.length]);
}

export function redactedStateForViewer(state: GameState, viewerSeatIdx: number): GameState {
  const playerCount = state.players.length;
  const remappedHands = remapArray(state.hands, viewerSeatIdx).map((hand, localSeatIdx) => {
    if (localSeatIdx === 0) return hand;
    const canonicalSeatIdx = (localSeatIdx + viewerSeatIdx) % playerCount;
    return Array.from({ length: hand.length }, (_, index) => hiddenCard(canonicalSeatIdx, index));
  });

  return {
    ...state,
    players: remapArray(state.players, viewerSeatIdx),
    hands: remappedHands,
    bids: remapArray(state.bids, viewerSeatIdx),
    won: remapArray(state.won, viewerSeatIdx),
    dealerIdx: remapIndex(state.dealerIdx, viewerSeatIdx, playerCount),
    bidTurn: remapIndex(state.bidTurn, viewerSeatIdx, playerCount),
    leadIdx: remapIndex(state.leadIdx, viewerSeatIdx, playerCount),
    turnIdx: remapIndex(state.turnIdx, viewerSeatIdx, playerCount),
    trickWinner:
      state.trickWinner == null
        ? null
        : remapIndex(state.trickWinner, viewerSeatIdx, playerCount),
    currentTrick: state.currentTrick.map((play) => ({
      ...play,
      playerIdx: remapIndex(play.playerIdx, viewerSeatIdx, playerCount),
    })),
    playLog: state.playLog.map((entry) => ({
      ...entry,
      playerIdx: remapIndex(entry.playerIdx, viewerSeatIdx, playerCount),
    })),
    history: state.history.map((round) => {
      const redactedRound = {
        ...round,
        bids: remapArray(round.bids, viewerSeatIdx),
        won: remapArray(round.won, viewerSeatIdx),
        scores: remapArray(round.scores, viewerSeatIdx),
        dealerIdx: remapIndex(round.dealerIdx, viewerSeatIdx, playerCount),
      };
      if (!round.playLog) return redactedRound;
      return {
        ...redactedRound,
        playLog: round.playLog.map((entry) => ({
          ...entry,
          playerIdx: remapIndex(entry.playerIdx, viewerSeatIdx, playerCount),
        })),
      };
    }),
  };
}

export function localSeatToCanonical(localSeatIdx: number, viewerSeatIdx: number, playerCount: number) {
  return (localSeatIdx + viewerSeatIdx) % playerCount;
}

export function finishRoundOrMatch(state: GameState, rng?: () => number) {
  return state.phase === "round-end" ? nextRound(state, rng) : state;
}

export function finalScores(state: GameState) {
  return cumulativeScores(state);
}

export function findCardInSeatHand(state: GameState, seatIdx: number, cardKey: string) {
  return (state.hands[seatIdx] ?? []).find((card) => card.key === cardKey) ?? null;
}

export type GameId = Id<"games">;
