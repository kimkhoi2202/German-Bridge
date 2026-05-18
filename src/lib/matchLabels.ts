export function formatHandLadder(maxHandSize: number, handCount = maxHandSize): string {
  const max = Math.max(1, Math.trunc(maxHandSize));
  const hands = Math.max(1, Math.trunc(handCount));
  if (hands <= 1 || max <= 1) {
    return `${max}-card hand`;
  }
  if (hands === max) {
    return `hands 1-${max}`;
  }
  return `${hands} hands, up to ${max} cards`;
}

export function formatCurrentHand(round: number, handCount: number): string {
  return `${round}/${handCount}`;
}
