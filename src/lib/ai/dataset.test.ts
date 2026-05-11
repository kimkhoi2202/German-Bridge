import { describe, expect, it } from "vitest";
import {
  examplesToJsonl,
  generateTrainingDataset,
  manifestToJson,
} from "./dataset";

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
    expect(first.manifest.examples).toBe(32);
    expect(first.examples).toHaveLength(32);
    expect(first.examples[0]).toMatchObject({
      matchIndex: 0,
      decisionIndex: 0,
      kind: "bid",
      playerIdx: 1,
      order: 1,
    });
    expect(first.examples[0].observation.ownHand).toHaveLength(3);
    expect(first.examples[0].observation.remainingHandCounts).toEqual([3, 3, 3, 3]);
    expect(first.examples[0].observation.legalBids).toEqual([0, 1, 2, 3]);
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

    expect(lines).toHaveLength(15);
    expect(JSON.parse(lines[0]).observation.decks).toBe(2);
    expect(manifest).toMatchObject({
      seed: "jsonl-smoke",
      matches: 1,
      examples: 15,
      config: {
        decks: 2,
        playerCount: 5,
        tricksPerHand: 2,
      },
    });
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
