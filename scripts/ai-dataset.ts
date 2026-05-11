import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  examplesToJsonl,
  generateTrainingDataset,
  manifestToJson,
} from "../src/lib/ai/dataset";
import { numberArg, parseArgs, policyArg, stringArg } from "./ai-cli";

async function main() {
  const args = parseArgs();
  const playerCount = numberArg(args, "players", 4);
  const tricksPerHand = numberArg(args, "tricks", 6);
  const matches = numberArg(args, "matches", 100);
  const seed = stringArg(args, "seed", "german-bridge-ai-dataset");
  const out = resolve(stringArg(args, "out", "ai-data/training.jsonl"));
  const manifestOut = resolve(stringArg(args, "manifest", out.replace(/\.jsonl$/u, ".manifest.json")));
  const policyByPlayer = policyArg(args, playerCount);

  const dataset = generateTrainingDataset({
    playerCount,
    decks: 2,
    tricksPerHand,
    matches,
    seed,
    policyByPlayer,
  });

  await mkdir(dirname(out), { recursive: true });
  await mkdir(dirname(manifestOut), { recursive: true });
  await writeFile(out, examplesToJsonl(dataset.examples), "utf8");
  await writeFile(manifestOut, manifestToJson(dataset.manifest), "utf8");

  console.log(
    JSON.stringify(
      {
        out,
        manifest: manifestOut,
        examples: dataset.examples.length,
        matches,
        players: playerCount,
        decks: 2,
        tricksPerHand,
        policyIds: dataset.manifest.policyIds,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
