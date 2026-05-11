// german-bridge.jsx — German Bridge (trick-taking) game mode
// Globals: React, Card, Avatar, Icon
// ---------------------------------------------------------------

const GB_RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const GB_SUITS = ['s','h','d','c'];
const GB_SUIT_NAME = { s: 'Spades', h: 'Hearts', d: 'Diamonds', c: 'Clubs' };
const GB_SUIT_CHAR = { s: '♠', h: '♥', d: '♦', c: '♣' };

function gbRankVal(r) { return GB_RANKS.indexOf(r); }
function gbDeck(decks = 1) {
  const out = [];
  for (let d = 0; d < decks; d++) {
    for (const s of GB_SUITS) for (const r of GB_RANKS) out.push({ r, s, d });
  }
  return out;
}
function gbShuffle(deck) {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Maximum tricks per hand given player count and deck count.
// Always reserve 1 card for the trump flip.
function gbMaxTricks(players, decks) {
  return Math.max(0, Math.floor((52 * decks - 1) / players));
}
function gbCardKey(c) { return c.r + c.s + (c.d ?? 0); }
function gbSortHand(hand, trump) {
  // Group by suit, trumps first; high to low within suit
  const order = [trump, ...GB_SUITS.filter(s => s !== trump)];
  return [...hand].sort((a, b) => {
    const sa = order.indexOf(a.s), sb = order.indexOf(b.s);
    if (sa !== sb) return sa - sb;
    return gbRankVal(b.r) - gbRankVal(a.r);
  });
}
function gbResolveTrick(plays, leadSuit, trumpSuit) {
  // Multi-deck rule: on identical card+tier, the LATER play wins.
  // Implemented by using >= when comparing within the same tier.
  let winner = plays[0]; let bestVal = -1; let bestSuitTier = -1;
  for (const p of plays) {
    let tier = -1;
    if (p.card.s === trumpSuit) tier = 2;
    else if (p.card.s === leadSuit) tier = 1;
    if (tier > bestSuitTier ||
        (tier === bestSuitTier && gbRankVal(p.card.r) >= bestVal)) {
      winner = p; bestSuitTier = tier; bestVal = gbRankVal(p.card.r);
    }
  }
  return winner;
}
function gbScore(bid, won) {
  if (bid === won) return 10 + won * won;
  const d = Math.abs(bid - won);
  return -(d * d);
}
function gbLegalCards(hand, leadSuit) {
  if (leadSuit == null) return hand;
  const inSuit = hand.filter(c => c.s === leadSuit);
  return inSuit.length ? inSuit : hand;
}

// Bot decision making ----------------------------------------------------------
function gbBotBid({ hand, trumpSuit, personality, tricksTotal, bidsSoFar, isLast, restricted }) {
  // Estimate winning equity per card.
  const trumps = hand.filter(c => c.s === trumpSuit);
  const offTrumps = hand.filter(c => c.s !== trumpSuit);
  let eq = 0;
  for (const c of trumps) {
    const v = gbRankVal(c.r);
    eq += 0.55 + Math.max(0, (v - 6)) * 0.06;
  }
  for (const c of offTrumps) {
    if (c.r === 'A') eq += 0.55;
    else if (c.r === 'K') eq += 0.30;
    else if (c.r === 'Q') eq += 0.12;
  }
  if (personality === 'aggressive') eq *= 1.20;
  else if (personality === 'cautious') eq *= 0.78;
  let bid = Math.max(0, Math.min(tricksTotal, Math.round(eq)));
  if (isLast && bid === restricted) {
    // Must shift to legal value
    const candidates = [bid - 1, bid + 1, bid - 2, bid + 2, 0, tricksTotal];
    for (const cand of candidates) {
      if (cand >= 0 && cand <= tricksTotal && cand !== restricted) { bid = cand; break; }
    }
  }
  return bid;
}
function gbBotPlay({ hand, currentTrick, leadSuit, trumpSuit, personality, bid, won, tricksLeft }) {
  const legal = gbLegalCards(hand, leadSuit);
  const need = bid - won;
  const sorted = [...legal].sort((a, b) => gbRankVal(a.r) - gbRankVal(b.r));
  const wantWin = need > 0;
  const mustAvoid = bid !== 0 && need <= 0; // overshot or tied while no more wins needed... almost
  if (currentTrick.length === 0) {
    // Lead
    if (wantWin) {
      // Lead high in a non-trump strong suit; or trump to clear
      const offsuit = sorted.filter(c => c.s !== trumpSuit);
      if (offsuit.length) {
        const top = offsuit[offsuit.length - 1];
        if (gbRankVal(top.r) >= gbRankVal('K')) return top;
      }
      return sorted[sorted.length - 1];
    }
    return sorted[0];
  }
  // Otherwise: examine board
  const winSoFar = gbResolveTrick(currentTrick, leadSuit, trumpSuit);
  const winningCard = winSoFar.card;
  const winningTier = winningCard.s === trumpSuit ? 2 : (winningCard.s === leadSuit ? 1 : 0);
  // Cards in legal that beat winning
  const beats = sorted.filter(c => {
    const tier = c.s === trumpSuit ? 2 : (c.s === leadSuit ? 1 : 0);
    if (tier > winningTier) return true;
    if (tier < winningTier) return false;
    return gbRankVal(c.r) > gbRankVal(winningCard.r);
  });
  if (wantWin && beats.length) {
    // Play smallest winner
    return beats[0];
  }
  if (!wantWin) {
    // Don't take it — play highest losing card if possible (dump high cards while you can)
    const losers = sorted.filter(c => !beats.includes(c));
    if (losers.length) return losers[losers.length - 1];
  }
  return sorted[0];
}

// Bot names + flavors -----------------------------------------------------------
const GB_BOT_POOL = [
  { name: 'Margot',   personality: 'cautious'   },
  { name: 'Theodore', personality: 'aggressive' },
  { name: 'Imani',    personality: 'balanced'   },
  { name: 'Kasper',   personality: 'aggressive' },
  { name: 'Vesna',    personality: 'cautious'   },
  { name: 'Reuben',   personality: 'balanced'   },
];

// Round: produce hands, trump, plan
function gbStartRound(players, dealerIdx, decks, tricksTotal) {
  const deck = gbShuffle(gbDeck(decks));
  const hands = players.map(() => []);
  for (let r = 0; r < tricksTotal; r++) {
    for (let p = 0; p < players.length; p++) hands[p].push(deck.pop());
  }
  // Trump from top of remaining deck
  const trumpCard = deck.pop();
  return { hands, trumpCard, tricksTotal, dealerIdx };
}

// =====================================================================
// MAIN COMPONENT
// =====================================================================
// Extended bot pool to support up to 11 bots (+ 1 human = 12 seats max)
const GB_BOT_NAMES = [
  'Margot','Theodore','Imani','Kasper','Vesna','Reuben',
  'Saoirse','Bertram','Ondine','Fabien','Linnea',
];

function GermanBridgeScreen({ tweaks }) {
  // Tweaks ------------------------------------------------------------
  const showTrumpHints = tweaks?.gbTrumpHint !== 'off';
  const cardBack = tweaks?.gbCardBack || 'classic';
  const tableLayout = tweaks?.gbLayout || 'salon'; // 'salon' | 'pad'
  const botMoodGlobal = tweaks?.gbBotMood || 'mixed'; // mixed | aggressive | cautious

  // Lobby form state — 3 knobs ----------------------------------------
  const initPlayers = Math.min(12, Math.max(3, +(tweaks?.gbPlayers || 4)));
  const initDecks = Math.min(99, Math.max(1, +(tweaks?.gbDecks || 1)));
  const initTricks = Math.min(
    gbMaxTricks(initPlayers, initDecks),
    Math.max(1, +(tweaks?.gbTricks || 10))
  );
  const [playerCount, setPlayerCount] = React.useState(initPlayers);
  const [decks, setDecks] = React.useState(initDecks);
  const [tricksPerHand, setTricksPerHand] = React.useState(initTricks);
  const [maxRounds, setMaxRounds] = React.useState(
    Math.min(99, Math.max(1, +(tweaks?.gbRounds || 5)))
  );

  // Per-bot personality overrides (index in players array → personality)
  // null = follow global. Initialized lazily; reset when player count changes.
  const [botOverrides, setBotOverrides] = React.useState(() => Array(11).fill(null));

  // Players (you + bots) — derived from form state
  const players = React.useMemo(() => {
    const me = { id: 'you', name: 'You', isYou: true, personality: 'balanced' };
    const moods = ['cautious','mixed','aggressive'];
    const bots = Array.from({ length: playerCount - 1 }, (_, i) => {
      const ov = botOverrides[i];
      const baseMood = botMoodGlobal === 'mixed'
        ? moods[i % 3]
        : botMoodGlobal;
      return {
        id: 'bot' + i,
        name: GB_BOT_NAMES[i % GB_BOT_NAMES.length],
        isYou: false,
        personality: ov || baseMood,
      };
    });
    return [me, ...bots];
  }, [playerCount, botMoodGlobal, botOverrides]);

  // Game state --------------------------------------------------------
  const [phase, setPhase] = React.useState('lobby'); // lobby | dealing | trump | bidding | playing | round-end | game-end
  const [round, setRound] = React.useState(1);
  const [dealerIdx, setDealerIdx] = React.useState(0);
  const [hands, setHands] = React.useState([]);
  const [trumpCard, setTrumpCard] = React.useState(null);
  const [tricksTotal, setTricksTotal] = React.useState(10);

  const [bids, setBids] = React.useState([]); // index by player
  const [bidTurn, setBidTurn] = React.useState(0);

  const [won, setWon] = React.useState([]); // tricks won this round
  const [trickIdx, setTrickIdx] = React.useState(0);
  const [currentTrick, setCurrentTrick] = React.useState([]); // [{playerIdx, card}]
  const [leadIdx, setLeadIdx] = React.useState(0);
  const [turnIdx, setTurnIdx] = React.useState(0);
  const [trickWinner, setTrickWinner] = React.useState(null);

  const [scoreHistory, setScoreHistory] = React.useState([]); // [[r1...rN], ...] per round
  const [showRules, setShowRules] = React.useState(false);
  const [showBoard, setShowBoard] = React.useState(false);

  const trumpSuit = trumpCard?.s ?? null;
  const leadSuit = currentTrick.length ? currentTrick[0].card.s : null;

  // ------- LOBBY actions ---------------------------------------------
  const startNewGame = () => {
    setRound(1);
    setDealerIdx(0);
    setScoreHistory([]);
    dealRound(0, 1);
  };

  function dealRound(dlr, rnd) {
    const r = gbStartRound(players, dlr, decks, tricksPerHand);
    setHands(r.hands);
    setTrumpCard(r.trumpCard);
    setTricksTotal(r.tricksTotal);
    setBids(Array(players.length).fill(null));
    setWon(Array(players.length).fill(0));
    setTrickIdx(0);
    setCurrentTrick([]);
    setTrickWinner(null);
    const lead = (dlr + 1) % players.length;
    setLeadIdx(lead);
    setTurnIdx((dlr + 1) % players.length);
    setBidTurn((dlr + 1) % players.length);
    setPhase('dealing');
    setTimeout(() => setPhase('trump'), 1100);
    setTimeout(() => setPhase('bidding'), 2200);
  }

  // Bots auto-bid when it's their turn ------------------------------------
  React.useEffect(() => {
    if (phase !== 'bidding') return;
    if (bids[bidTurn] != null) return;
    const p = players[bidTurn];
    if (p.isYou) return;
    const placed = bids.filter(b => b !== null).length;
    const isLast = placed === players.length - 1;
    let restricted = null;
    if (isLast) {
      const sumOthers = bids.reduce((a, b) => a + (b || 0), 0);
      restricted = tricksTotal - sumOthers;
      if (restricted < 0) restricted = null;
    }
    const t = setTimeout(() => {
      const bid = gbBotBid({
        hand: hands[bidTurn],
        trumpSuit,
        personality: p.personality,
        tricksTotal,
        bidsSoFar: bids,
        isLast,
        restricted
      });
      placeBid(bidTurn, bid);
    }, 700 + Math.random() * 400);
    return () => clearTimeout(t);
  }, [phase, bidTurn, bids, hands, trumpSuit, tricksTotal, players]);

  function placeBid(pIdx, bid) {
    const next = [...bids]; next[pIdx] = bid; setBids(next);
    const placed = next.filter(b => b !== null).length;
    if (placed === players.length) {
      setPhase('playing');
      setTurnIdx(leadIdx);
    } else {
      setBidTurn((pIdx + 1) % players.length);
    }
  }

  // Bots auto-play when it's their turn -----------------------------------
  React.useEffect(() => {
    if (phase !== 'playing') return;
    if (trickWinner !== null) return;
    if (currentTrick.length === players.length) return;
    const p = players[turnIdx];
    if (p.isYou) return;
    const t = setTimeout(() => {
      const card = gbBotPlay({
        hand: hands[turnIdx],
        currentTrick,
        leadSuit,
        trumpSuit,
        personality: p.personality,
        bid: bids[turnIdx],
        won: won[turnIdx],
        tricksLeft: tricksTotal - trickIdx
      });
      playCard(turnIdx, card);
    }, 800 + Math.random() * 350);
    return () => clearTimeout(t);
  }, [phase, turnIdx, currentTrick, hands, players, bids, won, leadSuit, trumpSuit, trickWinner, tricksTotal, trickIdx]);

  function playCard(pIdx, card) {
    // Remove from hand
    const newHands = hands.map((h, i) => i === pIdx ? h.filter(c => gbCardKey(c) !== gbCardKey(card)) : h);
    setHands(newHands);
    const trick = [...currentTrick, { playerIdx: pIdx, card }];
    setCurrentTrick(trick);
    if (trick.length === players.length) {
      // Resolve
      const winner = gbResolveTrick(trick, trick[0].card.s, trumpSuit);
      setTrickWinner(winner.playerIdx);
      setTimeout(() => {
        const newWon = [...won]; newWon[winner.playerIdx] = (newWon[winner.playerIdx] || 0) + 1; setWon(newWon);
        if (trickIdx + 1 >= tricksTotal) {
          // Round over
          finalizeRound(newWon);
        } else {
          setTrickIdx(trickIdx + 1);
          setCurrentTrick([]);
          setTrickWinner(null);
          setLeadIdx(winner.playerIdx);
          setTurnIdx(winner.playerIdx);
        }
      }, 1300);
    } else {
      setTurnIdx((pIdx + 1) % players.length);
    }
  }

  function finalizeRound(wonArr) {
    const roundScores = bids.map((b, i) => gbScore(b, wonArr[i]));
    const newHist = [...scoreHistory, { round, dealer: dealerIdx, trump: trumpCard, bids: [...bids], won: [...wonArr], scores: roundScores }];
    setScoreHistory(newHist);
    setPhase('round-end');
  }

  function nextRound() {
    if (round >= maxRounds) {
      setPhase('game-end');
      return;
    }
    const dlr = (dealerIdx + 1) % players.length;
    setDealerIdx(dlr);
    setRound(round + 1);
    dealRound(dlr, round + 1);
  }

  // Cumulative scores
  const cumulative = players.map((_, i) =>
    scoreHistory.reduce((a, h) => a + (h.scores[i] || 0), 0)
  );

  // Restriction calc for human bid screen
  const yourTurnToBid = phase === 'bidding' && players[bidTurn]?.isYou;
  const placedCount = bids.filter(b => b !== null).length;
  const youAreLastBidder = yourTurnToBid && placedCount === players.length - 1;
  const youRestrictedBid = youAreLastBidder ? Math.max(-1, tricksTotal - bids.reduce((a, b) => a + (b || 0), 0)) : null;

  // Render --------------------------------------------------------------
  return (
    <div className={"gb-root " + (tableLayout === 'pad' ? 'gb-pad' : 'gb-salon')}>
      {phase === 'lobby' && <GBLobby
        players={players}
        playerCount={playerCount}
        setPlayerCount={(v) => {
          const next = Math.min(12, Math.max(3, v));
          setPlayerCount(next);
          // Re-clamp tricks if needed
          const max = gbMaxTricks(next, decks);
          if (tricksPerHand > max) setTricksPerHand(Math.max(1, max));
        }}
        decks={decks}
        setDecks={(v) => {
          const next = Math.min(99, Math.max(1, v));
          setDecks(next);
          const max = gbMaxTricks(playerCount, next);
          if (tricksPerHand > max) setTricksPerHand(Math.max(1, max));
        }}
        tricksPerHand={tricksPerHand}
        setTricksPerHand={(v) => {
          const max = gbMaxTricks(playerCount, decks);
          setTricksPerHand(Math.min(max, Math.max(1, v)));
        }}
        maxRounds={maxRounds}
        setMaxRounds={(v) => setMaxRounds(Math.min(99, Math.max(1, v)))}
        botOverrides={botOverrides}
        setBotOverrides={setBotOverrides}
        botMoodGlobal={botMoodGlobal}
        onStart={startNewGame}
        onShowRules={() => setShowRules(true)}
      />}

      {phase !== 'lobby' && (
        <GBTable
          phase={phase}
          players={players}
          hands={hands}
          trumpCard={trumpCard}
          trumpSuit={trumpSuit}
          tricksTotal={tricksTotal}
          dealerIdx={dealerIdx}
          bids={bids}
          bidTurn={bidTurn}
          won={won}
          currentTrick={currentTrick}
          leadIdx={leadIdx}
          turnIdx={turnIdx}
          trickIdx={trickIdx}
          trickWinner={trickWinner}
          round={round}
          maxRounds={maxRounds}
          cumulative={cumulative}
          yourTurnToBid={yourTurnToBid}
          youRestrictedBid={youRestrictedBid}
          tableLayout={tableLayout}
          showTrumpHints={showTrumpHints}
          cardBack={cardBack}
          onPlaceBid={placeBid}
          onPlayCard={playCard}
          onNextRound={nextRound}
          onShowBoard={() => setShowBoard(true)}
          onShowRules={() => setShowRules(true)}
        />
      )}

      {showRules && <GBRulesModal onClose={() => setShowRules(false)} />}
      {showBoard && <GBScoreBoardModal
        players={players}
        history={scoreHistory}
        cumulative={cumulative}
        onClose={() => setShowBoard(false)}
      />}

      {phase === 'round-end' && (
        <GBRoundSummary
          players={players}
          bids={bids}
          won={won}
          trumpCard={trumpCard}
          round={round}
          maxRounds={maxRounds}
          cumulative={cumulative}
          history={scoreHistory}
          onNext={nextRound}
        />
      )}

      {phase === 'game-end' && (
        <GBGameEnd
          players={players}
          cumulative={cumulative}
          history={scoreHistory}
          onAgain={() => { setPhase('lobby'); }}
        />
      )}
    </div>
  );
}

// =====================================================================
// LOBBY
// =====================================================================
function GBNumberKnob({ label, value, set, min, max, suffix, hint, onTooLow }) {
  const dec = () => set(value - 1);
  const inc = () => set(value + 1);
  const atMax = value >= max;
  const atMin = value <= min;
  return (
    <div className="gb-knob">
      <div className="gb-knob-label">
        <span className="eyebrow">{label}</span>
        {hint && <span className="gb-knob-hint">{hint}</span>}
      </div>
      <div className="gb-knob-control">
        <button className="gb-knob-btn" onClick={dec} disabled={atMin} aria-label={`Decrease ${label}`}>−</button>
        <input
          type="number"
          className="gb-knob-input mono"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (Number.isFinite(v)) set(v);
          }}
        />
        {suffix && <span className="gb-knob-suffix">{suffix}</span>}
        <button className="gb-knob-btn" onClick={inc} disabled={atMax} aria-label={`Increase ${label}`}>+</button>
      </div>
      <div className="gb-knob-range mono">
        {min}–{max}{onTooLow && value < onTooLow ? ` · min for play: ${onTooLow}` : ''}
      </div>
    </div>
  );
}

function GBLobby({
  players, playerCount, setPlayerCount,
  decks, setDecks,
  tricksPerHand, setTricksPerHand,
  maxRounds, setMaxRounds,
  botOverrides, setBotOverrides, botMoodGlobal,
  onStart, onShowRules,
}) {
  const maxTricks = gbMaxTricks(playerCount, decks);
  const tricksValid = maxTricks >= 1 && tricksPerHand >= 1 && tricksPerHand <= maxTricks;
  const totalCards = 52 * decks;
  const usedCards = playerCount * tricksPerHand + 1; // +1 for trump flip
  const setBotPersonality = (idx, personality) => {
    const next = [...botOverrides];
    next[idx] = personality;
    setBotOverrides(next);
  };

  return (
    <div className="gb-lobby fade-in">
      <div className="gb-lobby-card">
        <div className="eyebrow">Felt &amp; Brass · Card Room</div>
        <h1 className="display gb-lobby-h1">German Bridge<span style={{ color: 'var(--brass)' }}>.</span></h1>
        <p className="gb-lobby-sub">
          Bid the tricks you'll take. No more, no less. Win clean, score handsomely;
          miss by a hair, lose squared.
        </p>

        {/* THE THREE KNOBS — all visible at once */}
        <div className="gb-knob-row">
          <GBNumberKnob
            label="Players"
            value={playerCount}
            set={setPlayerCount}
            min={3}
            max={12}
            suffix="seats"
          />
          <GBNumberKnob
            label="Decks"
            value={decks}
            set={setDecks}
            min={1}
            max={99}
            suffix={`× 52 = ${totalCards} cards`}
          />
          <GBNumberKnob
            label="Tricks per hand"
            value={tricksPerHand}
            set={setTricksPerHand}
            min={1}
            max={Math.max(1, maxTricks)}
            suffix={`max ${maxTricks}`}
            hint={maxTricks < 1 ? 'Add a deck or fewer players' : null}
          />
        </div>

        {/* Validation strip */}
        <div className={"gb-lobby-validate" + (tricksValid ? '' : ' bad')}>
          <span className="mono">
            {playerCount} × {tricksPerHand} + 1 trump = {usedCards} / {totalCards} cards
          </span>
          {!tricksValid && (
            <span className="gb-bad">
              {maxTricks < 1
                ? "This config can't deal a single trick — increase decks or reduce players."
                : `Tricks per hand must be 1–${maxTricks}.`}
            </span>
          )}
        </div>

        <div className="gb-lobby-grid">
          <div className="gb-lobby-block">
            <div className="eyebrow">Tonight's seating · personality</div>
            <div className="gb-seat-row">
              {players.map((p, i) => (
                <div key={p.id} className={"gb-seat-tile" + (p.isYou ? ' you' : '')}>
                  <Avatar name={p.name} seed={i} size={42} />
                  <div className="gb-seat-name">{p.name}</div>
                  {p.isYou ? (
                    <div className="gb-seat-meta">You</div>
                  ) : (
                    <select
                      className="gb-bot-pers mono"
                      value={botOverrides[i - 1] || ''}
                      onChange={(e) => setBotPersonality(i - 1, e.target.value || null)}
                      title="Personality (override global)"
                    >
                      <option value="">{`auto · ${p.personality}`}</option>
                      <option value="cautious">cautious</option>
                      <option value="mixed">mixed</option>
                      <option value="aggressive">aggressive</option>
                    </select>
                  )}
                </div>
              ))}
            </div>
            <p className="gb-hint">
              Each seat shows its current personality. The Tweaks panel sets the global default;
              choose a value here to override it for that bot.
            </p>
          </div>

          <div className="gb-lobby-block">
            <div className="eyebrow">Rounds in this match</div>
            <GBNumberKnob
              label=""
              value={maxRounds}
              set={setMaxRounds}
              min={1}
              max={99}
              suffix="rounds"
            />
            <p className="gb-hint">
              Dealer rotates each round. Highest cumulative score wins. Negatives count.
            </p>
          </div>
        </div>

        <div className="gb-lobby-actions">
          <button
            className="btn brass"
            onClick={onStart}
            disabled={!tricksValid}
            title={!tricksValid ? 'Adjust the knobs above first' : ''}
          >
            Deal first hand <Icon name="chevR" size={14} />
          </button>
          <button className="btn ghost" onClick={onShowRules}>How it's played</button>
        </div>

        <div className="gb-lobby-formula">
          <div className="gb-form-row">
            <div className="gb-form-side">
              <span className="gb-form-tag good">If you make your bid</span>
              <span className="gb-form-eq">10 + (tricks won)<sup>2</sup></span>
              <span className="gb-form-ex">bid 3, take 3 → <b>+19</b></span>
            </div>
            <div className="gb-form-side">
              <span className="gb-form-tag bad">If you miss</span>
              <span className="gb-form-eq">−(|bid − won|)<sup>2</sup></span>
              <span className="gb-form-ex">bid 4, take 2 → <b>−4</b></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// TABLE — both layouts share a positioning ring
// =====================================================================
function seatPos(i, n) {
  // Hero (i=0) at bottom; remaining around an oval
  const angle = (Math.PI * 2 * i / n) + Math.PI / 2; // start at bottom
  const rx = 0.46, ry = 0.40;
  return {
    x: 50 + Math.cos(angle) * rx * 100,
    y: 50 + Math.sin(angle) * ry * 100
  };
}

function GBTable(props) {
  const {
    phase, players, hands, trumpCard, trumpSuit, tricksTotal, dealerIdx,
    bids, bidTurn, won, currentTrick, leadIdx, turnIdx, trickIdx, trickWinner,
    round, maxRounds, cumulative, yourTurnToBid, youRestrictedBid,
    tableLayout, showTrumpHints, cardBack,
    onPlaceBid, onPlayCard, onNextRound, onShowBoard, onShowRules
  } = props;

  const youHand = hands[0] || [];
  const sortedYou = trumpSuit ? gbSortHand(youHand, trumpSuit) : youHand;
  const myLegal = phase === 'playing' ? gbLegalCards(youHand, currentTrick.length ? currentTrick[0].card.s : null) : [];
  const myLegalKeys = new Set(myLegal.map(gbCardKey));

  const legalLeadSuit = currentTrick.length ? currentTrick[0].card.s : null;

  return (
    <div className={"gb-table-wrap layout-" + tableLayout} data-cardback={cardBack}>
      {/* TOP BAR / HUD ------------------------------------------------- */}
      <div className="gb-hud">
        <div className="gb-hud-pill">
          <span className="lbl">Round</span>
          <span className="mono">{round}/{maxRounds}</span>
        </div>
        <div className="gb-hud-pill">
          <span className="lbl">Tricks</span>
          <span className="mono">{trickIdx}/{tricksTotal}</span>
        </div>
        <div className="gb-hud-pill gb-trump-pill">
          <span className="lbl">Trump</span>
          {trumpCard ? (
            <span className={"gb-trump-glyph " + (trumpSuit === 'h' || trumpSuit === 'd' ? 'red' : 'black')}>
              {GB_SUIT_CHAR[trumpSuit]}
            </span>
          ) : <span className="mono">—</span>}
          {trumpCard && <span className="mono">{trumpCard.r}</span>}
        </div>
        <div className="gb-hud-spacer" />
        <button className="gb-hud-btn" onClick={onShowBoard} title="Scorebook">
          <Icon name="book" size={14} /> <span>Scorebook</span>
        </button>
        <button className="gb-hud-btn" onClick={onShowRules} title="Rules">
          <Icon name="hash" size={14} /> <span>Rules</span>
        </button>
      </div>

      {/* TABLE STAGE -------------------------------------------------- */}
      <div className="gb-stage">
        <div className="gb-felt">
          {/* center trick well */}
          <div className="gb-trick-well">
            {phase === 'dealing' && <div className="gb-deal-msg">Dealing…</div>}
            {phase === 'trump' && trumpCard && (
              <div className="gb-trump-reveal">
                <div className="eyebrow">Trump for the round</div>
                <Card rank={trumpCard.r} suit={trumpCard.s} size={92} />
                <div className="gb-trump-name">{GB_SUIT_NAME[trumpSuit]}</div>
              </div>
            )}
            {(phase === 'bidding' || phase === 'playing') && (
              <div className="gb-center-meta">
                {phase === 'bidding' && (
                  <>
                    <div className="eyebrow">Bidding</div>
                    <div className="gb-bid-tally">
                      <div><b>{bids.filter(b => b != null).reduce((a,b) => a + b, 0)}</b><span> bid so far</span></div>
                      <div><b>{tricksTotal}</b><span> available</span></div>
                    </div>
                    {trumpCard && (
                      <div className="gb-mini-trump">
                        <Card rank={trumpCard.r} suit={trumpCard.s} size={42} />
                        <span>trump</span>
                      </div>
                    )}
                  </>
                )}
                {phase === 'playing' && (
                  <div className="gb-played-fan">
                    {currentTrick.map((p, i) => {
                      const pos = seatPos(p.playerIdx, players.length);
                      // direction toward seat
                      const dx = (pos.x - 50) * 0.10;
                      const dy = (pos.y - 50) * 0.10;
                      const rot = ((p.playerIdx / players.length) * 360 + 180) % 360;
                      return (
                        <div key={p.playerIdx} className={"gb-trick-card" + (trickWinner === p.playerIdx ? ' winner' : '')}
                             style={{ transform: `translate(${dx*4}px, ${dy*4}px) rotate(${(p.playerIdx % 2 ? 6 : -6)}deg)` }}>
                          <Card rank={p.card.r} suit={p.card.s} size={64} />
                          <div className="gb-trick-name">{players[p.playerIdx].name.split(' ')[0]}</div>
                        </div>
                      );
                    })}
                    {currentTrick.length === 0 && <div className="gb-deal-msg">{players[turnIdx]?.name} leads</div>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Seats around the felt */}
          {players.map((p, i) => {
            if (i === 0) return null; // hero rendered below
            const pos = seatPos(i, players.length);
            const isActing = (phase === 'bidding' && bidTurn === i) || (phase === 'playing' && turnIdx === i && trickWinner === null);
            const isDealer = dealerIdx === i;
            return (
              <div key={p.id} className={"gb-seat" + (isActing ? ' acting' : '')} style={{ left: pos.x + '%', top: pos.y + '%' }}>
                <div className="gb-seat-cards">
                  {(hands[i] || []).slice(0, 5).map((_, j) => (
                    <div key={j} className={"gb-mini-back " + (cardBack === 'classic' ? 'back-classic' : cardBack === 'lattice' ? 'back-lattice' : 'back-brass')}
                         style={{ marginLeft: j === 0 ? 0 : -10, transform: `translateY(${Math.abs(j - 2) * 1.5}px) rotate(${(j - 2) * 4}deg)` }}/>
                  ))}
                  {(hands[i] || []).length > 5 && <div className="gb-card-count">×{(hands[i] || []).length}</div>}
                </div>
                <div className="gb-seat-id">
                  <Avatar name={p.name} seed={i} size={36} />
                  <div className="gb-seat-info">
                    <div className="gb-seat-name">{p.name}</div>
                    <div className="gb-seat-meta">
                      {bids[i] != null
                        ? <>bid <b>{bids[i]}</b> · won <b>{won[i] || 0}</b></>
                        : (phase === 'bidding' ? <i>thinking…</i> : <i>—</i>)}
                    </div>
                  </div>
                  {isDealer && <div className="gb-dealer-chip" title="Dealer">D</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* HERO HAND (bottom) */}
        <div className="gb-hero">
          <div className="gb-hero-meta">
            <Avatar name="You" seed={0} size={36} />
            <div>
              <div className="gb-seat-name" style={{ color: 'var(--cream)' }}>You</div>
              <div className="gb-seat-meta gb-meta-cream">
                {bids[0] != null
                  ? <>bid <b>{bids[0]}</b> · won <b>{won[0] || 0}</b></>
                  : <i>place your bid</i>}
              </div>
            </div>
            {dealerIdx === 0 && <div className="gb-dealer-chip">D</div>}
          </div>

          <div className="gb-hero-hand">
            {sortedYou.map((c, i) => {
              const isLegal = phase !== 'playing' || myLegalKeys.has(gbCardKey(c));
              const isTrump = c.s === trumpSuit && showTrumpHints;
              return (
                <button
                  key={gbCardKey(c)}
                  className={"gb-hero-card" + (isLegal ? '' : ' disabled') + (isTrump ? ' trump' : '')}
                  style={{ animationDelay: `${i * 30}ms` }}
                  disabled={phase !== 'playing' || turnIdx !== 0 || trickWinner !== null || !isLegal}
                  onClick={() => onPlayCard(0, c)}
                >
                  <Card rank={c.r} suit={c.s} size={72} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* BIDDING DIAL ------------------------------------------------- */}
      {yourTurnToBid && (
        <GBBidDial
          tricksTotal={tricksTotal}
          restricted={youRestrictedBid}
          hint={hands[0] ? scoreHint(hands[0], trumpSuit) : null}
          onPlace={(v) => onPlaceBid(0, v)}
        />
      )}

      {/* TRICK BANNER ------------------------------------------------- */}
      {trickWinner !== null && (
        <div className="gb-trick-banner">
          <span>Trick to</span>
          <b>{players[trickWinner].name}</b>
        </div>
      )}
    </div>
  );
}

function scoreHint(hand, trump) {
  if (!trump) return null;
  let strong = 0;
  for (const c of hand) {
    if (c.s === trump) strong += 1;
    else if (c.r === 'A') strong += 1;
    else if (c.r === 'K') strong += 0.5;
  }
  return Math.round(strong);
}

// =====================================================================
// BID DIAL — modal-ish bottom panel
// =====================================================================
function GBBidDial({ tricksTotal, restricted, hint, onPlace }) {
  const [v, setV] = React.useState(Math.min(hint || 1, tricksTotal));
  const opts = Array.from({ length: tricksTotal + 1 }, (_, i) => i);
  return (
    <div className="gb-bid-overlay">
      <div className="gb-bid-card">
        <div className="eyebrow">Your bid</div>
        <div className="gb-bid-headline display">How many tricks?</div>
        <p className="gb-bid-sub">
          You'll score <b>10 + n²</b> if you take <b>exactly</b> what you bid.
          Miss by <b>d</b> tricks and you lose <b>d²</b>.
        </p>

        <div className="gb-bid-numbers">
          {opts.map(n => {
            const isRestricted = restricted === n;
            const isOn = v === n;
            return (
              <button
                key={n}
                className={"gb-bid-num" + (isOn ? ' on' : '') + (isRestricted ? ' restricted' : '')}
                onClick={() => !isRestricted && setV(n)}
                disabled={isRestricted}
                title={isRestricted ? "Last bidder can't make totals match" : ''}
              >
                {n}
              </button>
            );
          })}
        </div>

        <div className="gb-bid-foot">
          <div className="gb-bid-equity">
            {hint != null && <span>House read: <b>{hint}</b> tricks of equity in your hand.</span>}
            {restricted != null && restricted >= 0 && <span className="gb-bid-warn">Locked out of <b>{restricted}</b> — totals can't equal {tricksTotal}.</span>}
          </div>
          <button className="btn brass" onClick={() => onPlace(v)}>
            Place bid · {v} <Icon name="chevR" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// ROUND SUMMARY
// =====================================================================
function GBRoundSummary({ players, bids, won, trumpCard, round, maxRounds, cumulative, history, onNext }) {
  const last = history[history.length - 1];
  if (!last) return null;
  return (
    <div className="gb-modal-scrim">
      <div className="gb-summary-card">
        <div className="gb-summary-head">
          <div>
            <div className="eyebrow">Round {round} · settled</div>
            <h2 className="display gb-summary-h">The book closes.</h2>
          </div>
          <div className="gb-summary-trump">
            <Card rank={trumpCard.r} suit={trumpCard.s} size={66} />
            <div className="eyebrow">Trump</div>
          </div>
        </div>

        <div className="gb-summary-rows">
          {players.map((p, i) => {
            const made = bids[i] === won[i];
            const score = last.scores[i];
            return (
              <div key={p.id} className={"gb-summary-row" + (made ? ' made' : ' missed')}>
                <Avatar name={p.name} seed={i} size={32} />
                <div className="gb-sum-name">{p.name}</div>
                <div className="gb-sum-bid">bid <b>{bids[i]}</b></div>
                <div className="gb-sum-won">took <b>{won[i] || 0}</b></div>
                <div className="gb-sum-formula mono">
                  {made ? `10 + ${won[i]}² = ${score >= 0 ? '+' : ''}${score}` : `−${Math.abs(bids[i] - (won[i]||0))}² = ${score}`}
                </div>
                <div className={"gb-sum-delta " + (score >= 0 ? 'pos' : 'neg')}>{score >= 0 ? '+' : ''}{score}</div>
                <div className="gb-sum-cum mono">→ {cumulative[i]}</div>
              </div>
            );
          })}
        </div>

        <div className="gb-summary-foot">
          <div className="gb-progress">
            <span>Round {round} of {maxRounds}</span>
            <div className="gb-progress-bar"><div style={{ width: `${(round / maxRounds) * 100}%` }} /></div>
          </div>
          <button className="btn brass" onClick={onNext}>
            {round >= maxRounds ? 'See final' : 'Next round'} <Icon name="chevR" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// GAME END
// =====================================================================
function GBGameEnd({ players, cumulative, history, onAgain }) {
  const ranked = players.map((p, i) => ({ ...p, idx: i, score: cumulative[i] }))
                        .sort((a, b) => b.score - a.score);
  const winner = ranked[0];

  return (
    <div className="gb-modal-scrim">
      <div className="gb-end-card">
        <div className="eyebrow">Final book</div>
        <h2 className="display gb-end-h">{winner.name} take{winner.isYou ? ' ' : 's '}the night.</h2>
        <p className="gb-end-sub">After {history.length} rounds.</p>

        <div className="gb-podium">
          {ranked.slice(0, 3).map((p, rank) => (
            <div key={p.id} className={"gb-podium-step rank-" + rank}>
              <Avatar name={p.name} seed={p.idx} size={56} />
              <div className="gb-podium-name">{p.name}</div>
              <div className="gb-podium-score mono">{p.score}</div>
              <div className="gb-podium-rank">{['1st','2nd','3rd'][rank]}</div>
            </div>
          ))}
        </div>

        <GBTallyTable players={players} history={history} cumulative={cumulative} />

        <div className="gb-end-foot">
          <button className="btn brass" onClick={onAgain}>Another night</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// SCOREBOARD MODAL — hand-tally style on cream paper
// =====================================================================
function GBScoreBoardModal({ players, history, cumulative, onClose }) {
  return (
    <div className="gb-modal-scrim" onClick={onClose}>
      <div className="gb-board-card" onClick={e => e.stopPropagation()}>
        <div className="gb-board-head">
          <div>
            <div className="eyebrow">Felt &amp; Brass · The Scorebook</div>
            <h2 className="display gb-board-h">Tonight's reckoning</h2>
          </div>
          <button className="gb-icon-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <GBTallyTable players={players} history={history} cumulative={cumulative} />
        {history.length === 0 && <div className="gb-empty">Nothing on the page yet.</div>}
      </div>
    </div>
  );
}

// Tally table — handwritten cream paper with grouped tally marks (5-bar gates).
function GBTallyTable({ players, history, cumulative }) {
  return (
    <div className="gb-tally">
      <div className="gb-tally-paper">
        <div className="gb-tally-head">
          <div className="gb-tally-cell head player">Player</div>
          {history.map((h, i) => (
            <div key={i} className="gb-tally-cell head round">
              <span className="r-num">R{h.round}</span>
              <span className={"r-trump " + (h.trump.s === 'h' || h.trump.s === 'd' ? 'red' : '')}>{GB_SUIT_CHAR[h.trump.s]}</span>
            </div>
          ))}
          <div className="gb-tally-cell head total">Total</div>
        </div>

        {players.map((p, i) => (
          <div key={p.id} className={"gb-tally-row" + (p.isYou ? ' you' : '')}>
            <div className="gb-tally-cell name">
              <span className="gb-name-strong">{p.name}</span>
            </div>
            {history.map((h, j) => {
              const s = h.scores[i];
              const made = h.bids[i] === h.won[i];
              return (
                <div key={j} className={"gb-tally-cell entry " + (made ? 'made' : 'missed')}>
                  <span className="bid-pair mono">{h.bids[i]}/{h.won[i]}</span>
                  <span className={"score " + (s >= 0 ? 'pos' : 'neg')}>{s >= 0 ? '+' : ''}{s}</span>
                </div>
              );
            })}
            <div className="gb-tally-cell total">
              <Tally n={cumulative[i]} />
              <span className="gb-tally-num mono">{cumulative[i]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Render N as grouped tally marks (5-bar gates). Negatives shown as red dots.
function Tally({ n }) {
  const v = Math.max(0, n);
  const fives = Math.floor(v / 5);
  const ones = v % 5;
  const groups = [];
  for (let i = 0; i < fives; i++) groups.push(5);
  if (ones > 0) groups.push(ones);
  return (
    <span className="gb-tally-marks">
      {groups.map((g, idx) => (
        <span key={idx} className="gb-tally-group">
          {Array.from({ length: Math.min(g, 4) }).map((_, k) => <span key={k} className="t-mark" />)}
          {g === 5 && <span className="t-cross" />}
        </span>
      ))}
      {n < 0 && <span className="t-neg">−{Math.abs(n)}</span>}
    </span>
  );
}

// =====================================================================
// RULES MODAL
// =====================================================================
function GBRulesModal({ onClose }) {
  return (
    <div className="gb-modal-scrim" onClick={onClose}>
      <div className="gb-rules-card" onClick={e => e.stopPropagation()}>
        <div className="gb-rules-head">
          <div className="eyebrow">House rules</div>
          <h2 className="display gb-rules-h">German Bridge, in short.</h2>
          <button className="gb-icon-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="gb-rules-grid">
          <div>
            <div className="eyebrow">The deal</div>
            <p>3–5 players: 10 cards each. 6 players: 8. 7 players: 7. The next card off the deck flips face-up — its suit is the trump for the round.</p>
          </div>
          <div>
            <div className="eyebrow">The bid</div>
            <p>Each player declares the exact number of tricks they intend to take. Zero is allowed; passing is not. The last bidder cannot pick a number that makes totals add to the trick count — someone must be set to fail.</p>
          </div>
          <div>
            <div className="eyebrow">The play</div>
            <p>Lead any suit. Others must follow if able; if not, anything goes. Highest trump wins; otherwise highest of the lead suit. The taker leads next.</p>
          </div>
          <div>
            <div className="eyebrow">The score</div>
            <div className="gb-rules-score">
              <div className="gb-rules-eq good">
                <span className="lbl">Made</span>
                <span className="eq mono">10 + n²</span>
                <span className="ex">bid 3, take 3 → +19</span>
              </div>
              <div className="gb-rules-eq bad">
                <span className="lbl">Missed</span>
                <span className="eq mono">−d²</span>
                <span className="ex">bid 4, take 2 → −4</span>
              </div>
            </div>
          </div>
        </div>

        <div className="gb-rules-foot">
          <button className="btn brass" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  GermanBridgeScreen,
  GB_SUIT_CHAR, GB_SUIT_NAME,
});
