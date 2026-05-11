import {
  createBaselinePolicy,
  createRolloutSearchPolicy,
  type BotPolicy,
} from "../src/lib/ai/policies";
import { runBaselineTournament } from "../src/lib/ai/tournament";
import { numberArg, parseArgs, stringArg } from "./ai-cli";

function policiesFor(playerCount: number, challengerSeat: number): BotPolicy[] {
  if (!Number.isInteger(challengerSeat) || challengerSeat < 0 || challengerSeat >= playerCount) {
    throw new Error(`--challenger-seat must be an integer from 0 to ${playerCount - 1}`);
  }
  const challenger = createRolloutSearchPolicy({
    id: "rollout-challenger",
    rolloutsPerMove: 8,
    depthTricks: 1,
  });
  const baseline = createBaselinePolicy();
  return Array.from({ length: playerCount }, (_, idx) =>
    idx === challengerSeat ? challenger : baseline,
  );
}

function main() {
  const args = parseArgs();
  const playerCount = numberArg(args, "players", 4);
  const tricksPerHand = numberArg(args, "tricks", 6);
  const matches = numberArg(args, "matches", 100);
  const seed = stringArg(args, "seed", "german-bridge-ai-eval");
  const challengerSeat = numberArg(args, "challenger-seat", 0);

  const policyByPlayer = policiesFor(playerCount, challengerSeat);
  const tournament = runBaselineTournament({
    playerCount,
    decks: 2,
    tricksPerHand,
    matches,
    seed,
    policyByPlayer,
  });

  console.log(
    JSON.stringify(
      {
        seed: tournament.seed,
        matches,
        players: playerCount,
        decks: 2,
        tricksPerHand,
        challengerSeat,
        standings: tournament.standings,
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
