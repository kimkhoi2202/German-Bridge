import type {
  BotActionTrace,
  BotDecisionAction,
  BotDecisionTrace,
} from "../bot";
import type { Card } from "../cards";
import type { BotObservation } from "../botObservation";

export const DEFAULT_GPT_BRIDGE_MODEL = "gpt-5.5";
export const DEFAULT_GPT_BRIDGE_REASONING_EFFORT = "high";
export const GPT_BRIDGE_POLICY_ID = "openai:german-bridge-gpt";

export type GptBridgeDecision =
  | {
      kind: "bid";
      bid: number;
      confidence: number;
      reasoning_summary: string;
    }
  | {
      kind: "card";
      cardKey: string;
      confidence: number;
      reasoning_summary: string;
    };

export interface GptBridgeTraceMeta {
  model: string;
  reasoningEffort: string;
  requestId?: string;
  latencyMs?: number;
}

type ParsedDecision = Partial<GptBridgeDecision> & Record<string, unknown>;

function cardLabel(card: Card) {
  return `${card.r}${card.s.toUpperCase()} deck ${card.d + 1}`;
}

function bidAction(bid: number): BotDecisionAction {
  return { kind: "bid", bid, label: `Bid ${bid}` };
}

function cardAction(card: Card): BotDecisionAction {
  return {
    kind: "card",
    card,
    cardKey: card.key,
    label: cardLabel(card),
  };
}

function clampConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0.5;
}

function cleanSummary(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, 320)
    : "";
}

function gptActionTrace(action: BotDecisionAction, chosenAction: BotDecisionAction, score: number): BotActionTrace {
  const isChosen =
    chosenAction.kind === "bid" && action.kind === "bid"
      ? chosenAction.bid === action.bid
      : chosenAction.kind === "card" && action.kind === "card" && chosenAction.cardKey === action.cardKey;
  return {
    ...action,
    score: Number(score.toFixed(6)),
    isChosen,
  };
}

export function buildGptBridgeTextFormat(observation: BotObservation) {
  if (observation.phase === "bidding") {
    return {
      type: "json_schema",
      name: "german_bridge_bid_decision",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["bid"] },
          bid: { type: "integer", enum: observation.legalBids },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reasoning_summary: { type: "string" },
        },
        required: ["kind", "bid", "confidence", "reasoning_summary"],
      },
    };
  }

  return {
    type: "json_schema",
    name: "german_bridge_card_decision",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["card"] },
        cardKey: {
          type: "string",
          enum: observation.legalCards.map((card) => card.key),
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reasoning_summary: { type: "string" },
      },
      required: ["kind", "cardKey", "confidence", "reasoning_summary"],
    },
  };
}

export function buildGptBridgeInput(observation: BotObservation) {
  const legalCardSummaries = observation.legalCards.map((card) => ({
    key: card.key,
    label: cardLabel(card),
    rank: card.r,
    suit: card.s,
    deck: card.d + 1,
  }));
  const ownHand = observation.ownHand.map((card) => ({
    key: card.key,
    label: cardLabel(card),
    rank: card.r,
    suit: card.s,
    deck: card.d + 1,
  }));
  const player = observation.players[observation.playerIdx];
  const bid = observation.bids[observation.playerIdx] ?? null;
  const won = observation.won[observation.playerIdx] ?? 0;
  const context = {
    task: observation.phase === "bidding" ? "choose_bid" : "choose_card",
    objective:
      "Maximize expected German Bridge score. Exact bids score +10 + won^2; misses score -(abs(bid-won)^2). Prefer robust exact-bid accuracy over flashy trick wins.",
    rules: {
      bidding:
        "Choose exactly one legal bid. The last bidder cannot make the total table bid equal the number of tricks.",
      play: "Follow suit if able. Trump beats lead suit. In multi-deck play, equal-rank cards in the same tier are beaten by the later-played card.",
      hiddenInformation:
        "Use only this JSON context. Do not assume or invent hidden opponent cards.",
    },
    seat: {
      playerIdx: observation.playerIdx,
      name: player?.name ?? `Player ${observation.playerIdx}`,
      playerCount: observation.playerCount,
      decks: observation.decks,
      tricksThisHand: observation.tricksTotal,
      maxHandSize: observation.tricksPerHand,
      leadIdx: observation.leadIdx,
      turnIdx: observation.turnIdx,
      bidTurn: observation.bidTurn,
    },
    scoreState: {
      currentBid: bid,
      currentWon: won,
      currentNeed: bid == null ? null : bid - won,
      bids: observation.bids,
      won: observation.won,
      remainingHandCounts: observation.remainingHandCounts,
    },
    trump: observation.trumpCard
      ? {
          key: observation.trumpCard.key,
          label: cardLabel(observation.trumpCard),
          suit: observation.trumpCard.s,
        }
      : null,
    players: observation.players.map((p, index) => ({
      index,
      name: p.name,
      isHuman: p.isHuman,
      style: p.personality,
    })),
    ownHand,
    currentTrick: observation.currentTrick.map((play) => ({
      playerIdx: play.playerIdx,
      card: {
        key: play.card.key,
        label: cardLabel(play.card),
        rank: play.card.r,
        suit: play.card.s,
        deck: play.card.d + 1,
      },
    })),
    playLog: observation.playLog.map((entry) => ({
      trick: entry.trick,
      order: entry.order,
      playerIdx: entry.playerIdx,
      card: {
        key: entry.card.key,
        label: cardLabel(entry.card),
        rank: entry.card.r,
        suit: entry.card.s,
        deck: entry.card.d + 1,
      },
      winner: entry.winner === true,
    })),
    opponentProfiles: observation.opponentProfiles,
    legalActions:
      observation.phase === "bidding"
        ? { legalBids: observation.legalBids }
        : { legalCards: legalCardSummaries },
  };

  return [
    {
      role: "system",
      content:
        "You are a strong German Bridge bot. Think carefully, but output only the required JSON object. Do not reveal chain-of-thought. Pick one legal action from the provided legalActions only.",
    },
    {
      role: "user",
      content:
        "Choose the best German Bridge action for this exact public state. Return schema-valid JSON only.\n" +
        JSON.stringify(context),
    },
  ];
}

export function parseGptBridgeDecision(text: string): ParsedDecision {
  const parsed = JSON.parse(text) as ParsedDecision;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("gpt_decision_not_object");
  }
  return parsed;
}

export function validateGptBridgeDecision(
  observation: BotObservation,
  parsed: ParsedDecision,
): GptBridgeDecision {
  if (observation.phase === "bidding") {
    if (parsed.kind !== "bid" || typeof parsed.bid !== "number" || !Number.isInteger(parsed.bid)) {
      throw new Error("gpt_decision_not_bid");
    }
    if (!observation.legalBids.includes(parsed.bid)) {
      throw new Error("gpt_bid_not_legal");
    }
    return {
      kind: "bid",
      bid: parsed.bid,
      confidence: clampConfidence(parsed.confidence),
      reasoning_summary: cleanSummary(parsed.reasoning_summary),
    };
  }

  if (observation.phase === "playing") {
    if (parsed.kind !== "card" || typeof parsed.cardKey !== "string") {
      throw new Error("gpt_decision_not_card");
    }
    if (!observation.legalCards.some((card) => card.key === parsed.cardKey)) {
      throw new Error("gpt_card_not_legal");
    }
    return {
      kind: "card",
      cardKey: parsed.cardKey,
      confidence: clampConfidence(parsed.confidence),
      reasoning_summary: cleanSummary(parsed.reasoning_summary),
    };
  }

  throw new Error("gpt_decision_wrong_phase");
}

export function gptBridgeDecisionToTrace(
  observation: BotObservation,
  decision: GptBridgeDecision,
  meta: GptBridgeTraceMeta,
): BotDecisionTrace {
  const chosenAction =
    decision.kind === "bid"
      ? bidAction(decision.bid)
      : cardAction(observation.legalCards.find((card) => card.key === decision.cardKey)!);
  const legalActions =
    decision.kind === "bid"
      ? observation.legalBids.map((bid) =>
          gptActionTrace(bidAction(bid), chosenAction, bid === decision.bid ? decision.confidence : 0),
        )
      : observation.legalCards.map((card) =>
          gptActionTrace(cardAction(card), chosenAction, card.key === decision.cardKey ? decision.confidence : 0),
        );

  return {
    version: 1,
    decisionKind: decision.kind === "bid" ? "bid" : "card",
    personality: "gpt",
    policyId: GPT_BRIDGE_POLICY_ID,
    requestedPolicyId: `openai:${meta.model}`,
    fallback: false,
    chosenAction,
    legalActionCount: legalActions.length,
    legalActions,
    topActions: [
      ...legalActions.filter((action) => action.isChosen),
      ...legalActions.filter((action) => !action.isChosen),
    ].slice(0, 5),
    heuristic: {
      model: meta.model,
      reasoningEffort: meta.reasoningEffort,
      confidence: decision.confidence,
      latencyMs: meta.latencyMs ?? null,
      requestId: meta.requestId ?? null,
      reasoningSummary: decision.reasoning_summary,
    },
  };
}
