import { legalCards, type Card } from "@/lib/cards";
import type { GameState } from "@/lib/game";

export function canSendPlayCardIntent({
  state,
  legalCardKeys,
  card,
  isPlayInFlight,
}: {
  state: GameState | null | undefined;
  legalCardKeys: readonly string[] | null | undefined;
  card: Pick<Card, "key">;
  isPlayInFlight: boolean;
}) {
  if (isPlayInFlight) return false;
  if (!state || state.phase !== "playing") return false;
  if (state.turnIdx !== 0 || state.trickWinner != null) return false;
  if (state.players[0]?.isHuman !== true) return false;
  if (!state.hands[0]?.some((handCard) => handCard.key === card.key)) return false;
  return legalCardKeys?.includes(card.key) === true;
}

export function canKeepPreMoveIntent({
  state,
  cardKey,
}: {
  state: GameState | null | undefined;
  cardKey: string | null | undefined;
}) {
  if (!cardKey) return false;
  if (!state || state.phase !== "playing") return false;
  if (state.trickWinner != null) return false;
  if (state.players[0]?.isHuman !== true) return false;
  const leadSuit = state.currentTrick[0]?.card.s ?? null;
  if (leadSuit == null) return false;

  const hand = state.hands[0] ?? [];
  if (!hand.some((handCard) => handCard.key === cardKey)) return false;
  return legalCards(hand, leadSuit).some((legalCard) => legalCard.key === cardKey);
}

export function canQueuePreMoveIntent({
  state,
  card,
  isPlayInFlight,
}: {
  state: GameState | null | undefined;
  card: Pick<Card, "key">;
  isPlayInFlight: boolean;
}) {
  if (isPlayInFlight) return false;
  if (state?.turnIdx === 0) return false;
  return canKeepPreMoveIntent({ state, cardKey: card.key });
}
