/* global React, Button, GlassPanel, Avatar, StatusDot, Pill, Timer,
          PhaseTracker, CodeView, NotepadView, Window, CTLogoMark */

/* ─────────────────────────────────────────────────────────────────
   Gameplay screens — Write · Describe · Reimplement · Waiting
   All share a common "GameShell" that draws the player rail, phase
   tracker, timer, ready count and submit row.
   ───────────────────────────────────────────────────────────────── */

const PHASES = ['Write', 'Describe', 'Reimplement'];

const PHASE_PROMPT = {
  write: { tag: 'YOUR PROMPT', title: 'Reverse a string',
    body: 'Write a function that takes a string and returns it with the characters in reverse order. The original string should not be modified.\n\nExamples:\n  "hello"  →  "olleh"\n  ""       →  ""\n  "a"      →  "a"' },
};

const STARTER_CODE_PY = `def reverse_string(s):
    # your code here
    pass`;

function PlayerRail({ players, currentPhaseIdx }) {
  return (
    <aside className="rail">
      <div className="rail__section">
        <div className="rail__title">Players · 4 of 4</div>
        <div className="rail__players">
          {players.map(p => (
            <div key={p.name} className={`rail-player ${p.you ? 'is-you' : ''}`}>
              <Avatar name={p.name} size={28} />
              <div className="rail-player__info">
                <div className="rail-player__name">{p.name}{p.you && <span className="rail-player__you">you</span>}</div>
                <div className="rail-player__state">
                  <StatusDot state={p.status} />
                  <span>{p.statusText}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rail__section rail__section--phases">
        <div className="rail__title">Round 1 · Phase {currentPhaseIdx + 1} of 3</div>
        <div className="rail__phases">
          {PHASES.map((p, i) => (
            <div key={p} className={`rail-phase ${i < currentPhaseIdx ? 'is-done' : ''} ${i === currentPhaseIdx ? 'is-active' : ''}`}>
              <span className="rail-phase__num">
                {i < currentPhaseIdx
                  ? <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4 L3.5 6 L7 2" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  : i + 1}
              </span>
              <span className="rail-phase__label">{p}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rail__section rail__section--tips">
        <div className="rail__title">Tip</div>
        <div className="rail__tip">
          Clean naming carries meaning further than clever tricks. The AI judge
          weighs intent, not syntax.
        </div>
      </div>
    </aside>
  );
}

function GameShell({ phaseIdx, players, seconds, readyCount, onSubmit, onSkip, children, screenLabel, submitDisabled }) {
  return (
    <div className="game">
      <PlayerRail players={players} currentPhaseIdx={phaseIdx} />

      <div className="game__main">
        <div className="game__topbar">
          <div className="game__phase">
            <Pill tone="active">PHASE {phaseIdx + 1} OF 3</Pill>
            <h2 className="game__phase-title">{PHASES[phaseIdx]} <span className="game__phase-sub">— {screenLabel}</span></h2>
          </div>
          <Timer seconds={seconds} />
        </div>

        <div className="game__content">{children}</div>

        <div className="game__footer">
          <div className="game__footer-left">
            <span className="game__ready">{readyCount} of {players.length} ready</span>
            <span className="game__dot">·</span>
            <span>Round auto-submits at 0:00</span>
          </div>
          <div className="game__footer-actions">
            <Button variant="ghost" onClick={onSkip}>Skip turn</Button>
            <Button variant="primary" onClick={onSubmit} disabled={submitDisabled}>
              Submit →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────── WRITE ────── */
function WriteScreen({ state, setState, navigate }) {
  const [lang, setLang] = React.useState('python');
  const [codeByLang, setCodeByLang] = React.useState(
    () => Object.fromEntries(LANGS.map(l => [l.value, l.starter]))
  );
  const code = codeByLang[lang];
  const setCode = (v) => setCodeByLang(c => ({ ...c, [lang]: v }));

  // Heuristic: any non-comment substantive code present?
  const meaningful = code
    .split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('//'))
    .join('\n')
    .trim().length > 12;

  return (
    <Window
      title="Code Telephone — Round 1"
      subtitle="You're the seed: write any function"
      icon={<CTLogoMark size={14} />}
      width={Math.min(1300, window.innerWidth - 80)}
      height={Math.min(720, window.innerHeight - 120)}
      centered
      noPadding flush
      onClose={() => navigate('lobby')}
    >
      <GameShell
        phaseIdx={0}
        players={state.gamePlayers}
        seconds={state.timer}
        readyCount={1}
        screenLabel="write any function you want"
        submitDisabled={!meaningful}
        onSubmit={() => navigate('describe')}
        onSkip={() => navigate('describe')}
      >
        <div className="game-write game-write--free">
          <div className="seed-bar">
            <div className="seed-bar__left">
              <span className="seed-bar__tag">YOU'RE THE SEED</span>
              <h3 className="seed-bar__title">Write any function you want.</h3>
              <p className="seed-bar__sub">
                Pick something with a little character — clever names, sneaky one-liners, a confusing
                helper. Whatever it is, it has to make sense to <b>one</b> teammate downstream. The
                more interesting the seed, the more fun the chain.
              </p>
              <div className="seed-bar__tips">
                <span className="seed-tip">✦ Keep it under ~20 lines</span>
                <span className="seed-tip">✦ Variable names matter</span>
                <span className="seed-tip">✦ No external libraries</span>
              </div>
            </div>
            <div className="seed-bar__right">
              <LanguagePicker value={lang} onChange={setLang} />
            </div>
          </div>

          <div className="game-write__editor game-write__editor--full">
            <CodeView code={code} onChange={setCode} lang={lang} />
          </div>
        </div>
      </GameShell>
    </Window>
  );
}

/* ────── DESCRIBE ────── */
function DescribeScreen({ state, navigate }) {
  const [text, setText] = React.useState('');

  return (
    <Window
      title="Code Telephone — Round 1"
      subtitle="Describe Amrita's code in plain English"
      icon={<CTLogoMark size={14} />}
      width={Math.min(1300, window.innerWidth - 80)}
      height={Math.min(720, window.innerHeight - 120)}
      centered noPadding flush
      onClose={() => navigate('lobby')}
    >
      <GameShell
        phaseIdx={1}
        players={state.gamePlayers}
        seconds={state.timer}
        readyCount={1}
        screenLabel="describe what it does"
        submitDisabled={text.trim().length < 8}
        onSubmit={() => navigate('reimplement')}
        onSkip={() => navigate('reimplement')}
      >
        <div className="game-describe">
          <div className="game-describe__pane">
            <div className="pane-head">
              <span className="pane-head__tag">FROM</span>
              <Avatar name="Amrita" size={20} />
              <span className="pane-head__name">Amrita's code</span>
              <Pill tone="ghost">read-only</Pill>
            </div>
            <CodeView readOnly lang="python" code={`def reverse_string(s):
    return s[::-1]`} />
          </div>

          <div className="game-describe__pane">
            <div className="pane-head">
              <span className="pane-head__tag pane-head__tag--you">TO</span>
              <Avatar name="Lukas" size={20} />
              <span className="pane-head__name">Lukas (next player)</span>
              <Pill tone="accent">your turn</Pill>
            </div>
            <NotepadView text={text} onChange={setText} />
          </div>
        </div>
      </GameShell>
    </Window>
  );
}

/* ────── REIMPLEMENT ────── */
function ReimplementScreen({ state, navigate }) {
  const [lang, setLang] = React.useState('python');
  const [codeByLang, setCodeByLang] = React.useState(
    () => Object.fromEntries(LANGS.map(l => [l.value, l.starter]))
  );
  const code = codeByLang[lang];
  const setCode = (v) => setCodeByLang(c => ({ ...c, [lang]: v }));

  return (
    <Window
      title="Code Telephone — Round 1"
      subtitle="Write the function from Lukas's description"
      icon={<CTLogoMark size={14} />}
      width={Math.min(1300, window.innerWidth - 80)}
      height={Math.min(720, window.innerHeight - 120)}
      centered noPadding flush
      onClose={() => navigate('lobby')}
    >
      <GameShell
        phaseIdx={2}
        players={state.gamePlayers}
        seconds={state.timer}
        readyCount={1}
        screenLabel="reimplement from the description"
        onSubmit={() => navigate('waiting')}
        onSkip={() => navigate('waiting')}
      >
        <div className="game-describe">
          <div className="game-describe__pane">
            <div className="pane-head">
              <span className="pane-head__tag">FROM</span>
              <Avatar name="Lukas" size={20} />
              <span className="pane-head__name">Lukas's description</span>
              <Pill tone="ghost">read-only</Pill>
            </div>
            <NotepadView readOnly text={
`Takes a string of characters and gives back a new string
with everything in the opposite order. So the last letter
becomes the first, and so on. The input is left as-is —
the function returns a fresh string, doesn't mutate.

Empty strings come back empty. Single characters come back
unchanged. Works on unicode (one code-point per "slot").`} />
          </div>

          <div className="game-describe__pane">
            <div className="pane-head">
              <span className="pane-head__tag pane-head__tag--you">TO</span>
              <Avatar name="Mei" size={20} />
              <span className="pane-head__name">Mei (next player)</span>
              <Pill tone="accent">your turn</Pill>
              <div className="pane-head__lang">
                <LanguagePicker value={lang} onChange={setLang} label={null} />
              </div>
            </div>
            <CodeView code={code} onChange={setCode} lang={lang} />
          </div>
        </div>
      </GameShell>
    </Window>
  );
}

/* ────── WAITING ────── */
function WaitingScreen({ state, navigate }) {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60);
    return () => clearInterval(id);
  }, []);

  // Auto-advance after ~6s
  React.useEffect(() => {
    const id = setTimeout(() => navigate('reveal'), 6000);
    return () => clearTimeout(id);
  }, []);

  const progressLeft = Math.floor((tick * 0.6) % 320);

  return (
    <Window
      title="Code Telephone — Round 1"
      subtitle="Waiting for the rest of the chain"
      icon={<CTLogoMark size={14} />}
      width={Math.min(620, window.innerWidth - 60)}
      height={Math.min(460, window.innerHeight - 100)}
      centered
      onClose={() => navigate('lobby')}
    >
      <div className="waiting">
        <div className="waiting__head">
          <div className="waiting__icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" stroke="var(--aero-300)" strokeWidth="2" />
              <path d="M24 10 V 24 L 32 28" stroke="var(--aero-600)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            </svg>
          </div>
          <div>
            <h2 className="waiting__title">Submission received</h2>
            <p className="waiting__sub">Hang tight — we're waiting on a few more players to finish up.</p>
          </div>
        </div>

        <div className="waiting__progress" role="progressbar" aria-label="Waiting on players">
          <div className="waiting__progress-track">
            <div className="waiting__progress-march" style={{ left: progressLeft + 'px' }} />
          </div>
          <div className="waiting__progress-label">3 of 4 players submitted</div>
        </div>

        <GlassPanel className="waiting__players" padding={10}>
          {state.gamePlayers.map((p) => {
            const submitted = ['Jordan','Amrita','Lukas'].includes(p.name);
            return (
              <div key={p.name} className="waiting-row">
                <Avatar name={p.name} size={26} />
                <span className="waiting-row__name">{p.name}{p.you && <span className="player-row__badge player-row__badge--you">you</span>}</span>
                <span className="waiting-row__state">
                  {submitted
                    ? <><StatusDot state="submitted" /> Submitted</>
                    : <><StatusDot state="typing" /> Writing…</>}
                </span>
              </div>
            );
          })}
        </GlassPanel>

        <div className="waiting__hint">
          When everyone's finished, the chain reveals and the AI judge will score
          how close the reconstruction came to the original.
        </div>

        <div className="waiting__actions">
          <Button variant="ghost" onClick={() => navigate('lobby')}>Leave round</Button>
          <Button variant="primary" onClick={() => navigate('reveal')}>Skip wait (demo) →</Button>
        </div>
      </div>
    </Window>
  );
}

window.WriteScreen = WriteScreen;
window.DescribeScreen = DescribeScreen;
window.ReimplementScreen = ReimplementScreen;
window.WaitingScreen = WaitingScreen;
