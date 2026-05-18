import { describe, expect, it } from "vitest";
import {
  examplesToJsonl,
  generateTrainingDataset,
  generateTrainingDatasetMatches,
  manifestToJson,
} from "./dataset";
import { createRolloutSearchPolicy } from "./policies";

describe("training dataset generation", () => {
  it("generates deterministic fair-observation examples for 2-deck matches", () => {
    const first = generateTrainingDataset({
      playerCount: 4,
      decks: 2,
      tricksPerHand: 3,
      matches: 2,
      seed: "dataset-smoke",
    });
    const second = generateTrainingDataset({
      playerCount: 4,
      decks: 2,
      tricksPerHand: 3,
      matches: 2,
      seed: "dataset-smoke",
    });

    expect(first).toEqual(second);
    expect(first.manifest.examples).toBe(72);
    expect(first.examples).toHaveLength(72);
    expect(first.examples[0]).toMatchObject({
      matchIndex: 0,
      decisionIndex: 0,
      kind: "bid",
      order: 1,
    });
    expect(first.examples[0].playerIdx).toBe(first.examples[0].observation.bidTurn);
    expect(first.examples[0].observation.ownHand).toHaveLength(1);
    expect(first.examples[0].observation.tricksTotal).toBe(1);
    expect(first.examples[0].observation.remainingHandCounts).toEqual([1, 1, 1, 1]);
    expect(first.examples[0].observation.legalBids).toEqual([0, 1]);
    expect(first.examples[0].observation.leadIdx).toBe(
      (first.examples[0].playerIdx + 1) % first.examples[0].observation.playerCount,
    );
    expect(first.examples[0].observation.opponentProfiles).toHaveLength(4);
  });

  it("serializes examples as JSONL and manifests as JSON", () => {
    const dataset = generateTrainingDataset({
      playerCount: 5,
      decks: 2,
      tricksPerHand: 2,
      matches: 1,
      seed: "jsonl-smoke",
    });
    const lines = examplesToJsonl(dataset.examples).trim().split("\n");
    const manifest = JSON.parse(manifestToJson(dataset.manifest));

    expect(lines).toHaveLength(25);
    expect(JSON.parse(lines[0]).observation.decks).toBe(2);
    expect(manifest).toMatchObject({
      seed: "jsonl-smoke",
      matches: 1,
      examples: 25,
      config: {
        decks: 2,
        playerCount: 5,
        tricksPerHand: 2,
      },
    });
  });

  it("can stream deterministic match chunks", () => {
    const config = {
      playerCount: 4,
      decks: 2 as const,
      tricksPerHand: 3,
      matches: 2,
      seed: "dataset-stream-smoke",
    };
    const generated = generateTrainingDataset(config);
    const chunks = Array.from(generateTrainingDatasetMatches(config));

    expect(chunks).toHaveLength(2);
    expect(chunks.flatMap((chunk) => chunk.examples)).toEqual(generated.examples);
    expect(chunks.map((chunk) => chunk.replaySummary)).toEqual(generated.manifest.replaySummaries);
    expect(chunks.at(-1)?.policyIds).toEqual(generated.manifest.policyIds);
  });

  it("includes full legal action value targets when policies expose them", () => {
    const policy = createRolloutSearchPolicy({
      id: "dataset-rollout-values",
      rolloutsPerMove: 2,
      depthTricks: 1,
      utilityMode: "scored",
    });
    const dataset = generateTrainingDataset({
      playerCount: 4,
      decks: 2,
      tricksPerHand: 3,
      matches: 1,
      seed: "dataset-rollout-values",
      policyByPlayer: Array.from({ length: 4 }, () => policy),
    });
    const playExample = dataset.examples.find(
      (example) => example.kind === "play" && example.actionValueTargets?.length,
    );

    expect(playExample?.actionValueTargets?.length).toBe(playExample?.observation.legalCards.length);
    expect(playExample?.actionValueTargets?.every((target) => Number.isFinite(target.value))).toBe(true);
  });

  it("rejects empty dataset requests", () => {
    expect(() =>
      generateTrainingDataset({
        playerCount: 4,
        decks: 2,
        tricksPerHand: 3,
        matches: 0,
        seed: "bad",
      }),
    ).toThrow("Dataset matches must be a positive integer");
  });
});
