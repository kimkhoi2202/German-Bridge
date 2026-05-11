// German Bridge — card primitives
//
// Cards are represented as plain objects with a stable `key` so the same
// physical card from a multi-deck shoe is uniquely identifiable across the
// UI (animations, hand-mutation by reference, etc.).

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export const SUITS = ["s", "h", "d", "c"] as const;
export const MAX_DECKS = 4;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

export const SUIT_NAME: Record<Suit, string> = {
  s: "Spades",
  h: "Hearts",
  d: "Diamonds",
  c: "Clubs",
};

export const SUIT_CHAR: Record<Suit, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

export interface Card {
  /** Card rank (2..A) */
  r: Rank;
  /** Card suit */
  s: Suit;
  /** Deck index (0..decks-1) — distinguishes identical cards in multi-deck play */
  d: number;
  /** Stable unique identifier (rank + suit + deck-id + counter) */
  key: string;
}

/** Numeric value of a rank (2 → 0, A → 12). */
export function rankVal(r: Rank): number {
  return RANKS.indexOf(r);
}

export function isRed(s: Suit): boolean {
  return s === "h" || s === "d";
}

/** Build a multi-deck shoe (52 × decks cards). */
export function buildShoe(decks: number): Card[] {
  const out: Card[] = [];
  let counter = 0;
  for (let d = 0; d < decks; d++) {
    for (const s of SUITS) {
      for (const r of RANKS) {
        out.push({ r, s, d, key: `${r}${s}-${d}-${counter++}` });
      }
    }
  }
  return out;
}

/** Maximum tricks-per-hand given player count and deck count.
 *  Always reserves 1 card for the trump flip. */
export function maxTricks(players: number, decks: number): number {
  return Math.max(0, Math.floor((52 * decks - 1) / players));
}

/** Fisher–Yates shuffle (returns a new array). Optional rng for tests. */
export function shuffle<T>(deck: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sort a hand for display: trumps first, then by suit, high → low within. */
export function sortHand(hand: readonly Card[], trump: Suit | null): Card[] {
  const order: Suit[] = trump
    ? [trump, ...SUITS.filter((s) => s !== trump)]
    : [...SUITS];
  return [...hand].sort((a, b) => {
    const sa = order.indexOf(a.s);
    const sb = order.indexOf(b.s);
    if (sa !== sb) return sa - sb;
    return rankVal(b.r) - rankVal(a.r);
  });
}

/** Cards a player may legally play given the lead suit. */
export function legalCards(hand: readonly Card[], leadSuit: Suit | null): Card[] {
  if (leadSuit == null) return [...hand];
  const inSuit = hand.filter((c) => c.s === leadSuit);
  return inSuit.length ? inSuit : [...hand];
}
