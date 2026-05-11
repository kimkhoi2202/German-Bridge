// Persisted user settings — visual preferences, default match config, bot mood, etc.
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Personality } from "@/lib/bot";
import {
  clampDecks,
  clampPlayers,
  clampTricksPerHand,
  sanitizePersonality,
  sanitizePlayerName,
} from "@/lib/hardening";

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

const THEMES: readonly Theme[] = ["emerald", "midnight", "graphite"];
const CARD_BACKS: readonly CardBack[] = ["classic", "lattice", "monogram"];
const TABLE_LAYOUTS: readonly TableLayout[] = ["salon", "pad"];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function migratedTheme(value: unknown): Theme {
  if (value === "studio" || value === "bone") return "graphite";
  if (value === "midnight" || value === "carnival") return "midnight";
  if (value === "emerald" || value === "felt") return "emerald";
  return DEFAULTS.theme;
}

export function sanitizeSettings(value: Partial<Settings> | undefined): Settings {
  const defaultPlayers = clampPlayers(value?.defaultPlayers, DEFAULTS.defaultPlayers);
  const defaultDecks = clampDecks(value?.defaultDecks, DEFAULTS.defaultDecks);
  const defaultTricksPerHand = clampTricksPerHand(
    value?.defaultTricksPerHand,
    defaultPlayers,
    defaultDecks,
    DEFAULTS.defaultTricksPerHand,
  );

  return {
    theme: oneOf(migratedTheme(value?.theme), THEMES, DEFAULTS.theme),
    cardBack: oneOf(value?.cardBack, CARD_BACKS, DEFAULTS.cardBack),
    layout: oneOf(value?.layout, TABLE_LAYOUTS, DEFAULTS.layout),
    showTrumpHints: bool(value?.showTrumpHints, DEFAULTS.showTrumpHints),
    animations: bool(value?.animations, DEFAULTS.animations),
    defaultPlayers,
    defaultDecks,
    defaultTricksPerHand,
    defaultBotMood: sanitizePersonality(value?.defaultBotMood, DEFAULTS.defaultBotMood),
    playerName: sanitizePlayerName(value?.playerName, DEFAULTS.playerName),
  };
}

export const useSettings = create<Settings & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) =>
        set((state) => sanitizeSettings({ ...state, [key]: value })),
      reset: () => set(DEFAULTS),
    }),
    {
      name: "gb-settings",
      version: 3,
      migrate: (persisted) => {
        const value = persisted as Partial<Settings> | undefined;
        return sanitizeSettings(value);
      },
      merge: (persisted, current) => {
        const value = persisted as Partial<Settings> | undefined;
        return { ...current, ...sanitizeSettings(value) };
      },
      storage: createJSONStorage(() =>
        typeof localStorage !== "undefined" ? localStorage : memoryStorage,
      ),
    },
  ),
);
