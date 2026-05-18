import type {
  BotActionTrace,
  BotDecisionAction,
  BotDecisionTrace,
} from "../bot";
import { rankVal, SUITS, type Card } from "../cards";
import type { BotObservation } from "../botObservation";
import { resolveTrick } from "../trick";
import {
  formatLlmBridgeStrategyCard,
  getLlmBridgeStrategyCard,
  type LlmBridgeStrategyCard,
} from "./llmStrategyCards";

export const DEFAULT_GPT_BRIDGE_MODEL = "gpt-5.5";
export const DEFAULT_GPT_BRIDGE_REASONING_EFFORT = "low";
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
  strategyId?: string;
  requestId?: string;
  latencyMs?: number;
}

type ParsedDecision = Partial<GptBridgeDecision> & Record<string, unknown>;

export interface GptBridgePromptOptions {
  strategy?: LlmBridgeStrategyCard | null;
}

function cardLabel(card: Card) {
  return `${card.r}${card.s.toUpperCase()} deck ${card.d + 1}`;
}

function compactCard(card: Card) {
  return `${card.key}(${card.r}${card.s.toUpperCase()}d${card.d + 1})`;
}

function compactCards(cards: readonly Card[]) {
  return cards.map(compactCard).join(" ");
}

function compactPlayLog(observation: BotObservation) {
  if (!observation.playLog.length) return "none";
  return observation.playLog
    .map((entry) => {
      const winner = entry.winner === true ? "!" : "";
      return `t${entry.trick}.${entry.order}=p${entry.playerIdx}:${entry.card.r}${entry.card.s.toUpperCase()}d${entry.card.d + 1}${winner}`;
    })
    .join(" ");
}

function compactTrick(observation: BotObservation) {
  if (!observation.currentTrick.length) return "empty";
  return observation.currentTrick
    .map((play, index) => `o${index + 1}=p${play.playerIdx}:${compactCard(play.card)}`)
    .join(" ");
}

function compactProfiles(observation: BotObservation) {
  return observation.opponentProfiles
    .map((profile) => {
      const voidSuits = Object.entries(profile.voidSuits)
        .filter(([, isVoid]) => isVoid)
        .map(([suit]) => suit.toUpperCase())
        .join("") || "-";
      return `p${profile.playerIdx}:b${profile.currentBid ?? "?"}/w${profile.currentWon}/gap${profile.currentBidGap}/void${voidSuits}/hist${profile.priorMadeBidCount}-${profile.priorUnderBidCount}-${profile.priorOverBidCount}`;
    })
    .join(" ");
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function compactHandShape(observation: BotObservation) {
  const suitCounts = SUITS.map((suit) => {
    const count = observation.ownHand.filter((card) => card.s === suit).length;
    return `${suit.toUpperCase()}${count}`;
  }).join("");
  const trumpCount = observation.trumpSuit
    ? observation.ownHand.filter((card) => card.s === observation.trumpSuit).length
    : 0;
  const highCount = observation.ownHand.filter((card) => rankVal(card.r) >= rankVal("J")).length;
  const middleCount = observation.ownHand.filter((card) => {
    const value = rankVal(card.r);
    return value >= rankVal("6") && value <= rankVal("T");
  }).length;
  const lowCount = observation.ownHand.filter((card) => rankVal(card.r) <= rankVal("5")).length;
  const voidSuits =
    SUITS.filter((suit) => !observation.ownHand.some((card) => card.s === suit))
      .map((suit) => suit.toUpperCase())
      .join("") || "-";
  return `shape=tr${trumpCount}/${observation.ownHand.length} ${suitCounts} hiJ+${highCount} mid6-T${middleCount} low2-5${lowCount} selfVoid${voidSuits}`;
}

function compactNeeds(observation: BotObservation) {
  return observation.bids
    .map((bid, playerIdx) => {
      const won = observation.won[playerIdx] ?? 0;
      const need = bid == null ? "?" : bid - won;
      return `p${playerIdx}:b${bid ?? "?"}/w${won}/n${need}`;
    })
    .join(" ");
}

function compactBidPressure(observation: BotObservation) {
  const placedBids = observation.bids.filter((bid): bid is number => bid != null);
  const bidSum = placedBids.reduce((sum, bid) => sum + bid, 0);
  const openSeats = observation.bids.filter((bid) => bid == null).length;
  const legalLens = observation.legalBids.map((bid) => {
    const sumAfter = bidSum + bid;
    const openAfter = Math.max(0, openSeats - 1);
    const tableDelta = sumAfter - observation.tricksTotal;
    const restTarget = observation.tricksTotal - sumAfter;
    return `${bid}:sum${sumAfter}/delta${signed(tableDelta)}/rest${restTarget}/${openAfter}`;
  });
  return `bidctx=sum${bidSum}/tricks${observation.tricksTotal}/delta${signed(bidSum - observation.tricksTotal)}/open${openSeats}/legal[${legalLens.join(" ")}]`;
}

function cardTier(card: Card, leadSuit: Card["s"], trumpSuit: BotObservation["trumpSuit"]) {
  if (trumpSuit && card.s === trumpSuit) return "tr";
  if (card.s === leadSuit) return "lead";
  return "off";
}

function compactLegalCardLens(observation: BotObservation) {
  if (!observation.legalCards.length) return "cardlens=none";
  const leadSuit = observation.currentTrick[0]?.card.s ?? null;
  const afterSeats = Math.max(0, observation.playerCount - observation.currentTrick.length - 1);
  return `cardlens=${observation.legalCards
    .map((card) => {
      const tier = cardTier(card, leadSuit ?? card.s, observation.trumpSuit);
      const now =
        leadSuit == null
          ? "lead"
          : resolveTrick(
              [...observation.currentTrick, { playerIdx: observation.playerIdx, card }],
              leadSuit,
              observation.trumpSuit,
            ).playerIdx === observation.playerIdx
            ? "nowWin"
            : "nowLose";
      return `${card.key}:${card.r}${card.s.toUpperCase()}/v${rankVal(card.r)}/${tier}/${now}/after${afterSeats}`;
    })
    .join(" ")}`;
}

function expertDoctrine(observation: BotObservation) {
  if (observation.phase === "bidding") {
    return [
      "Private bidding process: make an independent expected-score estimate, not a fixed rule. Balance likely winners, unavoidable accidental winners, safe losers, suit length, trump control, lead position, and table bid pressure.",
      "Treat middle cards as uncertain: they are less reliable than clear winners or clear losers. High off-suit cards can become forced accidental wins when suit length is short.",
      "Use bidctx to avoid optimism: when table bids are already above tricks, adding a marginal bid usually helps opponents; when table bids are low, account for accidental wins.",
    ].join(" ");
  }

  return [
    "Private play process: compare legal cards by expected final score. First protect your own exact bid, then use opponent needs, voids, and current trick pressure to break their exact bids.",
    "Use cardlens and needs: decide whether each card is likely to win now, lose now, preserve control, create a void, burn danger, or force an opponent into an unwanted trick.",
    "Do not blindly dump or blindly win. Re-evaluate every turn from the live table: current trick, played cards, void profiles, remaining cards, and each player's need.",
  ].join(" ");
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
  void observation;
  return { type: "text" };
}

export function buildGptBridgeInput(observation: BotObservation, options: GptBridgePromptOptions = {}) {
  const strategy = options.strategy ?? getLlmBridgeStrategyCard();
  const player = observation.players[observation.playerIdx];
  const bid = observation.bids[observation.playerIdx] ?? null;
  const won = observation.won[observation.playerIdx] ?? 0;
  const trump = observation.trumpCard
    ? `${observation.trumpCard.r}${observation.trumpCard.s.toUpperCase()}d${observation.trumpCard.d + 1}`
    : "none";
  const players = observation.players
    .map((p, index) => `p${index}=${p.name}${p.isHuman ? ":human" : ":bot"}:${p.personality}`)
    .join(" ");
  const publicState = [
    `phase=${observation.phase}`,
    `seat=p${observation.playerIdx}(${player?.name ?? `Player ${observation.playerIdx}`})`,
    `players=${observation.playerCount}`,
    `decks=${observation.decks}`,
    `tricks=${observation.tricksTotal}`,
    `trump=${trump}`,
    `lead=p${observation.leadIdx}`,
    `turn=p${observation.turnIdx}`,
    `bidTurn=p${observation.bidTurn}`,
    `bids=${observation.bids.map((value) => value ?? "?").join(",")}`,
    `won=${observation.won.join(",")}`,
    `mine=b${bid ?? "?"}/w${won}/need${bid == null ? "?" : bid - won}`,
    `needs:${compactNeeds(observation)}`,
    `remaining=${observation.remainingHandCounts.join(",")}`,
    `players:${players}`,
    compactHandShape(observation),
    observation.phase === "bidding" ? compactBidPressure(observation) : compactLegalCardLens(observation),
    `hand:${compactCards(observation.ownHand) || "empty"}`,
    `trick:${compactTrick(observation)}`,
    `played:${compactPlayLog(observation)}`,
    `profiles:${compactProfiles(observation)}`,
  ].join("\n");

  const actionInstruction =
    observation.phase === "bidding"
      ? [
          `Legal bids: ${observation.legalBids.join(",")}`,
          "Return exactly one line: B:<legalBid>",
          "Choose the bid with best expected score after private reasoning. Do not overcorrect toward high bids or low bids.",
        ].join("\n")
      : [
          `Legal cards: ${compactCards(observation.legalCards)}`,
          "Return exactly one line: C:<legalCardKey>",
          "Use the card key before parentheses in the legal-cards list. Follow suit and choose the best expected-score card.",
        ].join("\n");

  return [
    {
      role: "system",
      content:
        "You are a strong German Bridge bot. Use only public state and your own hand. Think privately, but output one compact action line only: B:<bid> for bidding or C:<cardKey> for play. No prose, no JSON, no markdown.",
    },
    {
      role: "user",
      content:
        "Score: exact bid = +10 + won^2; miss = -(abs(bid-won)^2). Last bidder may be blocked from total bids equaling tricks. Multi-deck equal-rank ties are won by later-played equal-tier card.\n" +
        "Strategy lens, not hard rules: " +
        formatLlmBridgeStrategyCard(strategy) +
        "\n" +
        "Use this expert strategy, but obey legal actions and output format: " +
        expertDoctrine(observation) +
        "\n" +
        publicState +
        "\n" +
        actionInstruction,
    },
  ];
}

export function parseGptBridgeDecision(text: string): ParsedDecision {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as ParsedDecision;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("gpt_decision_not_object");
    }
    return parsed;
  }

  const firstLine = (trimmed.split(/\r?\n/, 1)[0] ?? "").replace(/^`+|`+$/g, "").trim();
  const bidMatch =
    firstLine.match(/^(?:B|BID)\s*[:=\-]?\s*(\d+)\s*$/i) ??
    firstLine.match(/\b(?:B|BID)\s*[:=\-]\s*(\d+)\b/i) ??
    firstLine.match(/^(\d+)\s*$/);
  if (bidMatch) {
    return {
      kind: "bid",
      bid: Number.parseInt(bidMatch[1]!, 10),
      confidence: 0.7,
      reasoning_summary: "",
    };
  }

  const cardMatch =
    firstLine.match(/^(?:C|CARD)\s*[:=\-]?\s*(\S+)\s*$/i) ??
    firstLine.match(/\b(?:C|CARD)\s*[:=\-]\s*(\S+)/i);
  if (cardMatch) {
    const rawCard = cardMatch[1]!.replace(/[`,.;]+$/g, "");
    const maybeKey = rawCard.includes(":") ? rawCard.slice(rawCard.lastIndexOf(":") + 1) : rawCard;
    const keyMatch = maybeKey.match(/^([A-Za-z0-9_-]+)/);
    return {
      kind: "card",
      cardKey: keyMatch?.[1] ?? maybeKey,
      confidence: 0.7,
      reasoning_summary: "",
    };
  }

  throw new Error("gpt_decision_not_compact_action");
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
      strategyId: meta.strategyId ?? null,
      latencyMs: meta.latencyMs ?? null,
      requestId: meta.requestId ?? null,
      reasoningSummary: decision.reasoning_summary,
    },
  };
}
