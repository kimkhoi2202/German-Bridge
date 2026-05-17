import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createBaselinePolicy,
  createChampionSnapshotPolicy,
  createRandomLegalPolicy,
  createRolloutSearchPolicy,
  type BotPolicy,
} from "../src/lib/ai/policies";
import { runPolicyArena } from "../src/lib/ai/tournament";
import { numberArg, parseArgs, stringArg } from "./ai-cli";

async function main() {
  const args = parseArgs();
  const challenger = policyFromArgs(args, "challenger", "rollout");
  const opponent = policyFromArgs(args, "opponent", "baseline");
  const seed = stringArg(args, "seed", "german-bridge-ai-arena");
  const matchesPerConfig = numberArg(args, "matches-per-config", 10);
  const players = playerCountsArg(stringArg(args, "players", "4,5,6,7,8,9,10,11,12"));
  const out = stringArg(args, "out", "");

  const report = runPolicyArena({
    seed,
    challenger,
    opponent,
    playerCounts: players,
    matchesPerConfig,
  });

  if (out) {
    const outPath = resolve(out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  }

  console.log(JSON.stringify({ out: out || null, ...report }, null, 2));
}

function policyFromArgs(args: ReturnType<typeof parseArgs>, prefix: string, fallback: string): BotPolicy {
  const mode = stringArg(args, prefix, fallback);
  if (mode === "baseline") return createBaselinePolicy(`${prefix}-baseline`);
  if (mode === "champion") return createChampionSnapshotPolicy(`${prefix}-champion`);
  if (mode === "random") return createRandomLegalPolicy(`${prefix}-random`);
  if (mode === "rollout" || mode === "champion-rollout") {
    const rollouts = numberArg(args, `${prefix}-rollouts`, numberArg(args, "rollouts", 8));
    const depth = numberArg(args, `${prefix}-depth`, numberArg(args, "depth", 1));
    const bidRollouts = numberArg(args, `${prefix}-bid-rollouts`, numberArg(args, "bid-rollouts", 0));
    const bidDepth = numberArg(args, `${prefix}-bid-depth`, numberArg(args, "bid-depth", depth));
    const utilityMode = stringArg(args, `${prefix}-utility`, stringArg(args, "utility", "legacy"));
    if (utilityMode !== "legacy" && utilityMode !== "scored") {
      throw new Error(`Unsupported --${prefix}-utility ${utilityMode}. Use legacy or scored.`);
    }
    const bidSuffix = bidRollouts > 0 ? `-bid-${bidRollouts}x${bidDepth}` : "";
    const fallbackPolicy =
      mode === "champion-rollout"
        ? createChampionSnapshotPolicy(`${prefix}-champion-fallback`)
        : undefined;
    return createRolloutSearchPolicy({
      id: `${prefix}-${mode}-${rollouts}x${depth}${bidSuffix}-${utilityMode}`,
      rolloutsPerMove: rollouts,
      depthTricks: depth,
      bidRolloutsPerCandidate: bidRollouts,
      bidDepthTricks: bidDepth,
      utilityMode,
      fallback: fallbackPolicy,
    });
  }
  throw new Error(`Unsupported --${prefix} ${mode}. Use baseline, champion, random, rollout, or champion-rollout.`);
}

function playerCountsArg(value: string): number[] {
  const parsed = value.split(",").map((part) => Number(part.trim()));
  if (parsed.length === 0 || parsed.some((count) => !Number.isInteger(count) || count < 4 || count > 12)) {
    throw new Error(`--players must be a comma-separated list of integers from 4 to 12, got ${value}`);
  }
  return [...new Set(parsed)].sort((a, b) => a - b);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
