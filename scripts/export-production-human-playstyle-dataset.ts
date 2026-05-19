import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createObservation } from "../src/lib/botObservation";
import { cumulativeScores, nextRound, placeBid, playCard, settleTrick, type GameState } from "../src/lib/game";
import { serializeCard, serializeObservation, type SerializedCard, type TrainingExample } from "../src/lib/ai/dataset";
import { rngFromSeed } from "../convex/lib/gameEngine";

type GameDoc = {
  _id: string;
  status: string;
  playerCount: number;
  decks: number;
  startingTricksPerHand?: number;
  tricksPerHand: number;
  maxRounds: number;
  createdAt?: number;
  startedAt?: number;
  finishedAt?: number;
  defaultBotMood?: string;
};

type GameEvent = {
  _id: string;
  gameId: string;
  sequence: number;
  type: string;
  seatIdx?: number;
  payload: Record<string, unknown>;
  createdAt: number;
};

type WeightedHumanExample = TrainingExample & {
  trainingWeight: number;
  source: {
    participantKind: "human";
    participantName: string;
    participantPersonality: string;
    teacherPolicyId: "production-human:platform";
    requestedPolicyId: "production-human:platform";
    humanOnly: true;
  };
};

type Decision = {
  event: GameEvent;
  kind: "bid" | "play";
  playerIdx: number;
  playerName: string;
  playerPersonality: string;
  observation: ReturnType<typeof createObservation>;
  action: number | SerializedCard;
};

function arg(name: string, fallback: string): string;
function arg(name: string, fallback?: string): string | undefined;
function arg(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cardKey(payload: Record<string, unknown>) {
  const card = payload.card as { key?: string } | undefined;
  if (!card?.key) throw new Error("play event is missing payload.card.key");
  return card.key;
}

function eventAction(event: GameEvent) {
  if (event.type === "bid") return numberValue(event.payload.bid);
  if (event.type === "play") return event.payload.card as SerializedCard;
  throw new Error(`Unsupported decision event ${event.type}`);
}

function scoreRank(scores: readonly number[], playerIdx: number) {
  const own = scores[playerIdx] ?? 0;
  return scores.filter((score) => score > own).length + 1;
}

function roundFor(state: GameState, round: number) {
  const record = state.history.find((entry) => entry.round === round);
  if (!record) throw new Error(`Missing settled round ${round}`);
  return record;
}

function applySeatReplacement(state: GameState, event: GameEvent): GameState {
  const seatIdx = numberValue(event.seatIdx, NaN);
  if (!Number.isInteger(seatIdx) || !state.players[seatIdx]) return state;
  const botName = typeof event.payload.botName === "string" ? event.payload.botName : state.players[seatIdx]!.name;
  const personality =
    typeof event.payload.personality === "string" ? event.payload.personality : state.players[seatIdx]!.personality;
  return {
    ...state,
    players: state.players.map((player, idx) =>
      idx === seatIdx
        ? {
            ...player,
            name: botName,
            isHuman: false,
            personality: personality as GameState["players"][number]["personality"],
          }
        : player,
    ),
  };
}

function sourceWeight(args: {
  kind: "bid" | "play";
  winner: boolean;
  finalRank: number;
  madeBid: boolean;
  weightScale: number;
}) {
  let weight = args.kind === "play" ? 8.0 : 2.0;
  if (args.winner) weight *= 1.35;
  if (args.madeBid) weight *= 1.25;
  if (args.finalRank <= 2) weight *= 1.15;
  weight *= args.weightScale;
  return Number(weight.toFixed(4));
}

function exportGame(args: { game: GameDoc; events: GameEvent[]; weightScale: number }) {
  let state: GameState | null = null;
  const decisions: Decision[] = [];
  let humanDecisionsSkippedAfterReplacement = 0;

  for (const event of args.events) {
    switch (event.type) {
      case "room_started": {
        const started = (event.payload as { state?: GameState }).state;
        if (!started) throw new Error("room_started event is missing state");
        state = started;
        break;
      }
      case "seat_replaced_with_bot":
        if (!state) throw new Error("seat_replaced_with_bot before room_started");
        state = applySeatReplacement(state, event);
        break;
      case "trump_revealed":
        if (!state) throw new Error("trump_revealed before room_started");
        state = { ...(state as GameState), phase: "trump" };
        break;
      case "bidding_started":
        if (!state) throw new Error("bidding_started before room_started");
        state = { ...(state as GameState), phase: "bidding" };
        break;
      case "bid": {
        if (!state) throw new Error("bid before room_started");
        const playerIdx = numberValue(event.seatIdx, NaN);
        if (!Number.isInteger(playerIdx)) throw new Error("bid event missing seatIdx");
        const player = state.players[playerIdx];
        const observation = createObservation(state, playerIdx);
        if (player?.isHuman === true) {
          decisions.push({
            event,
            kind: "bid",
            playerIdx,
            playerName: player.name,
            playerPersonality: player.personality,
            observation,
            action: eventAction(event),
          });
        } else {
          humanDecisionsSkippedAfterReplacement += 1;
        }
        state = placeBid(state, playerIdx, numberValue(event.payload.bid));
        break;
      }
      case "play": {
        if (!state) throw new Error("play before room_started");
        const playerIdx = numberValue(event.seatIdx, NaN);
        if (!Number.isInteger(playerIdx)) throw new Error("play event missing seatIdx");
        const player = state.players[playerIdx];
        const observation = createObservation(state, playerIdx);
        const key = cardKey(event.payload);
        const card = state.hands[playerIdx]?.find((candidate) => candidate.key === key);
        if (!card) throw new Error(`Card ${key} not found in seat ${playerIdx} hand at sequence ${event.sequence}`);
        if (player?.isHuman === true) {
          decisions.push({
            event,
            kind: "play",
            playerIdx,
            playerName: player.name,
            playerPersonality: player.personality,
            observation,
            action: serializeCard(card),
          });
        } else {
          humanDecisionsSkippedAfterReplacement += 1;
        }
        state = playCard(state, playerIdx, card);
        break;
      }
      case "trick_settled":
      case "round_settled":
        if (!state) throw new Error(`${event.type} before room_started`);
        state = settleTrick(state);
        break;
      case "round_advanced":
        if (!state) throw new Error("round_advanced before room_started");
        state = nextRound(state, rngFromSeed(`${args.game._id}:${numberValue(event.sequence) - 1}:round:${state.round + 1}`));
        break;
      default:
        break;
    }
  }

  if (!state) throw new Error("Could not replay game");
  if (state.phase !== "match-end") throw new Error(`Expected replay to end at match-end, got ${state.phase}`);

  const cumulative = cumulativeScores(state);
  const winnerIdx = cumulative.reduce((best, value, idx, scores) => (value > scores[best] ? idx : best), 0);
  const examples = decisions.map((decision, decisionIndex): WeightedHumanExample => {
    const round = roundFor(state!, decision.observation.round);
    const bid = round.bids[decision.playerIdx] ?? 0;
    const won = round.won[decision.playerIdx] ?? 0;
    const finalScore = cumulative[decision.playerIdx] ?? 0;
    const finalRank = scoreRank(cumulative, decision.playerIdx);
    const madeBid = bid === won;
    return {
      id: `prod-human:${args.game._id}:${decision.event.sequence}`,
      matchIndex: 0,
      decisionIndex,
      seed: `production:${args.game._id}`,
      kind: decision.kind,
      policyId: "production-human:platform",
      playerIdx: decision.playerIdx,
      round: decision.observation.round,
      trick: decision.kind === "play" ? decision.observation.trickIdx + 1 : decision.observation.trickIdx,
      order:
        decision.kind === "bid"
          ? decision.observation.bids.filter((bidValue) => bidValue != null).length + 1
          : decision.observation.currentTrick.length + 1,
      observation: serializeObservation(decision.observation),
      action: decision.action,
      outcome: {
        finalScore,
        finalRank,
        winner: decision.playerIdx === winnerIdx,
        bid,
        won,
        madeBid,
      },
      trainingWeight: sourceWeight({
        kind: decision.kind,
        winner: decision.playerIdx === winnerIdx,
        finalRank,
        madeBid,
        weightScale: args.weightScale,
      }),
      source: {
        participantKind: "human",
        participantName: decision.playerName,
        participantPersonality: decision.playerPersonality,
        teacherPolicyId: "production-human:platform",
        requestedPolicyId: "production-human:platform",
        humanOnly: true,
      },
    };
  });

  return {
    examples,
    skippedNonHumanDecisions: humanDecisionsSkippedAfterReplacement,
  };
}

const rawDir = arg("raw-dir", "ai-data/production-export-platform-20260518-232713");
const out = arg("out", "ai-data/production-platform-human-playstyle-v1.jsonl");
const manifestOut = arg("manifest", out.replace(/\.jsonl$/, ".manifest.json"));
const weightScale = numberValue(arg("weight-scale", "1"), 1);

const games = readJsonl<GameDoc>(join(rawDir, "games", "documents.jsonl"));
const events = readJsonl<GameEvent>(join(rawDir, "gameEvents", "documents.jsonl"));

const eventsByGame = new Map<string, GameEvent[]>();
for (const event of events) {
  const rows = eventsByGame.get(event.gameId) ?? [];
  rows.push({ ...event, sequence: numberValue(event.sequence), seatIdx: event.seatIdx == null ? undefined : numberValue(event.seatIdx) });
  eventsByGame.set(event.gameId, rows);
}

const completed = games
  .filter((game) => game.status === "completed" && numberValue(game.decks) === 2)
  .sort((a, b) => numberValue(a.startedAt ?? a.createdAt) - numberValue(b.startedAt ?? b.createdAt));

const examples: WeightedHumanExample[] = [];
const failures: Array<{ gameId: string; reason: string }> = [];
const gameSummaries = [];
let skippedNonHumanDecisions = 0;

for (const game of completed) {
  const gameId = game._id;
  const gameEvents = (eventsByGame.get(gameId) ?? []).sort((a, b) => a.sequence - b.sequence);
  try {
    const exported = exportGame({
      game,
      events: gameEvents,
      weightScale,
    });
    examples.push(...exported.examples);
    skippedNonHumanDecisions += exported.skippedNonHumanDecisions;
    gameSummaries.push({
      gameId,
      startedAt: game.startedAt ?? game.createdAt ?? null,
      finishedAt: game.finishedAt ?? null,
      playerCount: numberValue(game.playerCount),
      startingTricksPerHand: numberValue(game.startingTricksPerHand, 1),
      tricksPerHand: numberValue(game.tricksPerHand),
      defaultBotMood: game.defaultBotMood ?? null,
      examples: exported.examples.length,
      playExamples: exported.examples.filter((example) => example.kind === "play").length,
      bidExamples: exported.examples.filter((example) => example.kind === "bid").length,
      humanPlayers: [...new Set(exported.examples.map((example) => example.source.participantName))],
      skippedNonHumanDecisions: exported.skippedNonHumanDecisions,
    });
  } catch (error) {
    failures.push({ gameId, reason: error instanceof Error ? error.message : String(error) });
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, examples.map((example) => JSON.stringify(example)).join("\n") + (examples.length ? "\n" : ""), "utf8");

const byKind = examples.reduce<Record<string, number>>((acc, example) => {
  acc[example.kind] = (acc[example.kind] ?? 0) + 1;
  return acc;
}, {});
const byHuman = examples.reduce<Record<string, number>>((acc, example) => {
  acc[example.source.participantName] = (acc[example.source.participantName] ?? 0) + 1;
  return acc;
}, {});

const manifest = {
  created_by: "export-production-human-playstyle-dataset",
  rawDir,
  out,
  completedGames: completed.length,
  exportedGames: gameSummaries.length,
  failedGames: failures.length,
  examples: examples.length,
  playExamples: byKind.play ?? 0,
  bidExamples: byKind.bid ?? 0,
  skippedNonHumanDecisions,
  weightedExamples: Number(examples.reduce((sum, example) => sum + example.trainingWeight, 0).toFixed(2)),
  byKind,
  byHuman,
  gameSummaries,
  failures,
  trainingPolicy: {
    purpose:
      "Train a human-imitation successor for German Bridge card play from completed production games.",
    inclusion:
      "Only decisions where the acting replay seat is human at decision time are exported. Bot, GPT, Gemini, Champion, heuristic, fallback, and post-seat-replacement bot moves are excluded.",
    fairObservationBoundary:
      "Examples are reconstructed from BotObservation before each decision; hidden opponent hands are not included.",
    weighting:
      "Human play decisions receive 8x base weight and bids receive 2x base weight; winners, made bids, and top-two finishes receive small boosts.",
    weightScale,
  },
};

mkdirSync(dirname(manifestOut), { recursive: true });
writeFileSync(manifestOut, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(
  JSON.stringify(
    {
      out,
      manifest: manifestOut,
      completedGames: completed.length,
      exportedGames: gameSummaries.length,
      failedGames: failures.length,
      examples: examples.length,
      playExamples: byKind.play ?? 0,
      bidExamples: byKind.bid ?? 0,
      skippedNonHumanDecisions,
      weightedExamples: manifest.weightedExamples,
      byHuman,
      failures,
    },
    null,
    2,
  ),
);
