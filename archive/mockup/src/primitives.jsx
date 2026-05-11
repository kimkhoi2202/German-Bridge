// primitives.jsx — Card, Chip, Avatar, Icon, hand math
// Globals: React, window
// ---------------------------------------------------------------

const SUIT_CHAR = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_NAME = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

function Card({ rank = 'A', suit = 's', size = 76, faceDown = false, style = {}, className = '', deal = false }) {
  const isRed = suit === 'h' || suit === 'd';
  const cls = [
    'card',
    isRed ? 'red' : 'black',
    SUIT_NAME[suit],
    faceDown ? 'facedown' : '',
    deal ? 'deal-in' : '',
    className,
  ].filter(Boolean).join(' ');
  if (faceDown) {
    return <div className={cls} style={{ '--cw': `${size}px`, ...style }} />;
  }
  return (
    <div className={cls} style={{ '--cw': `${size}px`, ...style }}>
      <div className="corner tl">
        <span>{rank}</span>
        <span className="suit">{SUIT_CHAR[suit]}</span>
      </div>
      <div className="center">{SUIT_CHAR[suit]}</div>
      <div className="corner br">
        <span>{rank}</span>
        <span className="suit">{SUIT_CHAR[suit]}</span>
      </div>
    </div>
  );
}

// Chip denominations — color, label
const CHIP_DENOMS = [
  { v: 1,     c: 'oklch(0.96 0.01 90)',  label: '1',   ink: 'oklch(0.18 0.01 90)' },
  { v: 5,     c: 'oklch(0.55 0.22 25)',  label: '5',   ink: 'white' },
  { v: 25,    c: 'oklch(0.50 0.16 145)', label: '25',  ink: 'white' },
  { v: 100,   c: 'oklch(0.32 0.04 280)', label: '100', ink: 'white' },
  { v: 500,   c: 'oklch(0.62 0.18 320)', label: '500', ink: 'white' },
  { v: 1000,  c: 'oklch(0.72 0.16 80)',  label: '1K',  ink: 'oklch(0.20 0.04 35)' },
  { v: 5000,  c: 'oklch(0.18 0.02 90)',  label: '5K',  ink: 'oklch(0.78 0.12 80)' },
  { v: 25000, c: 'oklch(0.65 0.18 250)', label: '25K', ink: 'white' },
];

function Chip({ value = 100, size = 44, count, style = {} }) {
  const denom = CHIP_DENOMS.find((d) => d.v === value) || CHIP_DENOMS[3];
  return (
    <div className="chip" style={{ '--ch': `${size}px`, '--chip-c': denom.c, color: denom.ink, ...style }}>
      <span>{count != null ? `×${count}` : denom.label}</span>
    </div>
  );
}

// Decompose a chip total into a stack of denomination breakdowns
function chipBreakdown(total, maxStacks = 4) {
  const sorted = [...CHIP_DENOMS].sort((a, b) => b.v - a.v);
  const stacks = [];
  let rem = total;
  for (const d of sorted) {
    const n = Math.floor(rem / d.v);
    if (n > 0) {
      stacks.push({ denom: d, count: Math.min(n, 12) });
      rem -= n * d.v;
    }
    if (stacks.length >= maxStacks) break;
  }
  return stacks;
}

function ChipStack({ total, size = 26 }) {
  const stacks = chipBreakdown(total, 3);
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
      {stacks.map((s, i) => (
        <div key={i} style={{
          position: 'relative',
          width: size,
          height: size + Math.min(s.count, 8) * 2,
        }}>
          {Array.from({ length: Math.min(s.count, 8) }).map((_, j) => (
            <div key={j} className="chip" style={{
              position: 'absolute',
              left: 0,
              bottom: j * 2,
              '--ch': `${size}px`,
              '--chip-c': s.denom.c,
              color: s.denom.ink,
            }}>
              {j === Math.min(s.count, 8) - 1 && <span style={{ fontSize: size * 0.32 }}>{s.denom.label}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Color-coded gradient avatars for placeholders
const AV_PALETTE = [
  ['oklch(0.72 0.16 30)',  'oklch(0.50 0.18 350)'],
  ['oklch(0.78 0.14 80)',  'oklch(0.55 0.16 30)'],
  ['oklch(0.72 0.14 145)', 'oklch(0.42 0.12 200)'],
  ['oklch(0.65 0.16 250)', 'oklch(0.40 0.14 300)'],
  ['oklch(0.78 0.14 100)', 'oklch(0.50 0.18 60)'],
  ['oklch(0.72 0.16 320)', 'oklch(0.42 0.16 250)'],
  ['oklch(0.68 0.14 200)', 'oklch(0.40 0.12 140)'],
  ['oklch(0.78 0.14 50)',  'oklch(0.50 0.18 25)'],
  ['oklch(0.66 0.16 290)', 'oklch(0.40 0.14 320)'],
];

function Avatar({ name = '?', seed = 0, size = 44, glyph = false, style = {} }) {
  const [c1, c2] = AV_PALETTE[seed % AV_PALETTE.length];
  const initials = name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <div className={glyph ? 'av glyph' : 'av'} style={{
      width: size, height: size,
      fontSize: Math.max(11, size * 0.36),
      '--c1': c1, '--c2': c2,
      ...style,
    }}>
      {!glyph && initials}
    </div>
  );
}

// Inline icons (stroked, 16/20px)
function Icon({ name, size = 16, color = 'currentColor', strokeWidth = 1.6 }) {
  const paths = {
    home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
    table: <><ellipse cx="12" cy="12" rx="9" ry="6" /><ellipse cx="12" cy="12" rx="5" ry="3" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></>,
    trophy: <><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v4a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v3a3 3 0 0 1-3 3" /><path d="M7 5H4v3a3 3 0 0 0 3 3" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></>,
    book: <><path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M9 3v18" /><path d="M12 7h4M12 11h4" /></>,
    cog: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
    chip: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    chevR: <><path d="m9 6 6 6-6 6" /></>,
    play: <><path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none" /></>,
    pause: <><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>,
    flip: <><path d="M3 12a9 9 0 0 1 16-5" /><path d="M21 12a9 9 0 0 1-16 5" /><path d="M19 3v4h-4M5 21v-4h4" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
    hash: <><path d="M5 9h14M5 15h14M9 4 7 20M17 4l-2 16" /></>,
    deck: <><rect x="4" y="6" width="14" height="14" rx="2" /><path d="M8 2h12v12" /></>,
    coffee: <><path d="M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" /><path d="M17 11h2a2 2 0 0 1 0 4h-2" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths[name] || null}
    </svg>
  );
}

// Tiny utility: format chips nicely
function fmtChips(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

Object.assign(window, {
  Card, Chip, ChipStack, Avatar, Icon,
  CHIP_DENOMS, AV_PALETTE, SUIT_CHAR, SUIT_NAME,
  chipBreakdown, fmtChips,
});
