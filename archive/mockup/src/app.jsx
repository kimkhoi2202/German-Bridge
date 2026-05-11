// app.jsx — root shell, routing, tweaks panel
// Globals: React, ReactDOM, all screens + primitives + tweaks
// ---------------------------------------------------------------

const ROUTES = [
{ id: 'lobby', label: 'Lobby', icon: 'home', section: 'PLAY' },
{ id: 'table', label: "Hold'em Table", icon: 'table', section: 'PLAY', badge: 'Live' },
{ id: 'german', label: 'German Bridge', icon: 'deck', section: 'PLAY' },
{ id: 'tourneys', label: 'Tournaments', icon: 'trophy', section: 'PLAY' },
{ id: 'history', label: 'Hand history', icon: 'history', section: 'YOU' },
{ id: 'profile', label: 'Profile', icon: 'user', section: 'YOU' },
{ id: 'cashier', label: 'Cashier', icon: 'chip', section: 'YOU' },
{ id: 'learn', label: 'How to play', icon: 'book', section: 'MORE' },
{ id: 'settings', label: 'Settings', icon: 'cog', section: 'MORE' }];


const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "felt",
  "palette": ["#1f6f4a", "#3b1d12", "#d8a84a", "#f6f1e3"],
  "cardstyle": "classic",
  "chipstyle": "casino",
  "avatarstyle": "ring",
  "layout": "top",
  "seats": 9,
  "density": "regular",
  "anim": "on",
  "suits": "two",
  "gbPlayers": 4,
  "gbDecks": 1,
  "gbTricks": 10,
  "gbRounds": 5,
  "gbLayout": "salon",
  "gbTrumpHint": "on",
  "gbCardBack": "classic",
  "gbBotMood": "mixed"
} /*EDITMODE-END*/;

const THEMES = [
{ id: 'felt', name: 'Felt & Brass', colors: ['#1f6f4a', '#3b1d12', '#d8a84a', '#f6f1e3'] },
{ id: 'midnight', name: 'Midnight Velvet', colors: ['#28204a', '#0f0a26', '#e2c469', '#f0eaf6'] },
{ id: 'bone', name: 'Bone & Blush', colors: ['#ecdfd0', '#3a221a', '#a8533c', '#f7efe2'] },
{ id: 'carnival', name: 'Carnival', colors: ['#7a3aa6', '#39173a', '#f4b740', '#ffd9b6'] },
{ id: 'studio', name: 'Studio', colors: ['#f0eee8', '#1a1a1a', '#1a1a1a', '#ffffff'] }];


function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState('table');
  const goto = (id) => setRoute(id);

  // Apply theme + style attrs at root
  const themeId = THEMES.find((x) => x.colors.join() === (t.palette || []).join())?.id || t.theme;
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
  }, [themeId]);

  const containerAttrs = {
    'data-cardstyle': t.cardstyle,
    'data-chipstyle': t.chipstyle,
    'data-avatarstyle': t.avatarstyle,
    'data-density': t.density,
    'data-anim': t.anim === 'off' ? 'off' : 'on',
    'data-suits': t.suits
  };

  const Screen = {
    lobby: <Lobby onJoin={() => setRoute('table')} />,
    table: <TableScreen tweaks={t} seats={t.seats || 9} />,
    german: <GermanBridgeScreen tweaks={t} />,
    tourneys: <Tournaments />,
    history: <History />,
    profile: <Profile />,
    cashier: <Cashier />,
    learn: <Onboarding onDone={() => setRoute('table')} />,
    settings: <Settings />
  }[route];

  const cur = ROUTES.find((r) => r.id === route);

  return (
    <div className="app app-bottomnav" {...containerAttrs} data-screen-label={`Poker · ${cur?.label || ''}`}>
      <main className="main">
        <div className="main-content">{Screen}</div>
      </main>

      <nav className="bottom-nav" aria-label="Primary">
        <div className="bottom-nav-brand">
          <span className="display">Felt&nbsp;&amp;&nbsp;Brass</span>
        </div>

        <div className="bottom-nav-routes" role="tablist">
          {ROUTES.map((r) => (
            <button
              key={r.id}
              className="bn-item"
              data-active={route === r.id ? '1' : '0'}
              onClick={() => goto(r.id)}
              title={r.label}
              aria-label={r.label}
              aria-current={route === r.id ? 'page' : undefined}
            >
              <Icon name={r.icon} size={18} />
              <span className="bn-label">{r.label}</span>
              {r.badge && <span className="bn-badge">{r.badge}</span>}
            </button>
          ))}
        </div>

        <div className="bottom-nav-end">
          <div
            className="bn-bankroll"
            onClick={() => goto('cashier')}
            title="Bankroll · click to open Cashier"
          >
            <span className="bn-bankroll-label">Bankroll</span>
            <span className="bn-bankroll-amt mono">$14,250</span>
          </div>
          <button
            className="bn-avatar"
            onClick={() => goto('profile')}
            aria-label="Profile"
            title="Profile"
          >
            <Avatar name="Hayden W" seed={0} size={32} />
          </button>
        </div>
      </nav>

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme">
          <TweakColor label="Palette" value={t.palette}
          options={THEMES.map((x) => x.colors)}
          onChange={(v) => {
            const theme = THEMES.find((x) => x.colors.join() === v.join());
            setTweak({ palette: v, theme: theme?.id || t.theme });
          }} />
        </TweakSection>

        <TweakSection label="Table">
          <TweakRadio label="Layout" value={t.layout} options={[
          { value: 'top', label: 'Top-down' },
          { value: 'fp', label: 'First-person' }]
          } onChange={(v) => setTweak('layout', v)} />
          <TweakSelect label="Seats" value={t.seats} options={[
          { value: 2, label: '2 (heads-up)' },
          { value: 6, label: '6-max' },
          { value: 9, label: '9 (full ring)' }]
          } onChange={(v) => setTweak('seats', +v)} />
        </TweakSection>

        <TweakSection label="Cards & chips">
          <TweakSelect label="Card style" value={t.cardstyle} options={[
          { value: 'classic', label: 'Classic' },
          { value: 'minimal', label: 'Minimal' },
          { value: 'illustrated', label: 'Illustrated' },
          { value: 'pixel', label: 'Pixel' }]
          } onChange={(v) => setTweak('cardstyle', v)} />
          <TweakRadio label="Suit colors" value={t.suits} options={[
          { value: 'two', label: 'Two' },
          { value: 'four', label: 'Four' }]
          } onChange={(v) => setTweak('suits', v)} />
          <TweakRadio label="Chip style" value={t.chipstyle} options={[
          { value: 'casino', label: 'Casino' },
          { value: 'modern', label: 'Modern' },
          { value: 'wafer', label: 'Wafer' }]
          } onChange={(v) => setTweak('chipstyle', v)} />
          <TweakRadio label="Avatar" value={t.avatarstyle} options={[
          { value: 'ring', label: 'Ring' },
          { value: 'plain', label: 'Plain' },
          { value: 'square', label: 'Square' }]
          } onChange={(v) => setTweak('avatarstyle', v)} />
        </TweakSection>

        <TweakSection label="Feel">
          <TweakRadio label="Density" value={t.density} options={[
          { value: 'compact', label: 'Compact' },
          { value: 'regular', label: 'Regular' },
          { value: 'comfy', label: 'Comfy' }]
          } onChange={(v) => setTweak('density', v)} />
          <TweakRadio label="Animation" value={t.anim} options={[
          { value: 'off', label: 'Off' },
          { value: 'on', label: 'On' }]
          } onChange={(v) => setTweak('anim', v)} />
        </TweakSection>

        {route === 'german' &&
        <TweakSection label="German Bridge">
            <TweakRadio label="Table" value={t.gbLayout} options={[
            { value: 'salon', label: 'Salon' },
            { value: 'pad', label: 'Card-pad' }]
            } onChange={(v) => setTweak('gbLayout', v)} />
            <TweakRadio label="Trump hint" value={t.gbTrumpHint} options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' }]
            } onChange={(v) => setTweak('gbTrumpHint', v)} />
            <TweakSelect label="Card backs" value={t.gbCardBack} options={[
            { value: 'classic', label: 'Classic crosshatch' },
            { value: 'lattice', label: 'Brass lattice' },
            { value: 'monogram', label: 'Monogram' }]
            } onChange={(v) => setTweak('gbCardBack', v)} />
            <TweakRadio label="Bot mood (default)" value={t.gbBotMood} options={[
            { value: 'cautious', label: 'Cautious' },
            { value: 'mixed', label: 'Mixed' },
            { value: 'aggressive', label: 'Aggressive' }]
            } onChange={(v) => setTweak('gbBotMood', v)} />
          </TweakSection>
        }
      </TweaksPanel>
    </div>);

}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);