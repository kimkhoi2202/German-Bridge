export interface LlmBridgeStrategyCard {
  id: string;
  title: string;
  intent: string;
  biddingLens: readonly string[];
  playLens: readonly string[];
  riskControls: readonly string[];
}

export const DEFAULT_LLM_BRIDGE_STRATEGY_ID = "pressure-exact-v2";

export const LLM_BRIDGE_STRATEGY_CARDS: readonly LlmBridgeStrategyCard[] = [
  {
    id: "pressure-exact-v2",
    title: "Pressure Exact Controller",
    intent:
      "Win by making your own bid while using table pressure to deny easy exact bids to others.",
    biddingLens: [
      "Estimate forced wins, safe losers, and accidental winners before choosing a number.",
      "Treat table overbid as danger; do not add a marginal bid just because your hand looks playable.",
      "Treat table underbid as danger too; account for unwanted tricks that somebody must take.",
    ],
    playLens: [
      "Protect your exact bid first, then prefer plays that move opponents away from their target.",
      "Use low trump or middle cards only when they improve control or disrupt a player with a fragile bid.",
      "Track who is void in lead suits and avoid giving them easy trump control unless it hurts their bid.",
    ],
    riskControls: [
      "Do not chase extra wins after meeting bid.",
      "Do not dump all danger cards early if it leaves no controllable loser for the endgame.",
    ],
  },
  {
    id: "void-endgame-v1",
    title: "Void And Endgame Reader",
    intent:
      "Build late-hand control by tracking suit exhaustion, voids, and who can still be forced.",
    biddingLens: [
      "Bid conservatively when your winners depend on suits where you are short or likely to be forced.",
      "Increase bid only when trump count plus side-suit winners remain useful after follow-suit constraints.",
    ],
    playLens: [
      "Prefer plays that reveal or exploit voids, especially when a target player cannot follow suit.",
      "Preserve one clear winner and one clear loser when possible until the last tricks.",
      "When above target, lead suits that let others beat you instead of spending high control cards.",
    ],
    riskControls: [
      "Middle cards are unstable; avoid treating them as guaranteed losses in small tables.",
      "A player with no cards in a suit may turn your safe loss into an accidental win or trump fight.",
    ],
  },
  {
    id: "trump-pressure-v1",
    title: "Trump Pressure Bully",
    intent:
      "Use trump timing to break opponents' plans without wasting high trump control.",
    biddingLens: [
      "Value trump count, but discount weak trump if many players still need tricks.",
      "Bid higher only when trump plus suit length gives repeatable control, not just one flashy card.",
    ],
    playLens: [
      "A small trump lead can be correct when it drains opponents who bid around trump strength.",
      "Hold high trump for decisive control unless playing it now prevents an opponent's exact bid.",
      "If you need to lose, avoid opening trump wars that may boomerang into extra wins.",
    ],
    riskControls: [
      "Do not bully with trump just because you can; tie it to a player need or endgame plan.",
      "Respect follow-suit traps before spending trump.",
    ],
  },
  {
    id: "human-exploit-v1",
    title: "Human Exploit Counter",
    intent:
      "Play against a strong human who bids exact, burns middle cards, and preserves control cards.",
    biddingLens: [
      "Assume the human is using trump count, side-suit high cards, and forced-card risk to bid.",
      "Avoid predictable low bids when the hand has unavoidable winners.",
      "Prefer bids that remain plausible if the human blocks your clean line.",
    ],
    playLens: [
      "Watch the human's bid gap; if they are on track, choose legal plays that force hard choices.",
      "Do not feed the human safe burns when they need to lose.",
      "When the human is below target, avoid casually handing them controllable winners.",
    ],
    riskControls: [
      "Do not tunnel on the human if another opponent is about to make a large exact score.",
      "Keep your own bid exact; sabotage is secondary.",
    ],
  },
  {
    id: "table-police-v1",
    title: "Table Total Police",
    intent:
      "Exploit the fact that total bids cannot equal available tricks and table pressure predicts chaos.",
    biddingLens: [
      "Compare total bids to tricks before and after each legal bid.",
      "When total bids are high, prefer flexibility and avoid joining the crowd unless winners are forced.",
      "When total bids are low, beware accidental wins and bid enough to avoid being the obvious sink.",
    ],
    playLens: [
      "If several players need wins, make them fight each other rather than spending your control.",
      "If several players need losses, force the most dangerous exact-bid player to take a trick.",
    ],
    riskControls: [
      "Do not choose a table-total plan that makes your own exact bid impossible.",
      "Recompute after every trick; table pressure changes fast.",
    ],
  },
  {
    id: "table-police-forced-v1",
    title: "Table Police Forced-Winner",
    intent:
      "Keep table-total control, but override timid zero bids when the hand has a likely forced winner.",
    biddingLens: [
      "Start with table bid pressure, then separately count near-certain winners: high trump, protected aces, and cards likely to be forced by suit length.",
      "Bid 1 instead of 0 when you hold a winner that opponents are unlikely to erase, unless table pressure makes that trick uniquely dangerous.",
      "Do not chase extra bids from speculative middle cards; this strategy is only correcting unavoidable-win underbids.",
    ],
    playLens: [
      "If you bid 0, spend dangerous winners early only when they are likely to be beaten or trumped.",
      "If you bid 1, preserve one reliable winner and use the rest of the hand to dodge accidental second tricks.",
      "Keep policing opponents' exact bids, but never sabotage in a way that breaks your own forced-winner plan.",
    ],
    riskControls: [
      "A low table total is a warning that someone must accidentally win; do not volunteer to be the sink with unavoidable high cards.",
      "A forced-winner override should change 0 to 1, not turn every strong-looking hand into an optimistic bid.",
    ],
  },
  {
    id: "balanced-master-v1",
    title: "Balanced Master",
    intent:
      "A generalist style that weighs exact bidding, sabotage, trump control, and late-hand safety evenly.",
    biddingLens: [
      "Start from expected winners, then adjust for table pressure, lead order, and forced follow-suit risk.",
      "Prefer the bid with the best expected score, not the most exciting or most cautious number.",
    ],
    playLens: [
      "At each legal card, ask whether it wins now, loses now, preserves a future option, or changes an opponent's plan.",
      "Spend control only when it improves expected score more than saving it.",
    ],
    riskControls: [
      "Avoid extreme plans without concrete table evidence.",
      "When uncertain, choose the card that leaves more future legal flexibility.",
    ],
  },
];

export function getLlmBridgeStrategyCard(id = DEFAULT_LLM_BRIDGE_STRATEGY_ID): LlmBridgeStrategyCard {
  return (
    LLM_BRIDGE_STRATEGY_CARDS.find((strategy) => strategy.id === id) ??
    LLM_BRIDGE_STRATEGY_CARDS.find((strategy) => strategy.id === DEFAULT_LLM_BRIDGE_STRATEGY_ID)!
  );
}

export function customLlmBridgeStrategyCard(text: string): LlmBridgeStrategyCard {
  return {
    id: "custom-env",
    title: "Custom Environment Strategy",
    intent: text.replace(/\s+/g, " ").trim().slice(0, 900),
    biddingLens: [],
    playLens: [],
    riskControls: [],
  };
}

export function formatLlmBridgeStrategyCard(strategy: LlmBridgeStrategyCard): string {
  const sections = [
    `${strategy.title} (${strategy.id})`,
    `Intent: ${strategy.intent}`,
    strategy.biddingLens.length ? `Bidding lens: ${strategy.biddingLens.join(" ")}` : "",
    strategy.playLens.length ? `Play lens: ${strategy.playLens.join(" ")}` : "",
    strategy.riskControls.length ? `Risk controls: ${strategy.riskControls.join(" ")}` : "",
  ].filter(Boolean);
  return sections.join(" ");
}
