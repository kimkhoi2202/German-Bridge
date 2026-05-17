import { maxTricks } from "../cards";
import { runHeadlessMatch, type HeadlessMatchResult, type TrainingMatchConfig } from "./headless";
import { createBaselinePolicy, type BotPolicy } from "./policies";

export interface TournamentConfig extends Omit<TrainingMatchConfig, "seed"> {
  seed: string | number;
  matches: number;
}

export interface TournamentPlayerStanding {
  playerIdx: number;
  totalScore: number;
  wins: number;
  averageScore: number;
}

export interface TournamentResult {
  seed: string;
  matches: HeadlessMatchResult[];
  standings: TournamentPlayerStanding[];
}

export interface PolicyArenaConfig {
  seed: string | number;
  challenger: BotPolicy;
  opponent?: BotPolicy;
  playerCounts?: readonly number[];
  decks?: 2;
  matchesPerConfig: number;
  trickCounts?: (playerCount: number, maximum: number) => readonly number[];
}

export interface PolicyArenaConfigRow {
  playerCount: number;
  tricksPerHand: number;
  matches: number;
  winRate: number;
  averageRank: number;
  averageScoreMargin: number;
}

export interface PolicyArenaResult {
  seed: string;
  challengerId: string;
  opponentId: string;
  matches: number;
  overallWinRate: number;
  overallAverageRank: number;
  overallAverageScoreMargin: number;
  byConfig: PolicyArenaConfigRow[];
}

export function runBaselineTournament(config: TournamentConfig): TournamentResult {
  if (!Number.isInteger(config.matches) || config.matches < 1) {
    throw new Error(`Tournament matches must be a positive integer, got ${config.matches}`);
  }

  const matches = Array.from({ length: config.matches }, (_, i) =>
    runHeadlessMatch({ ...config, seed: `${config.seed}:match:${i}` }),
  );
  const playerCount = matches[0]?.config.playerCount ?? config.playerCount;
  const standings = Array.from({ length: playerCount }, (_, playerIdx) => {
    const totalScore = matches.reduce((sum, match) => sum + match.cumulative[playerIdx], 0);
    const wins = matches.filter((match) => match.winnerIdx === playerIdx).length;
    return {
      playerIdx,
      totalScore,
      wins,
      averageScore: totalScore / matches.length,
    };
  }).sort((a, b) => b.totalScore - a.totalScore || b.wins - a.wins || a.playerIdx - b.playerIdx);

  return {
    seed: String(config.seed),
    matches,
    standings,
  };
}

export function runPolicyArena(config: PolicyArenaConfig): PolicyArenaResult {
  if (!Number.isInteger(config.matchesPerConfig) || config.matchesPerConfig < 1) {
    throw new Error(`Arena matchesPerConfig must be a positive integer, got ${config.matchesPerConfig}`);
  }
  const decks = config.decks ?? 2;
  const playerCounts = config.playerCounts ?? [4, 5, 6, 7, 8, 9, 10, 11, 12];
  const opponent = config.opponent ?? createBaselinePolicy("baseline-opponent");
  const byConfig: PolicyArenaConfigRow[] = [];
  let totalWins = 0;
  let totalMatches = 0;
  let totalRank = 0;
  let totalMargin = 0;

  for (const playerCount of playerCounts) {
    if (!Number.isInteger(playerCount) || playerCount < 4 || playerCount > 12) {
      throw new Error(`Arena playerCount must be an integer from 4 to 12, got ${playerCount}`);
    }
    const maximum = maxTricks(playerCount, decks);
    const tricks = config.trickCounts?.(playerCount, maximum) ?? representativeTricks(maximum);
    for (const tricksPerHand of tricks) {
      if (!Number.isInteger(tricksPerHand) || tricksPerHand < 1 || tricksPerHand > maximum) {
        throw new Error(
          `Arena tricksPerHand must be an integer from 1 to ${maximum} for ${playerCount} players, got ${tricksPerHand}`,
        );
      }
      let wins = 0;
      let rankSum = 0;
      let marginSum = 0;
      for (let match = 0; match < config.matchesPerConfig; match += 1) {
        const challengerSeat = match % playerCount;
        const policyByPlayer = Array.from({ length: playerCount }, (_, idx) =>
          idx === challengerSeat ? config.challenger : opponent,
        );
        const result = runHeadlessMatch({
          playerCount,
          decks,
          tricksPerHand,
          maxRounds: tricksPerHand,
          seed: `${config.seed}:p${playerCount}:t${tricksPerHand}:m${match}`,
          policyByPlayer,
        });
        const challengerScore = result.cumulative[challengerSeat];
        const rank = 1 + result.cumulative.filter((score) => score > challengerScore).length;
        const opponentScores = result.cumulative.filter((_, idx) => idx !== challengerSeat);
        const margin =
          challengerScore -
          opponentScores.reduce((sum, score) => sum + score, 0) / opponentScores.length;
        if (rank === 1) wins += 1;
        rankSum += rank;
        marginSum += margin;
      }
      const matches = config.matchesPerConfig;
      byConfig.push({
        playerCount,
        tricksPerHand,
        matches,
        winRate: wins / matches,
        averageRank: rankSum / matches,
        averageScoreMargin: marginSum / matches,
      });
      totalWins += wins;
      totalMatches += matches;
      totalRank += rankSum;
      totalMargin += marginSum;
    }
  }

  return {
    seed: String(config.seed),
    challengerId: config.challenger.id,
    opponentId: opponent.id,
    matches: totalMatches,
    overallWinRate: totalWins / totalMatches,
    overallAverageRank: totalRank / totalMatches,
    overallAverageScoreMargin: totalMargin / totalMatches,
    byConfig,
  };
}

export function representativeTricks(maximum: number): number[] {
  return [...new Set([
    1,
    Math.max(1, Math.round(maximum / 3)),
    Math.max(1, Math.round((2 * maximum) / 3)),
    maximum,
  ])].sort((a, b) => a - b);
}
