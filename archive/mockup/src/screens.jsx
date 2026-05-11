// screens.jsx — Lobby, Profile, History, Tournaments, Onboarding, Cashier, Settings
// Globals: React, Card, Chip, ChipStack, Avatar, Icon, fmtChips, CHIP_DENOMS
// ---------------------------------------------------------------

function Lobby({ onJoin }) {
  const tables = [
    { name: 'The Vault',     variant: "No-Limit Hold'em", stakes: '5 / 10', seats: 9, filled: 7, tag: 'Recommended', featured: true },
    { name: 'Bourbon Room',  variant: "PLO 4-card",       stakes: '2 / 5',  seats: 6, filled: 4, tag: 'New' },
    { name: 'Brass Heads-Up', variant: "Hold'em HU",      stakes: '25 / 50', seats: 2, filled: 1, tag: 'High Roller' },
    { name: 'Velvet 6-max',  variant: "No-Limit Hold'em", stakes: '1 / 2',  seats: 6, filled: 5, tag: 'Casual' },
    { name: '7-Card Lounge', variant: 'Stud',             stakes: '5 / 10', seats: 8, filled: 3, tag: 'Classic' },
    { name: 'Five Card Draw', variant: 'Draw',            stakes: '0.50 / 1', seats: 6, filled: 6, tag: 'Vintage' },
    { name: 'Penthouse',     variant: "No-Limit Hold'em", stakes: '50 / 100', seats: 9, filled: 2, tag: 'Nosebleed' },
    { name: 'Pass-and-Play', variant: 'Local',            stakes: 'Play money', seats: 4, filled: 1, tag: 'Same device' },
  ];

  const tournaments = [
    { name: 'Sunday Million', buy: 109, prize: 1_000_000, entrants: 8421, starts: '17:00 EST', state: 'Late reg' },
    { name: 'Daily Bullet',   buy: 22,  prize: 50_000,    entrants: 1240, starts: '21:00 EST', state: 'Open' },
    { name: 'Brass Heads-Up Bracket', buy: 500, prize: 80_000, entrants: 64, starts: 'Tomorrow', state: 'Registering' },
  ];

  return (
    <div className="fade-in" style={{ padding: 24 }}>
      {/* Hero strip */}
      <div className="panel" style={{
        background: 'linear-gradient(160deg, var(--rail), var(--rail-edge))',
        color: 'var(--cream)',
        border: 0,
        padding: 32,
        marginBottom: 22,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0,
          background: 'radial-gradient(70% 60% at 90% 30%, color-mix(in oklch, var(--brass) 30%, transparent), transparent 60%)',
          pointerEvents: 'none' }} />
        <div className="eyebrow" style={{ color: 'var(--brass)', opacity: 1 }}>Tonight at the Vault</div>
        <h1 className="display" style={{ fontSize: 64, marginTop: 8, color: 'var(--cream)' }}>
          A pot worth its name<span style={{ color: 'var(--brass)' }}>.</span>
        </h1>
        <p style={{ maxWidth: 460, opacity: 0.7, marginTop: 8, lineHeight: 1.55 }}>
          Live tables open across nine variants. Sit down with friends, the house, or the world.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button className="btn brass" onClick={onJoin}>Take a seat <Icon name="chevR" size={14} /></button>
          <button className="btn" style={{ background: 'transparent', color: 'var(--cream)', borderColor: 'rgba(255,255,255,.18)' }}>
            Watch a hand
          </button>
        </div>
        {/* Floating cards composition */}
        <div style={{ position: 'absolute', right: 32, top: 32, display: 'flex' }}>
          <Card rank="A" suit="s" size={84} style={{ transform: 'rotate(-12deg) translate(0,8px)' }} />
          <Card rank="A" suit="h" size={84} style={{ transform: 'rotate(8deg) translate(-30px,-8px)' }} />
          <Card rank="K" suit="d" size={84} style={{ transform: 'rotate(-3deg) translate(-60px,12px)' }} />
        </div>
      </div>

      {/* Cash games */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 className="display" style={{ fontSize: 28 }}>Cash games</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {['All','Hold\'em','Omaha','Stud','Draw','Heads-Up'].map((f, i) => (
            <button key={f} className="btn ghost" style={{ padding: '6px 12px', fontSize: 12.5,
              background: i === 0 ? 'var(--ink)' : 'transparent', color: i === 0 ? 'var(--paper)' : 'var(--ink)' }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="tiles">
        {tables.map((t, i) => (
          <div key={i} className={t.featured ? 'tile featured' : 'tile'} onClick={onJoin}>
            <div className="tile-tag">{t.tag}</div>
            <div className="tile-title">{t.name}</div>
            <div className="tile-meta">
              <span><b>{t.variant}</b></span>
              <span>${t.stakes}</span>
            </div>
            <div className="tile-foot">
              <div className="seats">
                {Array.from({ length: t.seats }).map((_, j) => (
                  <span key={j} className={j < t.filled ? 'seat-dot' : 'seat-dot empty'} />
                ))}
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{t.filled}/{t.seats}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tournaments */}
      <h2 className="display" style={{ fontSize: 28, marginTop: 38, marginBottom: 12 }}>Tournaments</h2>
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {tournaments.map((t, i) => (
          <div key={i} className="tile" onClick={() => {}}>
            <div className="tile-tag">{t.state}</div>
            <div className="tile-title">{t.name}</div>
            <div className="tile-meta" style={{ flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 14 }}>
                <span><b>${t.buy}</b> buy-in</span>
                <span><b>${fmtChips(t.prize)}</b> prize</span>
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                <span>{t.entrants.toLocaleString()} entrants</span>
                <span>{t.starts}</span>
              </div>
            </div>
            <div className="tile-foot">
              <div className="eyebrow">{t.state}</div>
              <button className="btn primary" style={{ padding: '6px 14px', fontSize: 12.5 }}>Register</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Profile() {
  const stats = [
    { label: 'Hands played', v: '12,481', delta: '+128 this week', up: true },
    { label: 'Win rate',     v: '54.2%',   delta: '+2.1pp', up: true },
    { label: 'BB / 100',     v: '+8.4',    delta: '+0.6', up: true },
    { label: 'Biggest pot',  v: '$28,400', delta: 'Royal flush · Mar 12' },
    { label: 'VPIP',         v: '24%',     delta: '−1pp', up: false },
    { label: 'PFR',          v: '18%',     delta: '+0.3pp', up: true },
  ];
  const achievements = [
    { name: 'First Royal', meta: 'Mar 12, 2026', state: 'unlocked' },
    { name: 'No bluff bluff', meta: 'Win 5 hands w/ 7-2 off', state: 'unlocked' },
    { name: 'Iron seat', meta: '8h session', state: 'unlocked' },
    { name: 'Heads-up Holyfield', meta: 'Win 25 HU', state: 'progress', p: 64 },
    { name: 'Nosebleed', meta: 'Cash a $50/$100 session', state: 'locked' },
    { name: 'Felt millionaire', meta: 'Lifetime $1M won', state: 'progress', p: 24 },
  ];
  return (
    <div className="fade-in" style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 22 }}>
      {/* Identity card */}
      <div className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Avatar name="You" seed={0} size={84} />
          <div>
            <div className="eyebrow">Member since '24</div>
            <h2 className="display" style={{ fontSize: 36 }}>Hayden Wu</h2>
            <div style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>@hayden · Chicago</div>
          </div>
        </div>
        <div className="panel" style={{
          background: 'linear-gradient(160deg, var(--rail), var(--rail-edge))',
          color: 'var(--cream)', border: 0, padding: 18,
        }}>
          <div className="eyebrow" style={{ color: 'var(--brass)', opacity: 1 }}>Lifetime</div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 44, lineHeight: 1, marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--ui)', fontStyle: 'normal', fontSize: 18, opacity: .7, marginRight: 6 }}>$</span>
            312,840
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, opacity: .65, marginTop: 4 }}>profit · all stakes</div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Style</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['Tight aggressive', 'River caller', 'Late raiser', '3-bet happy'].map(t => (
              <span key={t} style={{
                padding: '5px 11px', borderRadius: 999,
                border: '1px solid var(--line)', fontSize: 12.5,
              }}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {stats.map((s, i) => (
            <div key={i} className="stat">
              <span className="label">{s.label}</span>
              <span className="v">{s.v}</span>
              <span className={s.up == null ? 'delta' : `delta ${s.up ? 'up' : 'down'}`}>
                {s.up != null && (s.up ? '↑ ' : '↓ ')}{s.delta}
              </span>
            </div>
          ))}
        </div>

        <div className="panel panel-pad">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 className="display" style={{ fontSize: 22 }}>Achievements</h3>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-soft)' }}>3 / 24</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {achievements.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 12, borderRadius: 10,
                background: a.state === 'unlocked' ? 'color-mix(in oklch, var(--brass) 18%, var(--paper))' : 'var(--paper-2)',
                opacity: a.state === 'locked' ? .5 : 1,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: a.state === 'unlocked' ? 'var(--brass)' : 'rgba(0,0,0,.08)',
                  display: 'grid', placeItems: 'center',
                  color: a.state === 'unlocked' ? 'var(--rail-edge)' : 'var(--ink-soft)',
                }}>
                  <Icon name={a.state === 'unlocked' ? 'trophy' : 'eye'} size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13.5 }}>{a.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{a.meta}</div>
                  {a.state === 'progress' && (
                    <div style={{ height: 3, marginTop: 6, background: 'rgba(0,0,0,.08)', borderRadius: 999 }}>
                      <div style={{ height: '100%', width: `${a.p}%`, background: 'var(--brass)', borderRadius: 999 }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function History() {
  const rows = [
    { stamp: '21:04', cards: ['As','Ks'], name: 'Royal Flush', pot: 28400, result: 'won' },
    { stamp: '20:58', cards: ['9d','9h'], name: 'Three of a Kind', pot: 4200,  result: 'won' },
    { stamp: '20:52', cards: ['Qc','Jh'], name: 'Pair', pot: 1500,  result: 'lost' },
    { stamp: '20:47', cards: ['7d','2c'], name: 'High Card', pot: 200,   result: 'lost' },
    { stamp: '20:41', cards: ['Ah','Ad'], name: 'Two Pair', pot: 12100, result: 'won' },
    { stamp: '20:33', cards: ['Tc','9c'], name: 'Flush', pot: 8800,  result: 'won' },
    { stamp: '20:28', cards: ['Ks','Qs'], name: 'Straight', pot: 6400,  result: 'tie' },
    { stamp: '20:21', cards: ['5h','5d'], name: 'Pair', pot: 800,   result: 'lost' },
    { stamp: '20:14', cards: ['Jh','Ts'], name: 'High Card', pot: 100,   result: 'lost' },
    { stamp: '20:08', cards: ['Ac','Kd'], name: 'Pair', pot: 3200,  result: 'won' },
  ];
  return (
    <div className="fade-in" style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 22 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 className="display" style={{ fontSize: 28 }}>Hand history</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {['Today','7 days','30 days','All'].map((f, i) => (
              <button key={f} className="btn ghost" style={{ padding: '6px 12px', fontSize: 12.5,
                background: i === 0 ? 'var(--ink)' : 'transparent', color: i === 0 ? 'var(--paper)' : 'var(--ink)' }}>{f}</button>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="history-row" style={{ background: 'var(--paper-2)', fontFamily: 'var(--mono)',
            fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-soft)', cursor: 'default' }}>
            <span>Time</span><span>Hand</span><span>Strength</span><span>Pot</span><span>Result</span><span></span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="history-row">
              <span className="stamp">{r.stamp}</span>
              <div className="cards">
                <Card rank={r.cards[0][0]} suit={r.cards[0][1]} size={28} />
                <Card rank={r.cards[1][0]} suit={r.cards[1][1]} size={28} />
              </div>
              <span className="strength">{r.name}</span>
              <span className="pot">${fmtChips(r.pot)}</span>
              <span className={`result ${r.result}`}>
                {r.result === 'won' ? `+$${fmtChips(r.pot)}` : r.result === 'lost' ? `−$${fmtChips(Math.round(r.pot/3))}` : 'split'}
              </span>
              <Icon name="chevR" size={14} />
            </div>
          ))}
        </div>
      </div>

      {/* Replay panel */}
      <div className="panel panel-pad" style={{ height: 'fit-content', position: 'sticky', top: 88 }}>
        <div className="eyebrow">Replay · 21:04</div>
        <h3 className="display" style={{ fontSize: 24, marginTop: 4 }}>The Royal</h3>
        <div style={{
          marginTop: 14, borderRadius: 12,
          background: 'linear-gradient(160deg, var(--rail), var(--rail-edge))',
          padding: 20, color: 'var(--cream)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}>
          <div className="hand">
            {['Ts','Js','Qs','Ks','As'].map((c, i) => (
              <Card key={i} rank={c[0]} suit={c[1]} size={48} />
            ))}
          </div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', color: 'var(--brass)', fontSize: 22 }}>Royal Flush</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: .7 }}>Won $28,400 · 9 BB/h table</div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button className="btn primary" style={{ flex: 1 }}><Icon name="play" size={12} /> Replay</button>
          <button className="btn" style={{ flex: 1 }}>Share</button>
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Action timeline</div>
          {[
            { who: 'You',    bet: 'Raise $400', state: 'pre' },
            { who: 'Lana',   bet: 'Call $400',  state: 'pre' },
            { who: 'Vega',   bet: '3-bet $1.2K', state: 'pre' },
            { who: 'You',    bet: 'Call $800', state: 'flop' },
            { who: 'Vega',   bet: 'Bet $2K',  state: 'flop' },
            { who: 'You',    bet: 'Raise $4.8K', state: 'turn' },
            { who: 'Vega',   bet: 'Call', state: 'turn' },
            { who: 'You',    bet: 'All-in', state: 'river' },
          ].map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '5px 0', borderBottom: '1px dashed var(--line)' }}>
              <span style={{ width: 50, color: 'var(--ink-soft)', fontFamily: 'var(--mono)', fontSize: 10.5, textTransform: 'uppercase' }}>{a.state}</span>
              <span style={{ flex: 1, fontWeight: 500 }}>{a.who}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{a.bet}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Tournaments() {
  const r1 = [
    ['Vega', 'Solène'], ['Costa', 'Lana K.'], ['Marek', 'Aoife M.'], ['Ren Park', 'Ito'],
    ['You', 'Tariq'], ['Beni', 'Hux'], ['Onyeka', 'Mira'], ['Joon', 'Alma'],
  ];
  const r2 = [['Vega','Lana K.'], ['Marek','Ren Park'], ['You','Hux'], ['Onyeka','Joon']];
  const r3 = [['Vega','Marek'], ['You','Onyeka']];
  const r4 = [['Vega','You']];
  return (
    <div className="fade-in" style={{ padding: 24 }}>
      <div className="panel panel-pad" style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div className="eyebrow">Now playing · Round of 16</div>
            <h2 className="display" style={{ fontSize: 36, marginTop: 4 }}>Brass Heads-Up Bracket</h2>
            <div style={{ color: 'var(--ink-soft)', fontSize: 13.5, marginTop: 4 }}>$500 buy-in · 64 entrants · $80,000 prize pool</div>
          </div>
          <div style={{ display: 'flex', gap: 22 }}>
            <div className="stat" style={{ minWidth: 140 }}>
              <span className="label">Place</span>
              <span className="v">5th</span>
              <span className="delta up">↑ 12 from start</span>
            </div>
            <div className="stat" style={{ minWidth: 140 }}>
              <span className="label">Stack</span>
              <span className="v">$72.4K</span>
              <span className="delta up">↑ $14.2K</span>
            </div>
            <div className="stat" style={{ minWidth: 140 }}>
              <span className="label">Next match</span>
              <span className="v" style={{ fontSize: 22 }}>vs. Hux</span>
              <span className="delta">in 6:42</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel panel-pad">
        <h3 className="display" style={{ fontSize: 22, marginBottom: 6 }}>Bracket</h3>
        <div className="bracket">
          <BracketRound title="Round of 16" matches={r1} winners={['Vega','Lana K.','Marek','Ren Park','You','Hux','Onyeka','Joon']} />
          <BracketRound title="Quarterfinals" matches={r2} winners={['Vega','Marek','You','Onyeka']} />
          <BracketRound title="Semifinals" matches={r3} winners={['Vega','You']} pending />
          <BracketRound title="Final" matches={r4} winners={[]} pending highlight />
        </div>
      </div>
    </div>
  );
}

function BracketRound({ title, matches, winners, pending, highlight }) {
  return (
    <div className="bracket-round">
      <h4>{title}</h4>
      {matches.map((m, i) => (
        <div key={i} className="match" style={highlight ? { borderColor: 'var(--brass)', boxShadow: '0 0 0 3px color-mix(in oklch, var(--brass) 20%, transparent)' } : null}>
          {m.map((p, j) => {
            const won = winners.includes(p) && !pending;
            return (
              <div key={j} className={won ? 'match-row winner' : 'match-row'}>
                <Avatar name={p} seed={i*2 + j} size={26} />
                <span className="nm">{p}</span>
                <span className="sc">{won ? '✓' : pending ? '—' : ''}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Onboarding({ onDone }) {
  const [step, setStep] = React.useState(0);
  const slides = [
    {
      eyebrow: 'Step one · The hand',
      h: 'Two cards in your pocket. Five on the felt.',
      p: "In No-Limit Hold'em you're dealt two private cards. Five community cards land face up on the table — flop, turn, river. Make your best five from any of the seven.",
      visual: (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {['As','Kh'].map((c,i)=>(<Card key={i} rank={c[0]} suit={c[1]} size={70} />))}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--brass)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>+ board</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['Qd','Jc','Th','7s','4d'].map((c,i)=>(<Card key={i} rank={c[0]} suit={c[1]} size={60} />))}
          </div>
        </div>
      )
    },
    {
      eyebrow: 'Step two · The bets',
      h: 'Fold, call, or raise. The math is in the courage.',
      p: 'Each round you decide whether to keep playing for free, match the bet, or pile chips on the felt. The bigger the pressure, the more story you tell about your hand.',
      visual: (
        <div className="action-row" style={{ width: 'min(420px, 90%)' }}>
          <button className="action-btn fold"><span className="lbl">Fold</span><span className="sub">Throw the hand</span></button>
          <button className="action-btn call"><span className="lbl">Call $200</span><span className="sub">to $200</span></button>
          <button className="action-btn raise"><span className="lbl">Raise to $600</span><span className="sub">3× pot</span></button>
        </div>
      )
    },
    {
      eyebrow: 'Step three · The strength',
      h: 'Pair. Trips. The royal at the top.',
      p: 'A flush beats a straight. Three of a kind beats two pair. We show you exactly what you\'ve got and what you can still draw — every hand, every street.',
      visual: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          {['Royal Flush','Straight Flush','Four of a Kind','Full House','Flush','Straight','Three of a Kind','Two Pair','Pair','High Card'].map((n,i)=>(
            <div key={n} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 14px', borderRadius: 999,
              background: i < 3 ? 'color-mix(in oklch, var(--brass) 20%, var(--paper))' : 'var(--paper-2)',
              border: '1px solid var(--line)',
              minWidth: 280,
            }}>
              <span style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 16 }}>{n}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-soft)' }}>{10 - i}</span>
            </div>
          ))}
        </div>
      )
    }
  ];
  const cur = slides[step];
  return (
    <div className="fade-in" style={{ padding: '40px 24px' }}>
      <div className="onboard">
        <div className="eyebrow">{cur.eyebrow}</div>
        <h2 style={{ marginTop: 6 }}>{cur.h}</h2>
        <p style={{ marginTop: 14 }}>{cur.p}</p>
        <div className="steps">
          {slides.map((_, i) => <div key={i} className={i <= step ? 'step-dot on' : 'step-dot'} />)}
        </div>
        <div className="demo-tile">
          {cur.visual}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button className="btn" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Back</button>
          {step < slides.length - 1
            ? <button className="btn primary" onClick={() => setStep(step + 1)}>Next <Icon name="chevR" size={12} /></button>
            : <button className="btn brass" onClick={onDone}>Take a seat <Icon name="chevR" size={12} /></button>}
          <button className="btn ghost" onClick={onDone} style={{ marginLeft: 'auto' }}>Skip</button>
        </div>
      </div>
    </div>
  );
}

function Cashier() {
  const packs = [
    { chips: 5_000,    price: 4.99,  bonus: null },
    { chips: 25_000,   price: 19.99, bonus: '+10%' },
    { chips: 120_000,  price: 79.99, bonus: '+25%', featured: true },
    { chips: 500_000,  price: 299,   bonus: '+40%' },
    { chips: 2_500_000,price: 1199,  bonus: '+60%' },
  ];
  return (
    <div className="fade-in" style={{ padding: 24 }}>
      <h2 className="display" style={{ fontSize: 32, marginBottom: 4 }}>Cashier</h2>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 520, marginBottom: 24 }}>
        Stack up. Chips never expire and roll over across all play modes.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {packs.map((p, i) => {
          const stacks = [
            { d: CHIP_DENOMS[3], n: 6, dx: -32 },
            { d: CHIP_DENOMS[5], n: 8, dx: 0 },
            { d: CHIP_DENOMS[7], n: Math.min(10, Math.ceil(p.chips / 100000)), dx: 32 },
          ];
          return (
            <div key={i} className={p.featured ? 'chip-pack featured' : 'chip-pack'}>
              {p.bonus && <div className="tile-tag" style={{ position: 'absolute', top: 12, right: 12,
                background: p.featured ? 'var(--brass)' : 'oklch(0.92 0.08 145)',
                color: p.featured ? 'var(--rail-edge)' : 'oklch(0.30 0.16 145)',
              }}>{p.bonus}</div>}
              <div className="stack-display">
                {stacks.map((s, k) => (
                  <div key={k} style={{ position: 'absolute', left: '50%', bottom: 8, transform: `translateX(${s.dx}px) translateX(-50%)` }}>
                    {Array.from({ length: s.n }).map((_, j) => (
                      <div key={j} className="chip" style={{
                        '--ch': '36px',
                        '--chip-c': s.d.c,
                        position: 'absolute',
                        left: 0,
                        bottom: j * 3,
                        color: s.d.ink,
                      }}>
                        {j === s.n - 1 && <span style={{ fontSize: 11 }}>{s.d.label}</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="chip-pack-amt"><small>$</small>{fmtChips(p.chips)}</div>
              <div className="chip-pack-foot">{p.bonus ? `${p.bonus} bonus chips` : 'starter pack'}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, opacity: .7 }}>${(p.chips/p.price).toFixed(0)}/USD</span>
                <span className="price">${p.price}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel panel-pad" style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        <div>
          <div className="eyebrow">Pay with</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            {['Apple Pay', 'Card', 'Bitcoin', 'Wire'].map((m, i) => (
              <div key={m} style={{
                padding: '10px 16px', borderRadius: 10,
                background: i === 0 ? 'var(--ink)' : 'var(--paper-2)',
                color: i === 0 ? 'var(--paper)' : 'var(--ink)',
                border: '1px solid var(--line)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>{m}</div>
            ))}
          </div>
        </div>
        <div>
          <div className="eyebrow">Recent purchases</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            {[['Mar 28', '$120K pack', '$79.99'],['Mar 14', '$25K pack', '$19.99'],['Feb 22', '$500K pack', '$299']].map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, padding: '7px 0', borderBottom: '1px dashed var(--line)' }}>
                <span style={{ width: 70, color: 'var(--ink-soft)', fontFamily: 'var(--mono)', fontSize: 11.5 }}>{r[0]}</span>
                <span style={{ flex: 1 }}>{r[1]}</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{r[2]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Settings() {
  const [s, setS] = React.useState({
    sound: true, autoMuck: true, fourColor: false,
    confirmFold: false, hud: true, animations: true,
    seatPref: 'right', autoPost: true, lang: 'English',
  });
  const set = (k, v) => setS(p => ({ ...p, [k]: v }));
  const Tog = ({ on, onChange }) => (
    <button onClick={() => onChange(!on)} style={{
      width: 36, height: 22, borderRadius: 999,
      background: on ? 'oklch(0.55 0.16 145)' : 'rgba(0,0,0,.15)',
      border: 0, position: 'relative', cursor: 'pointer',
    }}>
      <span style={{
        position: 'absolute', top: 3, left: on ? 17 : 3,
        width: 16, height: 16, borderRadius: 999,
        background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        transition: 'left .15s',
      }} />
    </button>
  );
  return (
    <div className="fade-in" style={{ padding: 24, maxWidth: 720 }}>
      <h2 className="display" style={{ fontSize: 32, marginBottom: 18 }}>Settings</h2>

      <div className="eyebrow" style={{ marginBottom: 8 }}>Gameplay</div>
      <div className="row-list" style={{ marginBottom: 20 }}>
        {[
          { k: 'autoMuck',     l: 'Auto-muck losing hands',  s: 'Skip the reveal when you lose' },
          { k: 'confirmFold',  l: 'Confirm before folding',  s: 'Useful at high stakes' },
          { k: 'autoPost',     l: 'Auto-post blinds',        s: 'Skip the prompt at table sit-down' },
          { k: 'hud',          l: 'Show hand strength HUD',  s: 'Right-side meter on the table' },
        ].map(r => (
          <div className="s-row" key={r.k}>
            <div>
              <div className="lbl">{r.l}</div>
              <div className="sub">{r.s}</div>
            </div>
            <div className="right"><Tog on={s[r.k]} onChange={v => set(r.k, v)} /></div>
          </div>
        ))}
      </div>

      <div className="eyebrow" style={{ marginBottom: 8 }}>Display</div>
      <div className="row-list" style={{ marginBottom: 20 }}>
        <div className="s-row">
          <div><div className="lbl">Four-color deck</div><div className="sub">Distinct color per suit</div></div>
          <div className="right"><Tog on={s.fourColor} onChange={v => set('fourColor', v)} /></div>
        </div>
        <div className="s-row">
          <div><div className="lbl">Animations</div><div className="sub">Card deals, chip pushes, bet shimmer</div></div>
          <div className="right"><Tog on={s.animations} onChange={v => set('animations', v)} /></div>
        </div>
        <div className="s-row">
          <div><div className="lbl">Seat preference</div><div className="sub">Where you sit at top-down tables</div></div>
          <div className="right" style={{ display: 'flex', gap: 4 }}>
            {['left','center','right'].map(p => (
              <button key={p} onClick={() => set('seatPref', p)} style={{
                padding: '5px 11px', borderRadius: 8,
                border: '1px solid var(--line)',
                background: s.seatPref === p ? 'var(--ink)' : 'var(--paper)',
                color: s.seatPref === p ? 'var(--paper)' : 'var(--ink)',
                fontSize: 12, cursor: 'pointer',
              }}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="eyebrow" style={{ marginBottom: 8 }}>Audio</div>
      <div className="row-list" style={{ marginBottom: 20 }}>
        <div className="s-row">
          <div><div className="lbl">Sound effects</div><div className="sub">Card whoosh, chip clink, dealer cues</div></div>
          <div className="right"><Tog on={s.sound} onChange={v => set('sound', v)} /></div>
        </div>
        <div className="s-row">
          <div><div className="lbl">Master volume</div></div>
          <div className="right" style={{ width: 160 }}>
            <input type="range" defaultValue={70} style={{ width: '100%' }} />
          </div>
        </div>
      </div>

      <div className="eyebrow" style={{ marginBottom: 8 }}>Account</div>
      <div className="row-list">
        <div className="s-row"><div><div className="lbl">Email</div><div className="sub">hayden@example.com</div></div><div className="right"><button className="btn ghost">Change</button></div></div>
        <div className="s-row"><div><div className="lbl">Two-factor auth</div><div className="sub">App-based · enabled</div></div><div className="right"><button className="btn ghost">Manage</button></div></div>
        <div className="s-row"><div><div className="lbl">Sign out everywhere</div><div className="sub">Ends all sessions</div></div><div className="right"><button className="btn">Sign out</button></div></div>
      </div>
    </div>
  );
}

Object.assign(window, { Lobby, Profile, History, Tournaments, Onboarding, Cashier, Settings });
