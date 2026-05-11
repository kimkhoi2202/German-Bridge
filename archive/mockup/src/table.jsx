// table.jsx — main poker table screen, top-down + first-person variants
// Globals: React, Card, Chip, ChipStack, Avatar, Icon, fmtChips, evaluateBest,
//          DEFAULT_PLAYERS_9, DEFAULT_PLAYERS_6, DEFAULT_PLAYERS_2, dealHand,
//          HAND_NAMES, strengthMeter
// ---------------------------------------------------------------

// Seat positions around the oval, as % of table dimensions, and bet pos.
// Hero is always at index 0 (bottom-center).
const SEAT_LAYOUTS = {
  2: [
  { x: 50, y: 96, betX: 50, betY: 72 },
  { x: 50, y: 4, betX: 50, betY: 28 }],

  6: [
  { x: 50, y: 96, betX: 50, betY: 72 },
  { x: 92, y: 70, betX: 76, betY: 64 },
  { x: 92, y: 30, betX: 76, betY: 36 },
  { x: 50, y: 4, betX: 50, betY: 28 },
  { x: 8, y: 30, betX: 24, betY: 36 },
  { x: 8, y: 70, betX: 24, betY: 64 }],

  9: [
  { x: 50, y: 98, betX: 50, betY: 76 },
  { x: 80, y: 92, betX: 70, betY: 72 },
  { x: 96, y: 60, betX: 80, betY: 58 },
  { x: 92, y: 18, betX: 76, betY: 32 },
  { x: 68, y: 0, betX: 62, betY: 24 },
  { x: 32, y: 0, betX: 38, betY: 24 },
  { x: 8, y: 18, betX: 24, betY: 32 },
  { x: 4, y: 60, betX: 20, betY: 58 },
  { x: 20, y: 92, betX: 30, betY: 72 }]

};

function TableScreen({ tweaks, seats = 9 }) {
  const [hand, setHand] = React.useState(0);
  const [actingIdx, setActingIdx] = React.useState(2);
  const [pot] = React.useState(2840);
  const [betAmt, setBetAmt] = React.useState(420);
  const [preset, setPreset] = React.useState('pot');
  const [showFP, setShowFP] = React.useState(tweaks.layout === 'fp');
  React.useEffect(() => {setShowFP(tweaks.layout === 'fp');}, [tweaks.layout]);

  // Seat the configured number of players
  const playerSet = seats === 2 ? DEFAULT_PLAYERS_2 :
  seats === 6 ? DEFAULT_PLAYERS_6 :
  DEFAULT_PLAYERS_9;
  const positions = SEAT_LAYOUTS[seats] || SEAT_LAYOUTS[9];

  // Deterministic-ish hand to demo
  const heroHand = ['As', 'Kh'];
  const board = ['Qd', 'Jc', 'Th', '4s', '7d']; // royal flush draw + flop
  const ev = evaluateBest([...heroHand, ...board].map((c) => c));
  const strength = strengthMeter(ev.rank);

  // Per-seat status (folded/acting/bets) — wholly demo
  const seatStates = React.useMemo(() => {
    const arr = playerSet.map((p, i) => ({
      ...p,
      folded: false,
      bet: 0,
      cards: i === 0 ? heroHand : ['XX', 'XX'],
      seatIdx: i
    }));
    if (arr.length >= 6) {
      arr[1] && (arr[1].bet = 200);
      arr[2] && (arr[2].folded = true);
      arr[3] && (arr[3].bet = 600);
      arr[4] && (arr[4].folded = true);
      arr[5] && (arr[5].bet = 600);
    } else if (arr.length === 6) {
      arr[3].bet = 400;
    } else if (arr.length === 2) {
      arr[1].bet = 200;
    }
    arr[0].bet = 200; // hero already in
    return arr;
  }, [playerSet]);

  const minBet = 200;
  const maxBet = seatStates[0].stack;
  const presets = [
  { id: '1/3', label: '⅓ pot', v: Math.round(pot / 3) },
  { id: '1/2', label: '½ pot', v: Math.round(pot / 2) },
  { id: 'pot', label: 'Pot', v: pot },
  { id: 'all', label: 'All-in', v: maxBet }];


  const onPreset = (p) => {setPreset(p.id);setBetAmt(Math.min(maxBet, Math.max(minBet, p.v)));};

  const layout = showFP ? 'fp' : 'top';

  return (
    <div className="table-wrap" data-suits={tweaks.suits || 'two'}>
      {/* HUD top-left */}
      <div className="hand-hud">
        <div className="hud-pill">
          <Icon name="hash" size={12} />
          <span className="label">Hand</span>
          <span className="mono">#41,827</span>
        </div>
        <div className="hud-pill">
          <span className="label">Blinds</span>
          <span className="mono">100 / 200</span>
        </div>
        <div className="hud-pill">
          <span className="label">Stage</span>
          <span style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 14 }}>The River</span>
        </div>
      </div>

      {/* Hand strength HUD (right) */}
      {tweaks.density !== 'compact' &&
      <div className="hand-strength">
          <div className="label">Your hand</div>
          <div className="name">{ev.name}</div>
          <div className="meter"><div style={{ '--strength': `${Math.round(strength * 100)}%` }} /></div>
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            {ev.cards.map((c, i) =>
          <Card key={i} rank={c[0]} suit={c[1]} size={28} />
          )}
          </div>
        </div>
      }

      {layout === 'top' &&
      <TopDownTable
        tweaks={tweaks}
        seats={seats}
        positions={positions}
        seatStates={seatStates}
        actingIdx={actingIdx}
        board={board}
        pot={pot}
        dealerIdx={3} />

      }
      {layout === 'fp' &&
      <FirstPersonTable
        tweaks={tweaks}
        seats={seats}
        seatStates={seatStates}
        actingIdx={actingIdx}
        board={board}
        pot={pot}
        heroHand={heroHand} />

      }

      {/* Action bar — shared between both views */}
      <div className="actionbar">
        <div className="bet-shaper" style={{ '--p': `${(betAmt - minBet) / (maxBet - minBet) * 100}%` }}>
          <div className="preset">
            {presets.map((p) =>
            <button key={p.id} className={preset === p.id ? 'on' : ''} onClick={() => onPreset(p)}>{p.label}</button>
            )}
          </div>
          <input type="range" min={minBet} max={maxBet} step={50}
          value={betAmt}
          onChange={(e) => {setBetAmt(+e.target.value);setPreset(null);}} />
          <div className="amount"><span className="cur">$</span>{fmtChips(betAmt)}</div>
        </div>

        <div className="action-row">
          <button className="action-btn fold">
            <span className="lbl">Fold</span>
            <span className="sub">Throw the hand</span>
          </button>
          <button className="action-btn call">
            <span className="lbl">Call 600</span>
            <span className="sub">to ${fmtChips(600)}</span>
          </button>
          <button className="action-btn raise">
            <span className="lbl">Raise to ${fmtChips(betAmt)}</span>
            <span className="sub">{preset || 'custom'}</span>
          </button>
        </div>
      </div>
    </div>);

}

function TopDownTable({ tweaks, seats, positions, seatStates, actingIdx, board, pot, dealerIdx }) {
  return (
    <div className="table-stage" data-comment-anchor="9cbac6c642-div-185-5">
      <div className="felt-table">
        <div className="table-logo">
          Felt&nbsp;&amp;&nbsp;Brass
          <span className="sub">Est. 2026 · No-Limit Hold'em</span>
        </div>

        {/* Community board */}
        <div className="community">
          {board.map((c, i) =>
          <Card key={i} rank={c[0]} suit={c[1]} size={86} className="deal-in"
          style={{ animationDelay: `${i * 0.06}s` }} />
          )}
        </div>

        {/* Pot tag */}
        <div className="pot-tag">
          <Chip value={500} size={22} />
          <span className="label">Pot</span>
          <span className="amt">${fmtChips(pot)}</span>
        </div>

        {/* Seats */}
        {seatStates.map((p, i) => {
          const pos = positions[i];
          if (!pos) return null;
          return (
            <React.Fragment key={i}>
              <div className="seat" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
                {p.folded || p.hero ? null :
                <div className="hand fan" style={{ marginBottom: -6 }}>
                    <Card faceDown size={32} />
                    <Card faceDown size={32} />
                  </div>
                }
                {p.hero &&
                <div className="hand" style={{ marginBottom: 2 }}>
                    {p.cards.map((c, j) =>
                  <Card key={j} rank={c[0]} suit={c[1]} size={48} />
                  )}
                  </div>
                }
                <div className={[
                'seat-card',
                i === actingIdx ? 'acting' : '',
                p.folded ? 'folded' : '',
                p.hero ? 'hero' : ''].
                filter(Boolean).join(' ')}>
                  <Avatar name={p.name} seed={p.seed} size={36} />
                  <div className="meta">
                    <span className="nm">{p.name}</span>
                    <span className="stk">${fmtChips(p.stack - p.bet)}</span>
                  </div>
                  {i === actingIdx &&
                  <span style={{
                    position: 'absolute', right: -2, top: -2, width: 10, height: 10,
                    borderRadius: '50%', background: 'var(--brass)',
                    boxShadow: '0 0 0 2px var(--rail)'
                  }} className="pulse" />
                  }
                  {dealerIdx === i &&
                  <div className="dealer-button" style={{
                    position: 'absolute', right: -10, bottom: -8
                  }}>D</div>
                  }
                </div>
              </div>
              {p.bet > 0 &&
              <div className="seat-bet" style={{
                left: `${pos.betX}%`, top: `${pos.betY}%`, transform: 'translate(-50%, -50%)'
              }}>
                  <Chip value={p.bet >= 1000 ? 1000 : p.bet >= 500 ? 500 : 100} size={22} />
                  <span>${fmtChips(p.bet)}</span>
                </div>
              }
            </React.Fragment>);

        })}

        {/* Floating emote */}
        <div className="emote" style={{ left: '12%', top: '24%' }}>"nice river"</div>
      </div>
    </div>);

}

function FirstPersonTable({ tweaks, seats, seatStates, actingIdx, board, pot, heroHand }) {
  const opps = seatStates.slice(1);
  return (
    <div className="fp-stage">
      <div className="fp-table" />
      {/* Opponents row across the top */}
      <div className="fp-opponents">
        {opps.slice(0, 6).map((p, i) =>
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            {!p.folded &&
          <div className="hand fan">
                <Card faceDown size={42} />
                <Card faceDown size={42} />
              </div>
          }
            <div className={[
          'seat-card',
          p.folded ? 'folded' : '',
          i + 1 === actingIdx ? 'acting' : ''].
          filter(Boolean).join(' ')} style={{ width: 160 }}>
              <Avatar name={p.name} seed={p.seed} size={32} />
              <div className="meta">
                <span className="nm">{p.name}</span>
                <span className="stk">${fmtChips(p.stack - p.bet)}</span>
              </div>
            </div>
            {p.bet > 0 &&
          <div className="seat-bet" style={{ position: 'static' }}>
                <Chip value={p.bet >= 500 ? 500 : 100} size={20} />
                <span>${fmtChips(p.bet)}</span>
              </div>
          }
          </div>
        )}
      </div>

      {/* Community on the angled felt */}
      <div className="fp-community">
        {board.map((c, i) =>
        <Card key={i} rank={c[0]} suit={c[1]} size={96}
        className="deal-in" style={{ animationDelay: `${i * 0.06}s` }} />
        )}
      </div>

      <div className="fp-pot">
        <div className="pot-tag" style={{ position: 'static' }}>
          <Chip value={500} size={22} />
          <span className="label">Pot</span>
          <span className="amt">${fmtChips(pot)}</span>
        </div>
      </div>

      {/* Hero's hand — large in foreground */}
      <div className="fp-hero-hand">
        {heroHand.map((c, i) =>
        <Card key={i} rank={c[0]} suit={c[1]} size={130} />
        )}
      </div>
    </div>);

}

Object.assign(window, { TableScreen, TopDownTable, FirstPersonTable });