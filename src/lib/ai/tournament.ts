import { runHeadlessMatch, type HeadlessMatchResult, type TrainingMatchConfig } from "./headless";

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
