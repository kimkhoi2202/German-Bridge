import { describe, expect, it } from "vitest";
import {
  DEFAULT_MU,
  DEFAULT_SIGMA,
  createRating,
  displayRating,
  ranksFromScores,
  updateMultiplayerRatings,
  updateRatingsFromScores,
} from "./ratings";

describe("rating records", () => {
  it("creates an OpenSkill-like provisional record with a conservative display rating", () => {
    expect(createRating()).toEqual({
      mu: DEFAULT_MU,
      sigma: DEFAULT_SIGMA,
      displayRating: 0,
      gamesRated: 0,
      peakRating: 0,
      provisional: true,
    });
  });

  it("derives display ratings from mu minus three sigma", () => {
    expect(displayRating(30, 2)).toBe(2400);
    expect(displayRating(20, 10)).toBe(0);
  });
});

describe("ranksFromScores", () => {
  it("assigns shared ranks for tied scores", () => {
    expect(ranksFromScores([42, 20, 20, -5])).toEqual([1, 2, 2, 4]);
  });

  it("can rank lower scores ahead when needed", () => {
    expect(ranksFromScores([12, 0, 12, 4], { higherIsBetter: false })).toEqual([3, 1, 3, 2]);
  });
});

describe("updateMultiplayerRatings", () => {
  it("updates a 4-player match with ties deterministically", () => {
    const ratings = Array.from({ length: 4 }, () => createRating());
    const updated = updateRatingsFromScores(ratings, [42, 20, 20, -5]);

    expect(updated.map((rating) => rating.gamesRated)).toEqual([1, 1, 1, 1]);
    expect(updated.map((rating) => rating.provisional)).toEqual([true, true, true, true]);
    expect(updated.map((rating) => rating.displayRating)).toEqual([225, 96, 96, 25]);

    expect(updated[0].mu).toBeCloseTo(26, 8);
    expect(updated[1].mu).toBeCloseTo(25, 8);
    expect(updated[2].mu).toBeCloseTo(25, 8);
    expect(updated[3].mu).toBeCloseTo(24, 8);
    expect(updated[0].sigma).toBeCloseTo(7.9166666667, 8);
    expect(updated[1].sigma).toBeCloseTo(8.0138888889, 8);
  });

  it("supports the 12-player upper bound and preserves result order", () => {
    const ratings = Array.from({ length: 12 }, () => createRating());
    const scores = [120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
    const updated = updateRatingsFromScores(ratings, scores);

    expect(updated).toHaveLength(12);
    expect(updated[0].mu).toBeCloseTo(26, 8);
    expect(updated[5].mu).toBeGreaterThan(25);
    expect(updated[6].mu).toBeLessThan(25);
    expect(updated[11].mu).toBeCloseTo(24, 8);
    expect(updated.map((rating) => rating.displayRating)).toEqual([
      225, 207, 189, 170, 152, 134, 116, 98, 80, 61, 43, 25,
    ]);
  });

  it("keeps peakRating and clears provisional after the tenth rated game", () => {
    const ratings = [
      createRating({ gamesRated: 9, mu: 25, sigma: 3, peakRating: 1800 }),
      createRating({ gamesRated: 9, mu: 25, sigma: 3, peakRating: 1800 }),
      createRating({ gamesRated: 9, mu: 25, sigma: 3, peakRating: 1800 }),
      createRating({ gamesRated: 9, mu: 25, sigma: 3, peakRating: 1800 }),
    ];

    const updated = updateMultiplayerRatings([
      { rating: ratings[0], rank: 1 },
      { rating: ratings[1], rank: 2 },
      { rating: ratings[2], rank: 3 },
      { rating: ratings[3], rank: 4 },
    ]);

    expect(updated.map((rating) => rating.gamesRated)).toEqual([10, 10, 10, 10]);
    expect(updated.map((rating) => rating.provisional)).toEqual([false, false, false, false]);
    expect(updated.map((rating) => rating.peakRating)).toEqual([1800, 1800, 1800, 1800]);
  });

  it("rejects player counts outside the 4-12 German Bridge scaffold", () => {
    expect(() => updateRatingsFromScores(Array.from({ length: 3 }, () => createRating()), [3, 2, 1])).toThrow(
      "ratings update requires 4-12 players",
    );
    expect(() =>
      updateRatingsFromScores(Array.from({ length: 13 }, () => createRating()), [
        13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
      ]),
    ).toThrow("ratings update requires 4-12 players");
  });
});
