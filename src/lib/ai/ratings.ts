export const DEFAULT_MU = 25;
export const DEFAULT_SIGMA = DEFAULT_MU / 3;
export const DISPLAY_SIGMAS = 3;
export const DISPLAY_SCALE = 100;
export const PROVISIONAL_GAMES = 10;

const BETA = DEFAULT_MU / 6;
const UPDATE_K = 2;
const MIN_SIGMA = DEFAULT_SIGMA / 10;
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 12;

export type RatingRecord = {
  mu: number;
  sigma: number;
  displayRating: number;
  gamesRated: number;
  peakRating: number;
  provisional: boolean;
};

export type RankedRating = {
  rating: RatingRecord;
  rank: number;
};

export type ScoreRankingOptions = {
  higherIsBetter?: boolean;
};

export function displayRating(mu: number, sigma: number): number {
  assertFiniteNumber(mu, "mu");
  assertFiniteNumber(sigma, "sigma");
  if (sigma < 0) throw new Error("sigma must be non-negative");

  return Math.max(0, Math.round((mu - DISPLAY_SIGMAS * sigma) * DISPLAY_SCALE));
}

export function createRating(overrides: Partial<RatingRecord> = {}): RatingRecord {
  const mu = overrides.mu ?? DEFAULT_MU;
  const sigma = overrides.sigma ?? DEFAULT_SIGMA;
  const gamesRated = overrides.gamesRated ?? 0;
  const computedDisplay = displayRating(mu, sigma);
  const display = overrides.displayRating ?? computedDisplay;
  const peakRating = overrides.peakRating ?? display;

  return {
    mu,
    sigma,
    displayRating: display,
    gamesRated,
    peakRating: Math.max(peakRating, display),
    provisional: overrides.provisional ?? gamesRated < PROVISIONAL_GAMES,
  };
}

export function ranksFromScores(
  scores: readonly number[],
  { higherIsBetter = true }: ScoreRankingOptions = {},
): number[] {
  validatePlayerCount(scores.length);
  scores.forEach((score, index) => assertFiniteNumber(score, `scores[${index}]`));

  return scores.map((score) => {
    const betterCount = scores.filter((other) =>
      higherIsBetter ? other > score : other < score,
    ).length;
    return betterCount + 1;
  });
}

export function updateMultiplayerRatings(results: readonly RankedRating[]): RatingRecord[] {
  validatePlayerCount(results.length);
  results.forEach(({ rating, rank }, index) => {
    validateRating(rating, `results[${index}].rating`);
    assertFiniteNumber(rank, `results[${index}].rank`);
    if (!Number.isInteger(rank) || rank < 1) {
      throw new Error(`results[${index}].rank must be a positive integer`);
    }
  });

  return results.map(({ rating, rank }, index) => {
    let delta = 0;
    let decisiveComparisons = 0;

    for (let opponentIndex = 0; opponentIndex < results.length; opponentIndex += 1) {
      if (opponentIndex === index) continue;

      const opponent = results[opponentIndex];
      const outcome = rank === opponent.rank ? 0.5 : rank < opponent.rank ? 1 : 0;
      if (rank !== opponent.rank) decisiveComparisons += 1;

      const comparisonScale = Math.sqrt(
        rating.sigma * rating.sigma + opponent.rating.sigma * opponent.rating.sigma + 2 * BETA * BETA,
      );
      const expected = 1 / (1 + Math.exp((opponent.rating.mu - rating.mu) / comparisonScale));
      const uncertaintyWeight = rating.sigma / DEFAULT_SIGMA;
      delta += (UPDATE_K * uncertaintyWeight * (outcome - expected)) / (results.length - 1);
    }

    const decisiveShare = decisiveComparisons / (results.length - 1);
    const sigmaShrink = 0.985 - 0.035 * decisiveShare;
    const nextMu = rating.mu + delta;
    const nextSigma = Math.max(MIN_SIGMA, rating.sigma * sigmaShrink);
    const nextDisplay = displayRating(nextMu, nextSigma);
    const nextGamesRated = rating.gamesRated + 1;

    return {
      mu: nextMu,
      sigma: nextSigma,
      displayRating: nextDisplay,
      gamesRated: nextGamesRated,
      peakRating: Math.max(rating.peakRating, nextDisplay),
      provisional: nextGamesRated < PROVISIONAL_GAMES,
    };
  });
}

export function updateRatingsFromScores(
  ratings: readonly RatingRecord[],
  scores: readonly number[],
  options?: ScoreRankingOptions,
): RatingRecord[] {
  if (ratings.length !== scores.length) {
    throw new Error("ratings and scores must have the same length");
  }

  const ranks = ranksFromScores(scores, options);
  return updateMultiplayerRatings(ratings.map((rating, index) => ({ rating, rank: ranks[index] })));
}

function validatePlayerCount(count: number): void {
  if (count < MIN_PLAYERS || count > MAX_PLAYERS) {
    throw new Error(`ratings update requires ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  }
}

function validateRating(rating: RatingRecord, label: string): void {
  assertFiniteNumber(rating.mu, `${label}.mu`);
  assertFiniteNumber(rating.sigma, `${label}.sigma`);
  assertFiniteNumber(rating.displayRating, `${label}.displayRating`);
  assertFiniteNumber(rating.gamesRated, `${label}.gamesRated`);
  assertFiniteNumber(rating.peakRating, `${label}.peakRating`);

  if (rating.sigma <= 0) throw new Error(`${label}.sigma must be positive`);
  if (!Number.isInteger(rating.gamesRated) || rating.gamesRated < 0) {
    throw new Error(`${label}.gamesRated must be a non-negative integer`);
  }
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}
