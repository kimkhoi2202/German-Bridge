// game.jsx — minimal poker engine + state hooks
// Texas Hold'em ruleset. Bots are heuristic (not strong play). Globals: React, window.
// ---------------------------------------------------------------

const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS = ['s','h','d','c'];
const RANK_VAL = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

function freshDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return shuffle(d);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Hand evaluator — returns {rank, name, kickers} for ANY 5-7 cards (best-of)
const HAND_NAMES = ['High Card','Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush','Royal Flush'];

function evaluateBest(cards7) {
  // brute force C(7,5) = 21
  const idxs = [];
  const n = cards7.length;
  for (let a = 0; a < n; a++)
    for (let b = a+1; b < n; b++)
      for (let c = b+1; c < n; c++)
        for (let d = c+1; d < n; d++)
          for (let e = d+1; e < n; e++)
            idxs.push([a,b,c,d,e]);
  let best = null;
  for (const ix of idxs) {
    const five = ix.map(i => cards7[i]);
    const ev = eval5(five);
    if (!best || ev.score > best.score) { best = ev; best.cards = five; }
  }
  return best;
}

function eval5(cards) {
  const ranks = cards.map(c => RANK_VAL[c[0]]).sort((a,b)=>b-a);
  const suits = cards.map(c => c[1]);
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r]||0) + 1;
  const groups = Object.entries(counts).map(([r,c])=>({r:+r,c}))
    .sort((a,b)=> b.c - a.c || b.r - a.r);
  const isFlush = suits.every(s => s === suits[0]);
  // straight
  const uniq = [...new Set(ranks)];
  let isStraight = false;
  let straightHi = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) { isStraight = true; straightHi = uniq[0]; }
    else if (uniq.join(',') === '14,5,4,3,2') { isStraight = true; straightHi = 5; } // wheel
  }
  let rank = 0, kickers = groups.map(g => g.r);
  if (isStraight && isFlush && straightHi === 14) rank = 9;
  else if (isStraight && isFlush) rank = 8;
  else if (groups[0].c === 4) rank = 7;
  else if (groups[0].c === 3 && groups[1].c === 2) rank = 6;
  else if (isFlush) rank = 5;
  else if (isStraight) { rank = 4; kickers = [straightHi]; }
  else if (groups[0].c === 3) rank = 3;
  else if (groups[0].c === 2 && groups[1].c === 2) rank = 2;
  else if (groups[0].c === 2) rank = 1;
  // score for ordering: rank in upper bits, kickers below
  let score = rank * 1e10;
  kickers.slice(0,5).forEach((k,i) => score += k * Math.pow(15, 4-i));
  return { rank, name: HAND_NAMES[rank], kickers, score };
}

// Strength as 0..1 for HUD meter (rough — assumes 7 known cards)
function strengthMeter(handRank, equityHint = null) {
  // Map 0..9 to 0..1 with mild curve
  return Math.min(1, (handRank + 1) / 10 + (equityHint || 0) * 0.05);
}

// Default seat configurations
const DEFAULT_PLAYERS_9 = [
  { name: 'You',          stack: 14250, seed: 0, hero: true,  bot: false },
  { name: 'Lana K.',      stack: 22300, seed: 1, hero: false, bot: true },
  { name: 'Ren Park',     stack: 6800,  seed: 2, hero: false, bot: true },
  { name: 'Vega',         stack: 41000, seed: 3, hero: false, bot: true },
  { name: 'Aoife M.',     stack: 19500, seed: 4, hero: false, bot: true },
  { name: 'Ito',          stack: 12100, seed: 5, hero: false, bot: true },
  { name: 'Costa',        stack: 8400,  seed: 6, hero: false, bot: true },
  { name: 'Solène',       stack: 33800, seed: 7, hero: false, bot: true },
  { name: 'Marek',        stack: 5500,  seed: 8, hero: false, bot: true },
];

const DEFAULT_PLAYERS_6 = DEFAULT_PLAYERS_9.slice(0, 6);
const DEFAULT_PLAYERS_2 = [DEFAULT_PLAYERS_9[0], DEFAULT_PLAYERS_9[3]];

function dealHand(players) {
  const deck = freshDeck();
  const hands = players.map(() => [deck.pop(), deck.pop()]);
  const burns = [];
  burns.push(deck.pop());
  const flop = [deck.pop(), deck.pop(), deck.pop()];
  burns.push(deck.pop());
  const turn = deck.pop();
  burns.push(deck.pop());
  const river = deck.pop();
  return { hands, board: [...flop, turn, river], deck };
}

Object.assign(window, {
  RANKS, SUITS, RANK_VAL, freshDeck, shuffle,
  evaluateBest, eval5, HAND_NAMES, strengthMeter,
  DEFAULT_PLAYERS_9, DEFAULT_PLAYERS_6, DEFAULT_PLAYERS_2,
  dealHand,
});
