/* global React, Button, TextField, TextArea, Checkbox, Radio, GlassPanel,
          Avatar, StatusDot, Pill, Timer, PhaseTracker, CodeView, NotepadView,
          Window, CTLogoMark */

/* ─────────────────────────────────────────────────────────────────
   Meta screens — Home, Lobby, Reveal
   ───────────────────────────────────────────────────────────────── */

/* ─────────── HOME / WIZARD ─────────── */
function HomeScreen({ state, setState, navigate }) {
  const [step, setStep] = React.useState(1);
  const [nickname, setNickname] = React.useState(state.nickname || 'Jordan');
  const [code, setCode] = React.useState('');

  const finish = (method) => {
    setState(s => ({ ...s, nickname }));
    navigate('lobby');
  };

  return (
    <Window
      title="Code Telephone"
      subtitle={step === 1 ? 'Set up' : 'Join a game'}
      icon={<CTLogoMark size={14} />}
      width={Math.min(520, window.innerWidth - 60)}
      height={Math.min(460, window.innerHeight - 100)}
      centered
      onClose={() => navigate('desktop')}
    >
      <div className="home">
        {/* Hero block */}
        <div className="home__hero">
          <div className="home__hero-mark"><CTLogoMark size={44} /></div>
          <div>
            <h1 className="home__title">Code Telephone</h1>
            <p className="home__sub">Pass a function down a chain. See what survives.</p>
          </div>
        </div>

        {step === 1 ? (
          <>
            <div className="home__field">
              <TextField
                label="Your nickname"
                value={nickname}
                onChange={setNickname}
                placeholder="e.g. Jordan"
                maxLength={20}
                full autoFocus
                hint={`${nickname.length}/20`}
              />
            </div>
            <div className="home__actions home__actions--single">
              <Button variant="primary" size="lg" full
                onClick={() => nickname.trim() && setStep(2)}
                disabled={!nickname.trim()}>
                Continue →
              </Button>
            </div>
            <div className="home__foot">
              <span>By continuing you join a public lobby. No account required.</span>
            </div>
          </>
        ) : (
          <>
            <div className="home__choices">
              <button className="choice" onClick={() => finish('create')}>
                <span className="choice__icon" style={{ background: 'linear-gradient(135deg,#7cd5ff,#2a7ab8)' }}>
                  <svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
                </span>
                <span className="choice__text">
                  <span className="choice__title">Create room</span>
                  <span className="choice__sub">Invite friends with a 4-digit code</span>
                </span>
              </button>

              <button className="choice" onClick={() => setStep(3)}>
                <span className="choice__icon" style={{ background: 'linear-gradient(135deg,#a8e07f,#3a8f4a)' }}>
                  <svg width="20" height="20" viewBox="0 0 20 20"><path d="M3 10l4 4 10-10" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                </span>
                <span className="choice__text">
                  <span className="choice__title">Join with code</span>
                  <span className="choice__sub">Enter a friend's room code</span>
                </span>
              </button>

              <button className="choice" onClick={() => finish('quick')}>
                <span className="choice__icon" style={{ background: 'linear-gradient(135deg,#ffd16e,#e8a030)' }}>
                  <svg width="20" height="20" viewBox="0 0 20 20"><path d="M11 2L4 12h5l-1 6 7-10h-5z" fill="#fff" /></svg>
                </span>
                <span className="choice__text">
                  <span className="choice__title">Quick play</span>
                  <span className="choice__sub">Match with anyone, anywhere</span>
                </span>
              </button>
            </div>
            <div className="home__nav">
              <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
              <span className="home__signed">Signed in as <b>{nickname}</b></span>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="modal-overlay" onClick={() => setStep(2)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h2 className="modal__title">Join with code</h2>
              <p className="modal__body">Enter the 4-letter room code your host shared.</p>
              <div className="modal__field">
                <TextField
                  value={code}
                  onChange={(v) => setCode(v.toUpperCase().slice(0,4))}
                  placeholder="ABCD"
                  maxLength={4}
                  full autoFocus
                />
              </div>
              <div className="modal__actions">
                <Button variant="ghost" onClick={() => setStep(2)}>Cancel</Button>
                <Button variant="primary" disabled={code.length < 4} onClick={() => finish('join')}>
                  Join
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Window>
  );
}

/* ─────────── LOBBY / WAITING ROOM ─────────── */
function LobbyScreen({ state, setState, navigate }) {
  const players = state.players;
  const me = players.find(p => p.you);
  const allReady = players.every(p => p.ready);
  const readyCount = players.filter(p => p.ready).length;

  const toggleReady = () => {
    setState(s => ({
      ...s,
      players: s.players.map(p => p.you ? { ...p, ready: !p.ready } : p)
    }));
  };
  const setLang = (lang) => setState(s => ({ ...s, lang }));

  return (
    <Window
      title={`Room ${state.roomCode}`}
      subtitle="6 of 6 seats"
      icon={<CTLogoMark size={14} />}
      width={Math.min(680, window.innerWidth - 60)}
      height={Math.min(580, window.innerHeight - 100)}
      centered
      onClose={() => navigate('home')}
      toolbar={
        <div className="lobby-tools">
          <Pill tone="accent" icon={<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" fill="currentColor"/></svg>}>
            Public Room
          </Pill>
          <span className="lobby-tools__code">
            Code <code className="lobby-code">{state.roomCode}</code>
            <button className="copy-btn" title="Copy" onClick={() => navigator.clipboard?.writeText(state.roomCode)}>
              <svg width="11" height="11" viewBox="0 0 11 11"><rect x="2.5" y="2.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" /><rect x="0.5" y="0.5" width="6" height="6" rx="1" fill="white" stroke="currentColor" /></svg>
            </button>
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
            Waiting for {6 - readyCount} more {6 - readyCount === 1 ? 'player' : 'players'} to ready up
          </span>
        </div>
      }
    >
      <div className="lobby">
        <div className="lobby__col">
          <h3 className="lobby__h">Players · {readyCount}/{players.length} ready</h3>
          <GlassPanel className="player-list" padding={8}>
            {players.map(p => (
              <div key={p.name} className={`player-row ${p.you ? 'is-you' : ''}`}>
                <Avatar name={p.name} size={32} />
                <div className="player-row__main">
                  <div className="player-row__name">
                    {p.name}
                    {p.host && <span className="player-row__badge">host</span>}
                    {p.you && <span className="player-row__badge player-row__badge--you">you</span>}
                  </div>
                  <div className="player-row__meta">
                    {p.ready ? 'Ready to play' : p.afk ? 'Away' : 'Setting up…'}
                  </div>
                </div>
                <Pill tone={p.ready ? 'done' : 'ghost'}>
                  {p.ready
                    ? <><svg width="9" height="9" viewBox="0 0 9 9"><path d="M1 4.5L3.5 7L8 2" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg> Ready</>
                    : 'Waiting'}
                </Pill>
              </div>
            ))}
          </GlassPanel>
        </div>

        <div className="lobby__col">
          <h3 className="lobby__h">Game settings</h3>
          <GlassPanel className="lobby__settings" padding={14}>
            <div className="setting">
              <div className="setting__label">Round timing</div>
              <Radio name="time" value={state.time || 'normal'} onChange={(v) => setState(s => ({ ...s, time: v }))}
                options={[
                  { value: 'fast',   label: '90s · sprint' },
                  { value: 'normal', label: '3 min · classic' },
                  { value: 'long',   label: '5 min · relaxed' },
                ]} />
            </div>
            <div className="setting">
              <div className="setting__label">Languages</div>
              <div className="setting__note">
                Each player picks their own language during Write and Reimplement.
                The AI judge normalises across them.
              </div>
            </div>
            <div className="setting">
              <Checkbox
                checked={state.bots}
                onChange={(v) => setState(s => ({ ...s, bots: v }))}
                label="Fill empty seats with bots if a player leaves" />
            </div>
            <div className="setting">
              <Checkbox
                checked={state.spectators}
                onChange={(v) => setState(s => ({ ...s, spectators: v }))}
                label="Allow spectators (read-only viewers)" />
            </div>
          </GlassPanel>

          <div className="lobby__actions">
            <Button variant={me.ready ? 'default' : 'primary'} onClick={toggleReady}>
              {me.ready ? '✓ I\'m ready' : 'Mark me ready'}
            </Button>
            <Button variant="primary" disabled={!allReady} onClick={() => navigate('write')}>
              Start game →
            </Button>
          </div>
          {!allReady && (
            <div className="lobby__hint">Host can start when all players are ready.</div>
          )}
        </div>
      </div>
    </Window>
  );
}

/* ─────────── REVEAL / SCORING ─────────── */
function RevealScreen({ state, navigate }) {
  const original = `def reverse_string(s: str) -> str:
    """Return s reversed."""
    return s[::-1]`;
  const intermediateDesc = `Takes a string and returns it
with the characters in reverse order.`;
  const reconstructed = `def flip(text):
    result = ""
    for ch in text:
        result = ch + result
    return result`;

  const [counted, setCounted] = React.useState(0);
  React.useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 3; if (i >= 87) { i = 87; clearInterval(id); }
      setCounted(i);
    }, 30);
    return () => clearInterval(id);
  }, []);

  const chain = [
    { who: 'Jordan', stage: 'Code',         blurb: 's[::-1]',                  color: '#7cb6f5' },
    { who: 'Amrita', stage: 'Description',  blurb: '“Reverses the chars”',     color: '#f5a78c' },
    { who: 'Lukas',  stage: 'Code',         blurb: 'for loop, prepend',        color: '#9fdc8b' },
  ];

  return (
    <Window
      title="Round 1 — Reveal"
      subtitle="Semantic match scored by the AI judge"
      icon={<CTLogoMark size={14} />}
      width={Math.min(1080, window.innerWidth - 60)}
      height={Math.min(640, window.innerHeight - 100)}
      centered
      onClose={() => navigate('home')}
    >
      <div className="reveal">
        <div className="reveal__head">
          <div>
            <h2 className="reveal__title">The chain</h2>
            <div className="reveal__sub">Trace how the function moved through the room</div>
          </div>
          <Pill tone="active">Round 1 of 4</Pill>
        </div>

        <div className="chain-row">
          {chain.map((n, i) => (
            <React.Fragment key={i}>
              <div className="chain-node">
                <div className="chain-node__head">
                  <Avatar name={n.who} size={24} />
                  <span className="chain-node__name">{n.who}</span>
                </div>
                <div className="chain-node__stage">{n.stage}</div>
                <div className="chain-node__preview">{n.blurb}</div>
              </div>
              {i < chain.length - 1 && (
                <svg className="chain-arrow" width="40" height="20" viewBox="0 0 40 20">
                  <path d="M0 10 H30 M22 4 L30 10 L22 16" stroke="var(--aero-500)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="reveal__body">
          <div className="reveal__panes">
            <div className="reveal__pane">
              <div className="reveal__pane-head">
                <span className="reveal__pane-tag" style={{ background: '#7cb6f5' }}>ORIGINAL</span>
                <span>Jordan · prompt → code</span>
              </div>
              <CodeView code={original} lang="python" readOnly />
            </div>
            <div className="reveal__pane">
              <div className="reveal__pane-head">
                <span className="reveal__pane-tag" style={{ background: '#c9a4f5' }}>RECONSTRUCTED</span>
                <span>Mei · description → code</span>
              </div>
              <CodeView code={reconstructed} lang="python" readOnly />
            </div>
          </div>

          <aside className="reveal__score">
            <div className="reveal__score-block">
              <div className="reveal__score-label">Semantic match</div>
              <div className="reveal__score-num">{counted}<span>%</span></div>
              <div className="reveal__score-bar">
                <div className="reveal__score-bar-fill" style={{ width: counted + '%' }} />
              </div>
              <div className="reveal__score-note">Behavioural equivalence confirmed on 12 / 12 tests.</div>
            </div>

            <div className="reveal__elo">
              <div className="reveal__elo-label">ELO change</div>
              {[
                { name: 'Jordan', d: +8 }, { name: 'Amrita', d: +12 },
                { name: 'Lukas',  d: -4 }, { name: 'Mei',    d: +6 },
              ].map(p => (
                <div className="reveal__elo-row" key={p.name}>
                  <Avatar name={p.name} size={20} />
                  <span>{p.name}</span>
                  <span className={`reveal__elo-d ${p.d > 0 ? 'is-pos' : 'is-neg'}`}>
                    {p.d > 0 ? '+' : ''}{p.d}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className="reveal__actions">
          <Button variant="ghost">View replay</Button>
          <Button variant="ghost">Share chain</Button>
          <Button variant="primary" onClick={() => navigate('home')}>Play again →</Button>
        </div>
      </div>
    </Window>
  );
}

window.HomeScreen = HomeScreen;
window.LobbyScreen = LobbyScreen;
window.RevealScreen = RevealScreen;
