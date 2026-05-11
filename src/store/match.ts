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
import { MAX_DECKS, maxTricks, type Card } from "@/lib/cards";
import type { Personality } from "@/lib/bot";

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
    name: args.playerName || "You",
    isHuman: true,
    personality: "mixed",
  };
  const bots: Player[] = Array.from({ length: args.playerCount - 1 }, (_, i) => {
    const ov = args.botOverrides[i];
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

export const useMatch = create<MatchStore>()(
  persist(
    (set, get) => ({
      state: null,
      archive: [],

      startMatch: (args) => {
        const playerCount = Math.min(12, Math.max(3, args.playerCount));
        const decks = Math.min(MAX_DECKS, Math.max(1, args.decks));
        const max = maxTricks(playerCount, decks);
        const tricksPerHand = Math.min(max, Math.max(1, args.tricksPerHand));
        const players = buildPlayers({ ...args, playerCount });
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
        if (!s) return;
        const next = placeBid(s, playerIdx, value);
        set({ state: next });
      },

      play: (playerIdx, card) => {
        const s = get().state;
        if (!s) return;
        const next = playCard(s, playerIdx, card);
        set({ state: next });
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
          players: s.players.map((p) => ({ name: p.name, isHuman: p.isHuman })),
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
      version: 1,
      partialize: (s) => ({ state: s.state, archive: s.archive }),
      storage: createJSONStorage(() =>
        typeof localStorage !== "undefined" ? localStorage : memoryStorage,
      ),
    },
  ),
);
