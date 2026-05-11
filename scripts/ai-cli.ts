import { createRolloutSearchPolicy, type BotPolicy } from "../src/lib/ai/policies";

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
  if (value === "rollout") {
    const rolloutsPerMove = numberArg(args, "rollouts", 8);
    const depthTricks = numberArg(args, "depth", 1);
    const policy = createRolloutSearchPolicy({ rolloutsPerMove, depthTricks });
    return Array.from({ length: playerCount }, () => policy);
  }
  throw new Error(`Unsupported --policy ${value}. Use baseline or rollout.`);
}
