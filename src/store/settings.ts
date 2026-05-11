// Persisted user settings — visual preferences, default match config, bot mood, etc.
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Personality } from "@/lib/bot";

const memoryStorage = (() => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
})();

export type Theme = "emerald" | "midnight" | "graphite";
export type CardBack = "classic" | "lattice" | "monogram";
export type TableLayout = "salon" | "pad";

export interface Settings {
  theme: Theme;
  cardBack: CardBack;
  layout: TableLayout;
  showTrumpHints: boolean;
  animations: boolean;
  // Default match config used by the lobby.
  defaultPlayers: number;
  defaultDecks: number;
  defaultTricksPerHand: number;
  defaultBotMood: Personality;
  /** Display name for the human player. */
  playerName: string;
}

interface SettingsActions {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

const DEFAULTS: Settings = {
  theme: "emerald",
  cardBack: "classic",
  layout: "salon",
  showTrumpHints: true,
  animations: true,
  defaultPlayers: 4,
  defaultDecks: 1,
  defaultTricksPerHand: 10,
  defaultBotMood: "mixed",
  playerName: "You",
};

export const useSettings = create<Settings & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<Settings>),
      reset: () => set(DEFAULTS),
    }),
    {
      name: "gb-settings",
      version: 2,
      migrate: (persisted) => {
        const value = persisted as Partial<Settings> | undefined;
        if (!value) return DEFAULTS;
        const oldTheme = (value as { theme?: string }).theme;
        const theme: Theme =
          oldTheme === "midnight"
            ? "midnight"
            : oldTheme === "studio"
              ? "graphite"
              : "emerald";
        return { ...DEFAULTS, ...value, theme };
      },
      storage: createJSONStorage(() =>
        typeof localStorage !== "undefined" ? localStorage : memoryStorage,
      ),
    },
  ),
);
