/* global React, ReactDOM, BlissWallpaper, MenuBar, Superbar, CTLogoMark,
          HomeScreen, LobbyScreen, WriteScreen, DescribeScreen,
          ReimplementScreen, WaitingScreen, RevealScreen,
          TweaksPanel, TweakSection, TweakRadio, TweakToggle, useTweaks */

const SCREEN_LABELS = {
  desktop:     'Desktop',
  home:        'Home',
  lobby:       'Waiting Room',
  write:       'Write phase',
  describe:    'Describe phase',
  reimplement: 'Reimplement phase',
  waiting:     'Waiting…',
  reveal:      'Reveal',
};

const INITIAL_PLAYERS = [
  { name: 'Jordan', you: false, ready: true,  host: true  },
  { name: 'Amrita', you: false, ready: true,  host: false },
  { name: 'Lukas',  you: false, ready: false, host: false },
  { name: 'You',    you: true,  ready: false, host: false },
  { name: 'Mei',    you: false, ready: true,  host: false },
  { name: 'Sam',    you: false, ready: false, afk: true, host: false },
];

const INITIAL_GAME_PLAYERS = [
  { name: 'Jordan', you: false, status: 'submitted', statusText: 'Submitted' },
  { name: 'Amrita', you: false, status: 'submitted', statusText: 'Submitted' },
  { name: 'Lukas',  you: false, status: 'typing',    statusText: 'Writing…' },
  { name: 'You',    you: true,  status: 'typing',    statusText: 'Your turn' },
];

function useClock() {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  const pad = (n) => String(n).padStart(2, '0');
  const h12 = ((now.getHours() + 11) % 12) + 1;
  const ampm = now.getHours() < 12 ? 'AM' : 'PM';
  return {
    timeShort: `${h12}:${pad(now.getMinutes())} ${ampm}`,
    dateShort: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${String(now.getFullYear()).slice(-2)}`,
    full: now.toLocaleString(),
  };
}

function useFakeTimer(active, start = 180) {
  const [secs, setSecs] = React.useState(start);
  React.useEffect(() => { setSecs(start); }, [start, active]);
  React.useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return secs;
}

function App() {
  const tweakDefaults = /*EDITMODE-BEGIN*/{
    "theme": "light"
  }/*EDITMODE-END*/;
  const [t, setTweak] = useTweaks(tweakDefaults);

  const [screen, setScreen] = React.useState('home');

  const [state, setState] = React.useState({
    nickname: 'You',
    roomCode: '4829',
    lang: 'python',
    time: 'normal',
    bots: true,
    spectators: false,
    players: INITIAL_PLAYERS,
    gamePlayers: INITIAL_GAME_PLAYERS,
  });

  // Sync theme to <html data-theme="…">
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', t.theme || 'light');
  }, [t.theme]);

  const toggleTheme = () => setTweak('theme', t.theme === 'dark' ? 'light' : 'dark');
  const clock = useClock();
  const gameSeconds = useFakeTimer(
    screen === 'write' || screen === 'describe' || screen === 'reimplement',
    state.time === 'fast' ? 90 : state.time === 'long' ? 300 : 180
  );

  // Build the Superbar taskbar items reflecting an in-progress session
  const taskbarItems = [
    { id: 'home',        label: 'Code Telephone', open: true,
      icon: <CTLogoMark size={18} /> },
    ...(screen === 'lobby' || screen === 'write' || screen === 'describe' ||
        screen === 'reimplement' || screen === 'waiting' || screen === 'reveal' ? [{
        id: screen, label: SCREEN_LABELS[screen] + ' · Room 4829', open: true,
        icon: <span className="tb-glyph">
          <svg width="14" height="14" viewBox="0 0 14 14">
            <rect x="1.5" y="2" width="11" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3 5h8 M3 7h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span> }] : []),
  ];

  const screenLabel = SCREEN_LABELS[screen];

  // Pick the active screen component
  const renderScreen = () => {
    const common = { state, setState, navigate: setScreen };
    switch (screen) {
      case 'home':        return <HomeScreen {...common} />;
      case 'lobby':       return <LobbyScreen {...common} />;
      case 'write':       return <WriteScreen {...common} state={{ ...state, timer: gameSeconds }} />;
      case 'describe':    return <DescribeScreen {...common} state={{ ...state, timer: gameSeconds }} />;
      case 'reimplement': return <ReimplementScreen {...common} state={{ ...state, timer: gameSeconds }} />;
      case 'waiting':     return <WaitingScreen {...common} />;
      case 'reveal':      return <RevealScreen {...common} />;
      case 'desktop':     return null; // just the desktop
      default:            return null;
    }
  };

  return (
    <div className="desktop-root">
      <MenuBar
        clock={clock}
        theme={t.theme}
        onToggleTheme={toggleTheme}
        onSelectScreen={setScreen}
        screenLabel={screenLabel}
      />

      <div className="window-area">
        <BlissWallpaper theme={t.theme} />

        {/* Desktop icons — visible when no window is open OR always behind windows */}
        <DesktopIcons onLaunch={setScreen} />

        {/* Active window */}
        <div className="window-stack">
          {renderScreen()}
        </div>

        {/* "Empty desktop" hint when nothing is open */}
        {screen === 'desktop' && (
          <div className="desktop-hint">
            <div className="desktop-hint__card">
              <CTLogoMark size={28} />
              <div>
                <div className="desktop-hint__title">Desktop</div>
                <div className="desktop-hint__body">Double-click an icon to open it, or pick a screen from the View menu.</div>
              </div>
              <button className="btn btn--primary btn--md" onClick={() => setScreen('home')}>
                Open Code Telephone
              </button>
            </div>
          </div>
        )}
      </div>

      <Superbar
        items={taskbarItems}
        activeScreen={screen}
        onSelect={setScreen}
        clock={clock}
      />

      {/* Tweaks panel — light/dark + jump-to-screen */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme">
          <TweakRadio
            label="Mode"
            value={t.theme}
            onChange={(v) => setTweak('theme', v)}
            options={['light', 'dark']}
          />
        </TweakSection>
        <TweakSection label="Jump to screen">
          <div className="tweak-screens">
            {Object.entries(SCREEN_LABELS).map(([key, label]) => (
              <button
                key={key}
                className={`tweak-screen ${screen === key ? 'is-active' : ''}`}
                onClick={() => setScreen(key)}
              >{label}</button>
            ))}
          </div>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

/* Desktop shortcut icons — Win7 vibe, with Tahoe radius */
function DesktopIcons({ onLaunch }) {
  const icons = [
    { id: 'home', label: 'Code\nTelephone', glyph: <CTLogoMark size={32} /> },
    { id: 'lobby', label: 'Waiting\nRoom', glyph:
      <svg width="32" height="32" viewBox="0 0 32 32">
        <defs>
          <linearGradient id="dskA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd16e" /><stop offset="1" stopColor="#b87410" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="28" height="28" rx="6" fill="url(#dskA)" stroke="rgba(255,255,255,0.6)"/>
        <circle cx="11" cy="14" r="3" fill="#fff" />
        <circle cx="21" cy="14" r="3" fill="#fff" />
        <path d="M8 24c1.5-3 4-4.5 8-4.5s6.5 1.5 8 4.5" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg> },
    { id: 'reveal', label: 'Round\nReveal', glyph:
      <svg width="32" height="32" viewBox="0 0 32 32">
        <defs>
          <linearGradient id="dskB" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#a8e07f" /><stop offset="1" stopColor="#2f7e1c" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="28" height="28" rx="6" fill="url(#dskB)" stroke="rgba(255,255,255,0.6)"/>
        <path d="M11 22 L11 16 M16 22 L16 11 M21 22 L21 14"
              stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      </svg> },
  ];
  return (
    <div className="desktop-icons">
      {icons.map(i => (
        <button key={i.id} className="dicon" onDoubleClick={() => onLaunch(i.id)}>
          <span className="dicon__glyph">{i.glyph}</span>
          <span className="dicon__label">{i.label}</span>
        </button>
      ))}
    </div>
  );
}

window.App = App;
