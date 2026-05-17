import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  examplesToJsonl,
  generateTrainingDatasetMatches,
  manifestToJson,
  type DatasetManifest,
} from "../src/lib/ai/dataset";
import { numberArg, parseArgs, policyArg, stringArg } from "./ai-cli";

async function writeAll(stream: NodeJS.WritableStream, chunk: string): Promise<void> {
  if (!stream.write(chunk)) {
    await once(stream, "drain");
  }
}

async function main() {
  const args = parseArgs();
  const playerCount = numberArg(args, "players", 4);
  const tricksPerHand = numberArg(args, "tricks", 6);
  const matches = numberArg(args, "matches", 100);
  const seed = stringArg(args, "seed", "german-bridge-ai-dataset");
  const out = resolve(stringArg(args, "out", "ai-data/training.jsonl"));
  const manifestOut = resolve(stringArg(args, "manifest", out.replace(/\.jsonl$/u, ".manifest.json")));
  const progressEvery = numberArg(args, "progress-every", 10);
  const policyByPlayer = policyArg(args, playerCount);

  await mkdir(dirname(out), { recursive: true });
  await mkdir(dirname(manifestOut), { recursive: true });

  const replaySummaries: DatasetManifest["replaySummaries"] = [];
  let examples = 0;
  let manifestConfig: DatasetManifest["config"] = {
    decks: 2,
    playerCount,
    tricksPerHand,
    maxRounds: tricksPerHand,
  };
  let policyIds: string[] = [];

  const outStream = createWriteStream(out, { encoding: "utf8" });
  try {
    for (const match of generateTrainingDatasetMatches({
      playerCount,
      decks: 2,
      tricksPerHand,
      matches,
      seed,
      policyByPlayer,
    })) {
      await writeAll(outStream, examplesToJsonl(match.examples));
      replaySummaries.push(match.replaySummary);
      manifestConfig = match.manifestConfig;
      policyIds = match.policyIds;
      examples += match.examples.length;

      const matchNumber = match.matchIndex + 1;
      if (progressEvery > 0 && (matchNumber % progressEvery === 0 || matchNumber === matches)) {
        console.error(`[dataset] progress match=${matchNumber}/${matches} examples=${examples}`);
      }
    }
  } finally {
    outStream.end();
    await once(outStream, "finish");
  }

  const manifest: DatasetManifest = {
    seed,
    matches,
    examples,
    config: manifestConfig,
    policyIds,
    replaySummaries,
  };

  await writeFile(manifestOut, manifestToJson(manifest), "utf8");

  console.log(
    JSON.stringify(
      {
        out,
        manifest: manifestOut,
        examples,
        matches,
        players: playerCount,
        decks: 2,
        tricksPerHand,
        policyIds,
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
