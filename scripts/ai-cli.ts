import {
  createChampionSnapshotPolicy,
  createRolloutSearchPolicy,
  type BotPolicy,
} from "../src/lib/ai/policies";

export interface ParsedArgs {
  [key: string]: string | boolean | undefined;
}

export function parseArgs(argv = process.argv.slice(2)): ParsedArgs {
  const parsed: ParsedArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    i += 1;
  }
  return parsed;
}

export function numberArg(args: ParsedArgs, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${key} must be a number, got ${value}`);
  }
  return parsed;
}

export function stringArg(args: ParsedArgs, key: string, fallback: string): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

export function policyArg(args: ParsedArgs, playerCount: number): BotPolicy[] | undefined {
  const value = stringArg(args, "policy", "baseline");
  if (value === "baseline") return undefined;
  if (value === "champion") {
    const policy = createChampionSnapshotPolicy("champion-snapshot");
    return Array.from({ length: playerCount }, () => policy);
  }
  if (value === "rollout" || value === "champion-rollout") {
    const rolloutsPerMove = numberArg(args, "rollouts", 8);
    const depthTricks = numberArg(args, "depth", 1);
    const bidRolloutsPerCandidate = numberArg(args, "bid-rollouts", 0);
    const bidDepthTricks = numberArg(args, "bid-depth", depthTricks);
    const utilityMode = stringArg(args, "utility", "legacy");
    if (utilityMode !== "legacy" && utilityMode !== "scored") {
      throw new Error(`Unsupported --utility ${utilityMode}. Use legacy or scored.`);
    }
    const fallback =
      value === "champion-rollout"
        ? createChampionSnapshotPolicy("champion-rollout-fallback")
        : undefined;
    const policy = createRolloutSearchPolicy({
      id:
        bidRolloutsPerCandidate > 0
          ? `${value}-${rolloutsPerMove}x${depthTricks}-bid-${bidRolloutsPerCandidate}x${bidDepthTricks}-${utilityMode}`
          : `${value}-${rolloutsPerMove}x${depthTricks}-${utilityMode}`,
      rolloutsPerMove,
      depthTricks,
      bidRolloutsPerCandidate,
      bidDepthTricks,
      fallback,
      utilityMode,
    });
    return Array.from({ length: playerCount }, () => policy);
  }
  throw new Error(`Unsupported --policy ${value}. Use baseline, champion, rollout, or champion-rollout.`);
}
