export function formatHandLadder(
  maxHandSize: number,
  _handCount?: number,
  startingHandSize = 1,
): string {
  const max = Math.max(1, Math.trunc(maxHandSize));
  const start = Math.min(max, Math.max(1, Math.trunc(startingHandSize)));
  return `hands ${start}-${max}`;
}

export function formatCurrentHand(round: number, handCount: number): string {
  return `${round}/${handCount}`;
}
