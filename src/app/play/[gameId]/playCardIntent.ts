import type { Card } from "@/lib/cards";
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
