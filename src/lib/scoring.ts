// German Bridge — custom scoring (squared variant)
//
//   - If you make your bid:    +(10 + tricksWon²)
//   - If you miss your bid:    −(|bid − tricksWon|²)

export function score(bid: number, won: number): number {
  if (bid === won) return 10 + won * won;
  const diff = Math.abs(bid - won);
  return -(diff * diff);
}

export function describeScore(bid: number, won: number): string {
  if (bid === won) return `10 + ${won}² = ${score(bid, won)}`;
  return `−${Math.abs(bid - won)}² = ${score(bid, won)}`;
}
