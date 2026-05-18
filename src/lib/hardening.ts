import { MAX_DECKS, RANKS, SUITS, maxTricks, type Card } from "./cards";
import type { Personality } from "./bot";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
export const MAX_PLAYER_NAME_LENGTH = 24;

const PERSONALITIES: readonly Personality[] = ["cautious", "mixed", "aggressive", "champion", "gpt"];

export function clampInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  const safeFallback = Number.isFinite(fallback) ? Math.trunc(fallback) : min;
  const integer = Number.isFinite(parsed) ? Math.trunc(parsed) : safeFallback;
  return Math.min(max, Math.max(min, integer));
}

export function clampPlayers(value: unknown, fallback = 4): number {
  return clampInteger(value, MIN_PLAYERS, MAX_PLAYERS, fallback);
}

export function clampDecks(value: unknown, fallback = 1): number {
  return clampInteger(value, 1, MAX_DECKS, fallback);
}

export function clampTricksPerHand(
  value: unknown,
  players: number,
  decks: number,
  fallback = 1,
): number {
  const max = Math.max(1, maxTricks(players, decks));
  return clampInteger(value, 1, max, Math.min(max, Math.max(1, fallback)));
}

export function clampStartingTricksPerHand(
  value: unknown,
  maxHandSize: number,
  fallback = 1,
): number {
  const max = Math.max(1, Math.trunc(maxHandSize));
  return clampInteger(value, 1, max, Math.min(max, Math.max(1, fallback)));
}

export function sanitizePlayerName(
  value: unknown,
  fallback = "You",
  maxLength = MAX_PLAYER_NAME_LENGTH,
): string {
  const raw = typeof value === "string" ? value : "";
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const clipped = Array.from(cleaned).slice(0, maxLength).join("");
  return clipped || fallback;
}

export function isPersonality(value: unknown): value is Personality {
  return PERSONALITIES.includes(value as Personality);
}

export function sanitizePersonality(value: unknown, fallback: Personality = "mixed"): Personality {
  return isPersonality(value) ? value : fallback;
}

export function sanitizeOptionalPersonality(value: unknown): Personality | null {
  return isPersonality(value) ? value : null;
}

export function sanitizeBotOverrides(value: unknown, botCount: number): (Personality | null)[] {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: Math.max(0, botCount) }, (_, index) =>
    sanitizeOptionalPersonality(source[index]),
  );
}

export function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function finiteNumberArray(value: unknown, length: number, fallback = 0): number[] {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length }, (_, index) => finiteNumber(source[index], fallback));
}

export function isCard(value: unknown): value is Card {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<Card>;
  return (
    typeof card.key === "string" &&
    card.key.length > 0 &&
    typeof card.d === "number" &&
    Number.isInteger(card.d) &&
    card.d >= 0 &&
    (RANKS as readonly string[]).includes(card.r ?? "") &&
    (SUITS as readonly string[]).includes(card.s ?? "")
  );
}
