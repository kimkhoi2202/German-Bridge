import { rankVal, SUITS, type Card } from "../cards";
import type { BotObservation } from "../botObservation";

export const GPT_BRIDGE_MEMORY_VERSION = 1;
const MAX_CARD_LIST = 6;
const MAX_RECENT_DECISIONS = 8;

export type GptBridgeMemoryMode =
  | "planning"
  | "build-wins"
  | "protect-flex"
  | "dodge-extra"
  | "damage-control";

export interface GptBridgeMemory {
  version: typeof GPT_BRIDGE_MEMORY_VERSION;
  round: number;
  seatIdx: number;
  targetBid: number | null;
  mode: GptBridgeMemoryMode;
  plan: string;
  carryover: string[];
  winPaths: string[];
  protectedCards: string[];
  flexibleLosers: string[];
  dangerCards: string[];
  spentCards: string[];
  recentDecisions: string[];
}

export type GptBridgeMemoryDecision =
  | { kind: "bid"; bid: number }
  | { kind: "card"; cardKey: string };

function compactCard(card: Card) {
  return `${card.key}(${card.r}${card.s.toUpperCase()}d${card.d + 1})`;
}

function compactCards(cards: readonly Card[]) {
  return cards.slice(0, MAX_CARD_LIST).map(compactCard);
}

function isHigh(card: Card) {
  return rankVal(card.r) >= rankVal("J");
}

function isMiddle(card: Card) {
  const value = rankVal(card.r);
  return value >= rankVal("6") && value <= rankVal("T");
}

function suitCount(hand: readonly Card[], suit: Card["s"]) {
  return hand.filter((card) => card.s === suit).length;
}

function currentMode(observation: BotObservation, targetBid: number | null): GptBridgeMemoryMode {
  if (observation.phase === "bidding" || targetBid == null) return "planning";
  const won = observation.won[observation.playerIdx] ?? 0;
  const remaining = observation.remainingHandCounts[observation.playerIdx] ?? observation.ownHand.length;
  const need = targetBid - won;
  if (need < 0) return "damage-control";
  if (need === 0) return "dodge-extra";
  if (need >= remaining) return "build-wins";
  return "protect-flex";
}

function cardBuckets(observation: BotObservation) {
  const trumpSuit = observation.trumpSuit;
  const hand = observation.ownHand;
  const highTrump = hand.filter((card) => trumpSuit != null && card.s === trumpSuit && isHigh(card));
  const sideAcesKings = hand.filter((card) => card.s !== trumpSuit && ["A", "K"].includes(card.r));
  const protectedCards = hand.filter((card) => {
    if (trumpSuit != null && card.s === trumpSuit && rankVal(card.r) >= rankVal("T")) return true;
    if (["A", "K", "Q"].includes(card.r)) return true;
    return false;
  });
  const flexibleLosers = hand.filter((card) => {
    if (trumpSuit != null && card.s === trumpSuit) return rankVal(card.r) <= rankVal("5");
    return rankVal(card.r) <= rankVal("5") || isMiddle(card);
  });
  const dangerCards = hand.filter((card) => {
    if (!isHigh(card)) return false;
    if (trumpSuit != null && card.s === trumpSuit) return rankVal(card.r) <= rankVal("Q");
    return suitCount(hand, card.s) <= 2;
  });

  return {
    winPaths: compactCards([...highTrump, ...sideAcesKings]),
    protectedCards: compactCards(protectedCards),
    flexibleLosers: compactCards(flexibleLosers),
    dangerCards: compactCards(dangerCards),
  };
}

function planText(observation: BotObservation, targetBid: number | null) {
  const trumpCount = observation.trumpSuit
    ? observation.ownHand.filter((card) => card.s === observation.trumpSuit).length
    : 0;
  const suitShape = SUITS.map((suit) => `${suit.toUpperCase()}${suitCount(observation.ownHand, suit)}`).join("");
  const target = targetBid == null ? "unknown" : String(targetBid);
  return [
    `target ${target} with ${trumpCount}/${observation.ownHand.length} trump and ${suitShape}`,
    "keep a coherent exact-bid line; do not treat every high card as automatic win or automatic dump",
    "in two-deck/crowded play, A/K can be trumped, so spend control early only to test/lock a needed win or save it for late control",
  ].join("; ");
}

function carryoverFromPrevious(previous: GptBridgeMemory | null | undefined, observation: BotObservation) {
  if (!previous || previous.seatIdx !== observation.playerIdx || previous.round === observation.round) {
    return [];
  }
  const lastChoices = previous.recentDecisions.slice(-3);
  return [
    `from h${previous.round}: keep only strategic lessons, not old hand card buckets`,
    ...lastChoices,
  ].slice(-4);
}

function summarizeCardDecision(observation: BotObservation, cardKey: string) {
  const card = observation.ownHand.find((candidate) => candidate.key === cardKey);
  const targetBid = observation.bids[observation.playerIdx] ?? null;
  const won = observation.won[observation.playerIdx] ?? 0;
  const need = targetBid == null ? "?" : targetBid - won;
  const trick = observation.trickIdx + 1;
  if (!card) return `h${observation.round} t${trick}: played ${cardKey}; need ${need}`;
  const leadSuit = observation.currentTrick[0]?.card.s ?? null;
  const role =
    observation.trumpSuit != null && card.s === observation.trumpSuit
      ? "trump"
      : leadSuit != null && card.s === leadSuit
        ? "follow"
        : leadSuit == null
          ? "lead"
          : "off";
  return `h${observation.round} t${trick}: ${compactCard(card)} as ${role}; live need ${need}`;
}

function pruneSpent(cards: readonly string[], spentKeys: readonly string[]) {
  if (!spentKeys.length) return [...cards];
  return cards.filter((label) => !spentKeys.some((key) => label.startsWith(`${key}(`)));
}

function freshMemory(
  observation: BotObservation,
  targetBid: number | null,
  previous?: GptBridgeMemory | null,
): GptBridgeMemory {
  const buckets = cardBuckets(observation);
  return {
    version: GPT_BRIDGE_MEMORY_VERSION,
    round: observation.round,
    seatIdx: observation.playerIdx,
    targetBid,
    mode: currentMode(observation, targetBid),
    plan: planText(observation, targetBid),
    carryover: carryoverFromPrevious(previous, observation),
    winPaths: buckets.winPaths,
    protectedCards: buckets.protectedCards,
    flexibleLosers: buckets.flexibleLosers,
    dangerCards: buckets.dangerCards,
    spentCards: [],
    recentDecisions: [],
  };
}

export function nextGptBridgeMemory(
  previous: GptBridgeMemory | null,
  observation: BotObservation,
  decision: GptBridgeMemoryDecision,
): GptBridgeMemory {
  const targetBid =
    decision.kind === "bid" ? decision.bid : previous?.targetBid ?? observation.bids[observation.playerIdx] ?? null;
  const base =
    previous && previous.round === observation.round && previous.seatIdx === observation.playerIdx
      ? previous
      : freshMemory(observation, targetBid, previous);
  const spentCards =
    decision.kind === "card" && !base.spentCards.includes(decision.cardKey)
      ? [...base.spentCards, decision.cardKey].slice(-MAX_CARD_LIST)
      : base.spentCards;
  const recent =
    decision.kind === "bid"
      ? [`h${observation.round}: bid ${decision.bid}; plan ${planText(observation, decision.bid)}`]
      : [...base.recentDecisions, summarizeCardDecision(observation, decision.cardKey)].slice(
          -MAX_RECENT_DECISIONS,
        );

  return {
    ...base,
    targetBid,
    mode: currentMode(observation, targetBid),
    plan: decision.kind === "bid" ? planText(observation, decision.bid) : base.plan,
    spentCards,
    winPaths: pruneSpent(base.winPaths, spentCards),
    protectedCards: pruneSpent(base.protectedCards, spentCards),
    flexibleLosers: pruneSpent(base.flexibleLosers, spentCards),
    dangerCards: pruneSpent(base.dangerCards, spentCards),
    recentDecisions: recent,
  };
}

export function formatGptBridgeMemoryForPrompt(
  memory: GptBridgeMemory | null | undefined,
  observation: BotObservation,
) {
  const fallbackTarget = observation.bids[observation.playerIdx] ?? null;
  const active =
    memory && memory.round === observation.round && memory.seatIdx === observation.playerIdx
      ? memory
      : null;
  const targetBid = active?.targetBid ?? fallbackTarget;
  const mode = currentMode(observation, targetBid);
  const won = observation.won[observation.playerIdx] ?? 0;
  const need = targetBid == null ? "?" : targetBid - won;
  if (!active) {
    const carryover = carryoverFromPrevious(memory, observation);
    if (carryover.length) {
      return [
        `privateThread=carry r${memory?.round}->${observation.round} live=b${targetBid ?? "?"}/w${won}/need${need}/mode${mode}`,
        `carry:${carryover.join(" | ")}`,
        "carryRule: use prior decisions as style/discipline memory only; old hand-specific cards are stale. Build a fresh exact-bid plan from current cards and public history.",
      ].join("\n");
    }
    return `privateThread=none live=b${targetBid ?? "?"}/w${won}/need${need}/mode${mode}; build a coherent hand plan from this state.`;
  }

  return [
    `privateThread=v${active.version} r${active.round} target=b${active.targetBid ?? "?"}/w${won}/need${need}/mode=${mode}`,
    `plan:${active.plan}`,
    `carry:${active.carryover.join(" | ") || "-"}`,
    `winPaths:${active.winPaths.join(" ") || "-"}`,
    `protect:${active.protectedCards.join(" ") || "-"}`,
    `flexLose:${active.flexibleLosers.join(" ") || "-"}`,
    `danger:${active.dangerCards.join(" ") || "-"}`,
    `spent:${active.spentCards.join(" ") || "-"}`,
    `recent:${active.recentDecisions.join(" | ") || "-"}`,
    "threadRule: keep the bid plan coherent; if behind, preserve future winners unless the card can win now or sets up a clearer line; if at/over target, shift to controlled losing and danger-dump without becoming predictable.",
  ].join("\n");
}
