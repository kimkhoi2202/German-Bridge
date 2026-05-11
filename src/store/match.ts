// Active match state — single in-flight game (or null).
// Persisted so the user can refresh mid-trick and keep playing.
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  initialState,
  nextRound,
  placeBid,
  playCard,
  settleTrick,
  startRound,
  type GameState,
  type MatchConfig,
  type Player,
  type RoundRecord,
} from "@/lib/game";
import { maxTricks, type Card } from "@/lib/cards";
import type { Personality } from "@/lib/bot";
import {
  clampDecks,
  clampInteger,
  clampPlayers,
  clampTricksPerHand,
  finiteNumber,
  finiteNumberArray,
  isCard,
  sanitizeBotOverrides,
  sanitizePersonality,
  sanitizePlayerName,
} from "@/lib/hardening";

// Server-side fallback so SSR doesn't crash trying to read window.localStorage.
const memoryStorage = (() => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
})();

const BOT_NAMES = [
  "Margot", "Theodore", "Imani", "Kasper", "Vesna", "Reuben",
  "Saoirse", "Bertram", "Ondine", "Fabien", "Linnea",
];

export interface MatchSummary {
  finishedAt: number;
  config: { players: number; decks: number; tricksPerHand: number };
  players: { name: string; isHuman: boolean }[];
  cumulative: number[];
  hands: RoundRecord[];
  rounds?: RoundRecord[];
  winnerIdx: number;
}

interface MatchStore {
  /** Null when no match is active (lobby). */
  state: GameState | null;
  /** Past completed matches, newest first. */
  archive: MatchSummary[];

  // ── Lobby actions ───────────────────────────────────────
  startMatch: (args: {
    playerCount: number;
    decks: number;
    tricksPerHand: number;
    botMood: Personality;
    botOverrides: (Personality | null)[];
    playerName: string;
  }) => void;
  abandonMatch: () => void;

  // ── Round-flow actions ──────────────────────────────────
  beginDealing: () => void;
  revealTrump: () => void;
  beginBidding: () => void;
  bid: (playerIdx: number, value: number) => void;
  play: (playerIdx: number, card: Card) => void;
  /** Settle the just-completed trick (advance trick-end → playing or round-end). */
  settle: () => void;
  advanceRound: () => void;
  finishMatch: () => void;
  archiveCurrent: () => void;
  clearArchive: () => void;
}

function buildPlayers(args: {
  playerCount: number;
  botMood: Personality;
  botOverrides: (Personality | null)[];
  playerName: string;
}): Player[] {
  const moods: Personality[] = ["cautious", "mixed", "aggressive"];
  const me: Player = {
    id: "you",
    name: sanitizePlayerName(args.playerName),
    isHuman: true,
    personality: "mixed",
  };
  const bots: Player[] = Array.from({ length: args.playerCount - 1 }, (_, i) => {
    const ov = sanitizeBotOverrides(args.botOverrides, args.playerCount - 1)[i];
    const baseMood: Personality =
      args.botMood === "mixed" ? moods[i % 3] : args.botMood;
    return {
      id: `bot${i}`,
      name: BOT_NAMES[i % BOT_NAMES.length],
      isHuman: false,
      personality: ov ?? baseMood,
    };
  });
  return [me, ...bots];
}

function sanitizeRoundRecords(value: unknown, playerCount: number): RoundRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((record, index) => {
    const round = record as Partial<RoundRecord> | undefined;
    if (!round || !isCard(round.trump)) return [];
    return [{
      round: clampInteger(round.round, 1, 999, index + 1),
      trump: round.trump,
      bids: finiteNumberArray(round.bids, playerCount),
      won: finiteNumberArray(round.won, playerCount),
      scores: finiteNumberArray(round.scores, playerCount),
      dealerIdx: clampInteger(round.dealerIdx, 0, playerCount - 1, 0),
    }];
  });
}

function sanitizeArchive(value: unknown): MatchSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((summary) => {
    const item = summary as Partial<MatchSummary> | undefined;
    if (!item || !Array.isArray(item.players)) return [];
    const players = item.players.slice(0, 12).map((player, index) => ({
      name: sanitizePlayerName(player?.name, index === 0 ? "You" : `Player ${index + 1}`),
      isHuman: player?.isHuman === true,
    }));
    const playerCount = clampPlayers(players.length, 4);
    if (players.length < playerCount) return [];
    const decks = clampDecks(item.config?.decks, 1);
    const tricksPerHand = clampTricksPerHand(
      item.config?.tricksPerHand,
      playerCount,
      decks,
      1,
    );
    const hands = sanitizeRoundRecords(item.hands ?? item.rounds, playerCount);
    const cumulative = finiteNumberArray(item.cumulative, playerCount);
    const winnerIdx = clampInteger(item.winnerIdx, 0, playerCount - 1, 0);

    return [{
      finishedAt: finiteNumber(item.finishedAt, Date.now()),
      config: { players: playerCount, decks, tricksPerHand },
      players: players.slice(0, playerCount),
      cumulative,
      hands,
      winnerIdx,
    }];
  }).slice(0, 50);
}

function sanitizeBids(value: unknown, playerCount: number): (number | null)[] {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: playerCount }, (_, index) =>
    typeof source[index] === "number" && Number.isFinite(source[index])
      ? source[index]
      : null,
  );
}

function sanitizeHands(value: unknown, playerCount: number): Card[][] | null {
  if (!Array.isArray(value) || value.length !== playerCount) return null;
  const hands = value.map((hand) => (Array.isArray(hand) ? hand : null));
  if (hands.some((hand) => hand == null || hand.some((card) => !isCard(card)))) return null;
  return hands as Card[][];
}

function sanitizeCurrentTrick(value: unknown, playerCount: number): GameState["currentTrick"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((play) => {
    const entry = play as GameState["currentTrick"][number] | undefined;
    if (!entry || !isCard(entry.card)) return [];
    const playerIdx = clampInteger(entry.playerIdx, 0, playerCount - 1, 0);
    return [{ playerIdx, card: entry.card }];
  });
}

function sanitizePlayLog(value: unknown, playerCount: number): GameState["playLog"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const log = entry as GameState["playLog"][number] | undefined;
    if (!log || !isCard(log.card)) return [];
    return [{
      trick: clampInteger(log.trick, 1, 999, 1),
      order: clampInteger(log.order, 1, playerCount, index + 1),
      playerIdx: clampInteger(log.playerIdx, 0, playerCount - 1, 0),
      card: log.card,
      winner: log.winner === true ? true : undefined,
    }];
  });
}

function sanitizeHydratedState(value: unknown): GameState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<GameState>;
  if (!Array.isArray(state.players)) return null;
  const playerCount = state.players.length;
  if (playerCount < 3 || playerCount > 12) return null;
  if (
    !Array.isArray(state.bids) ||
    !Array.isArray(state.won) ||
    !Array.isArray(state.history)
  ) {
    return null;
  }
  const hands = sanitizeHands(state.hands, playerCount);
  if (!hands) return null;
  const knownPhases = new Set([
    "lobby",
    "dealing",
    "trump",
    "bidding",
    "playing",
    "trick-end",
    "round-end",
    "match-end",
  ]);
  if (!knownPhases.has(state.phase ?? "")) return null;
  return {
    ...(state as GameState),
    players: state.players.map((player, index) => ({
      id: typeof player?.id === "string" && player.id ? player.id : `player-${index}`,
      name: sanitizePlayerName(player?.name, index === 0 ? "You" : `Player ${index + 1}`),
      isHuman: player?.isHuman === true,
      personality: sanitizePersonality(player?.personality),
    })),
    decks: clampDecks(state.decks, 1),
    tricksPerHand: clampTricksPerHand(state.tricksPerHand, playerCount, clampDecks(state.decks, 1), 1),
    maxRounds: clampInteger(state.maxRounds, 1, 999, 1),
    round: Math.max(0, clampInteger(state.round, 0, 999, 0)),
    dealerIdx: clampInteger(state.dealerIdx, 0, playerCount - 1, 0),
    hands,
    tricksTotal: clampTricksPerHand(state.tricksTotal, playerCount, clampDecks(state.decks, 1), 1),
    bids: sanitizeBids(state.bids, playerCount),
    won: finiteNumberArray(state.won, playerCount),
    bidTurn: clampInteger(state.bidTurn, 0, playerCount - 1, 0),
    currentTrick: sanitizeCurrentTrick(state.currentTrick, playerCount),
    playLog: sanitizePlayLog(state.playLog, playerCount),
    leadIdx: clampInteger(state.leadIdx, 0, playerCount - 1, 0),
    turnIdx: clampInteger(state.turnIdx, 0, playerCount - 1, 0),
    trickWinner:
      state.trickWinner == null
        ? null
        : clampInteger(state.trickWinner, 0, playerCount - 1, 0),
    history: sanitizeRoundRecords(state.history, playerCount),
  };
}

export const useMatch = create<MatchStore>()(
  persist(
    (set, get) => ({
      state: null,
      archive: [],

      startMatch: (args) => {
        const playerCount = clampPlayers(args.playerCount, 4);
        const decks = clampDecks(args.decks, 1);
        const max = maxTricks(playerCount, decks);
        const tricksPerHand = clampTricksPerHand(args.tricksPerHand, playerCount, decks, max);
        const players = buildPlayers({
          ...args,
          playerCount,
          botMood: sanitizePersonality(args.botMood),
          botOverrides: sanitizeBotOverrides(args.botOverrides, playerCount - 1),
          playerName: sanitizePlayerName(args.playerName),
        });
        const config: MatchConfig = {
          players,
          decks,
          tricksPerHand,
          maxRounds: 1,
        };
        const fresh = initialState(config);
        const dealt = startRound(fresh);
        // Skip straight to dealing — UI handles its own animation timing.
        set({ state: dealt });
      },

      abandonMatch: () => set({ state: null }),

      beginDealing: () => {
        const s = get().state;
        if (!s || s.phase !== "dealing") return;
        // No-op state update; UI can move forward via revealTrump / beginBidding.
      },

      revealTrump: () => {
        const s = get().state;
        if (!s) return;
        if (s.phase === "dealing") set({ state: { ...s, phase: "trump" } });
      },

      beginBidding: () => {
        const s = get().state;
        if (!s) return;
        if (s.phase === "trump") set({ state: { ...s, phase: "bidding" } });
      },

      bid: (playerIdx, value) => {
        const s = get().state;
        if (!s || s.phase !== "bidding" || s.bidTurn !== playerIdx) return;
        if (!Number.isFinite(value) || value < 0 || value > s.tricksTotal) return;
        try {
          const next = placeBid(s, playerIdx, Math.trunc(value));
          set({ state: next });
        } catch {
          // Ignore stale UI events, such as double clicks after the turn has already advanced.
        }
      },

      play: (playerIdx, card) => {
        const s = get().state;
        if (!s || s.phase !== "playing" || s.turnIdx !== playerIdx || !isCard(card)) return;
        if (!s.hands[playerIdx]?.some((c) => c.key === card.key)) return;
        try {
          const next = playCard(s, playerIdx, card);
          set({ state: next });
        } catch {
          // Ignore stale UI events, such as a card click that became illegal after state changed.
        }
      },

      settle: () => {
        const s = get().state;
        if (!s || s.phase !== "trick-end") return;
        set({ state: settleTrick(s) });
      },

      advanceRound: () => {
        const s = get().state;
        if (!s) return;
        if (s.phase !== "round-end") return;
        const after = nextRound(s);
        set({ state: after });
      },

      finishMatch: () => {
        get().archiveCurrent();
        set({ state: null });
      },

      archiveCurrent: () => {
        const s = get().state;
        if (!s || s.phase !== "match-end") return;
        const serializedHands = JSON.stringify(s.history);
        const alreadyArchived = get().archive.some(
          (a) =>
            a.config.players === s.players.length &&
            a.config.decks === s.decks &&
            a.config.tricksPerHand === s.tricksPerHand &&
            a.players.map((p) => p.name).join("\u0000") ===
              s.players.map((p) => p.name).join("\u0000") &&
            JSON.stringify(a.hands ?? a.rounds ?? []) === serializedHands,
        );
        if (alreadyArchived) return;
        const cumulative = s.players.map((_, i) =>
          s.history.reduce((a, h) => a + (h.scores[i] ?? 0), 0),
        );
        const winnerIdx = cumulative.reduce(
          (best, v, i, arr) => (v > arr[best] ? i : best),
          0,
        );
        const summary: MatchSummary = {
          finishedAt: Date.now(),
          config: {
            players: s.players.length,
            decks: s.decks,
            tricksPerHand: s.tricksPerHand,
          },
          players: s.players.map((p) => ({
            name: sanitizePlayerName(p.name, "Player"),
            isHuman: p.isHuman,
          })),
          cumulative,
          hands: s.history,
          winnerIdx,
        };
        set({ archive: [summary, ...get().archive].slice(0, 50) });
      },

      clearArchive: () => set({ archive: [] }),
    }),
    {
      name: "gb-match",
      version: 2,
      partialize: (s) => ({ state: s.state, archive: s.archive }),
      migrate: (persisted) => {
        const value = persisted as Partial<MatchStore> | undefined;
        return {
          state: sanitizeHydratedState(value?.state),
          archive: sanitizeArchive(value?.archive),
        };
      },
      merge: (persisted, current) => {
        const value = persisted as Partial<MatchStore> | undefined;
        return {
          ...current,
          state: sanitizeHydratedState(value?.state),
          archive: sanitizeArchive(value?.archive),
        };
      },
      storage: createJSONStorage(() =>
        typeof localStorage !== "undefined" ? localStorage : memoryStorage,
      ),
    },
  ),
);
