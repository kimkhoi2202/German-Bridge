import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs, stringArg } from "./ai-cli";

const BASE_INTERNAL_RATING = 1500;
const ELO_PER_ODDS_DECADE = 400;
const CONFIDENCE_Z_95 = 1.96;
const EPSILON = 1e-6;

type PromotionRow = {
  checkpoint_id?: string;
  training_mode?: string;
  examples?: number;
  dataset_accuracy?: number | null;
  arena_win_rate?: number;
  arena_average_rank?: number;
  arena_score_margin?: number;
  arena_matches?: number;
  arena_path?: string;
  report_path?: string;
  promotion_eligible?: boolean;
  current_best?: boolean;
};

type ArenaConfig = {
  playerCount: number;
  tricksPerHand: number;
  matches: number;
  winRate: number;
  averageRank: number;
  averageScoreMargin: number;
};

type ArenaReport = {
  checkpoint?: string;
  matches?: number;
  overallWinRate?: number;
  overallAverageRank?: number;
  overallAverageScoreMargin?: number;
  byConfig?: ArenaConfig[];
};

type RatedCheckpoint = {
  checkpoint_id: string;
  internal_rating: number;
  internal_rating_ci95: [number, number];
  rating_delta_vs_fair: number;
  fair_win_rate: number;
  arena_win_rate: number;
  arena_win_rate_ci95: [number, number];
  arena_average_rank: number | null;
  arena_score_margin: number | null;
  arena_matches: number;
  training_mode: string | null;
  examples: number | null;
  dataset_accuracy: number | null;
  promotion_eligible: boolean;
  current_best: boolean;
  arena_path: string;
  report_path: string | null;
};

async function main() {
  const args = parseArgs();
  const leaderboardPath = stringArg(args, "leaderboard", "ai-runs/promotion-leaderboard.json");
  const out = stringArg(args, "out", "ai-runs/internal-rating-report.json");
  const rows = JSON.parse(await readFile(leaderboardPath, "utf8")) as PromotionRow[];
  if (!Array.isArray(rows)) {
    throw new Error(`Expected ${leaderboardPath} to contain a JSON array`);
  }

  const ratings: RatedCheckpoint[] = [];
  for (const row of rows) {
    if (!row.arena_path || !row.checkpoint_id) continue;
    const arena = JSON.parse(await readFile(row.arena_path, "utf8")) as ArenaReport;
    ratings.push(rateCheckpoint(row, arena));
  }

  ratings.sort((a, b) => {
    if (a.current_best !== b.current_best) return a.current_best ? -1 : 1;
    if (a.promotion_eligible !== b.promotion_eligible) return a.promotion_eligible ? -1 : 1;
    if (b.internal_rating !== a.internal_rating) return b.internal_rating - a.internal_rating;
    if (b.arena_win_rate !== a.arena_win_rate) return b.arena_win_rate - a.arena_win_rate;
    return (b.arena_score_margin ?? -Infinity) - (a.arena_score_margin ?? -Infinity);
  });

  const report = {
    generated_at: new Date().toISOString(),
    source_leaderboard: leaderboardPath,
    human_calibrated: false,
    rating_scale: {
      base_internal_rating: BASE_INTERNAL_RATING,
      method:
        "Internal rating = base + 400 * log10(odds(arena_win_rate) / odds(fair_random_seat_win_rate)).",
      fair_random_seat_win_rate:
        "Weighted by arena config matches as sum(matches / playerCount) / totalMatches.",
      confidence:
        "95% confidence interval uses a normal approximation over aggregate arena wins, then maps the win-rate bounds through the same odds-ratio formula.",
      guardrail:
        "This is an internal checkpoint-selection rating, not human-calibrated Elo and not evidence of a 3000 Elo human-beating AI.",
    },
    entries: ratings.map((entry, index) => ({ rank: index + 1, ...entry })),
  };

  const outPath = resolve(out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ out, entries: ratings.length, top: ratings[0] ?? null }, null, 2));
}

function rateCheckpoint(row: PromotionRow, arena: ArenaReport): RatedCheckpoint {
  const byConfig = arena.byConfig ?? [];
  const totalMatches = byConfig.reduce((sum, config) => sum + finite(config.matches, "matches"), 0);
  const arenaMatches = totalMatches || finite(row.arena_matches ?? arena.matches ?? 0, "arena_matches");
  if (arenaMatches <= 0) {
    throw new Error(`${row.checkpoint_id} does not have a positive arena match count`);
  }

  const wins = byConfig.length > 0
    ? byConfig.reduce((sum, config) => sum + finite(config.winRate, "winRate") * finite(config.matches, "matches"), 0)
    : finite(row.arena_win_rate ?? arena.overallWinRate ?? 0, "arena_win_rate") * arenaMatches;
  const fairWins = byConfig.length > 0
    ? byConfig.reduce((sum, config) => sum + finite(config.matches, "matches") / finite(config.playerCount, "playerCount"), 0)
    : arenaMatches * 0.125;

  const winRate = wins / arenaMatches;
  const fairWinRate = fairWins / arenaMatches;
  const [lowerWinRate, upperWinRate] = winRateCi95(winRate, arenaMatches);
  const rating = internalRating(winRate, fairWinRate);
  const lowerRating = internalRating(lowerWinRate, fairWinRate);
  const upperRating = internalRating(upperWinRate, fairWinRate);

  return {
    checkpoint_id: row.checkpoint_id ?? arena.checkpoint ?? "unknown",
    internal_rating: Math.round(rating),
    internal_rating_ci95: [Math.round(lowerRating), Math.round(upperRating)],
    rating_delta_vs_fair: Math.round(rating - BASE_INTERNAL_RATING),
    fair_win_rate: roundMetric(fairWinRate),
    arena_win_rate: roundMetric(winRate),
    arena_win_rate_ci95: [roundMetric(lowerWinRate), roundMetric(upperWinRate)],
    arena_average_rank: nullableMetric(row.arena_average_rank ?? arena.overallAverageRank),
    arena_score_margin: nullableMetric(row.arena_score_margin ?? arena.overallAverageScoreMargin),
    arena_matches: arenaMatches,
    training_mode: row.training_mode ?? null,
    examples: row.examples ?? null,
    dataset_accuracy: nullableMetric(row.dataset_accuracy),
    promotion_eligible: row.promotion_eligible !== false,
    current_best: Boolean(row.current_best),
    arena_path: row.arena_path ?? "",
    report_path: row.report_path ?? null,
  };
}

function internalRating(winRate: number, fairWinRate: number): number {
  return BASE_INTERNAL_RATING + ELO_PER_ODDS_DECADE * Math.log10(odds(winRate) / odds(fairWinRate));
}

function odds(probability: number): number {
  const clamped = Math.min(1 - EPSILON, Math.max(EPSILON, probability));
  return clamped / (1 - clamped);
}

function winRateCi95(winRate: number, matches: number): [number, number] {
  const standardError = Math.sqrt((winRate * (1 - winRate)) / matches);
  return [
    Math.max(EPSILON, winRate - CONFIDENCE_Z_95 * standardError),
    Math.min(1 - EPSILON, winRate + CONFIDENCE_Z_95 * standardError),
  ];
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
  return value;
}

function nullableMetric(value: number | null | undefined): number | null {
  return value == null ? null : roundMetric(finite(value, "metric"));
}

function roundMetric(value: number): number {
  return Number(value.toFixed(12));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
