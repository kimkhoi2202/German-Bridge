export function formatHandLadder(maxHandSize: number, handCount = maxHandSize): string {
  const max = Math.max(1, Math.trunc(maxHandSize));
  const hands = Math.max(1, Math.trunc(handCount));
  if (hands <= 1 || max <= 1) {
    return `${max}-trick hand`;
  }
  if (hands === max) {
    return `hands 1-${max}`;
  }
  return `${hands} hands, up to ${max} tricks`;
}

export function formatCurrentHand(round: number, handCount: number, tricksTotal: number): string {
  const cardWord = tricksTotal === 1 ? "card" : "cards";
  return `${round}/${handCount} · ${tricksTotal} ${cardWord}`;
}
