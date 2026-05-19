/* global React */

/* ─────────────────────────────────────────────────────────────────
   UI primitives — buttons, inputs, glass panels, game widgets
   ───────────────────────────────────────────────────────────────── */

function Button({ variant = 'default', size = 'md', icon, children, onClick, disabled, full, className = '', ...rest }) {
  return (
    <button
      className={`btn btn--${variant} btn--${size} ${full ? 'btn--full' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {icon && <span className="btn__icon">{icon}</span>}
      <span className="btn__label">{children}</span>
    </button>
  );
}

function GlassPanel({ children, padding, className = '', tint, ...rest }) {
  return (
    <div
      className={`glass-panel ${tint ? 'glass-panel--tinted' : ''} ${className}`}
      style={{ padding, ...(tint ? { '--tint': tint } : {}) }}
      {...rest}
    >
      <span className="glass-panel__sheen" aria-hidden="true" />
      <span className="glass-panel__edge" aria-hidden="true" />
      <div className="glass-panel__body">{children}</div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, maxLength, autoFocus, full, hint, suffix }) {
  return (
    <label className={`tf ${full ? 'tf--full' : ''}`}>
      {label && <span className="tf__label">{label}</span>}
      <div className="tf__row">
        <input
          className="tf__input"
          value={value}
          onChange={e => onChange && onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoFocus={autoFocus}
        />
        {suffix && <span className="tf__suffix">{suffix}</span>}
      </div>
      {hint && <span className="tf__hint">{hint}</span>}
    </label>
  );
}

function TextArea({ value, onChange, placeholder, rows = 4, full }) {
  return (
    <textarea
      className={`tarea ${full ? 'tarea--full' : ''}`}
      value={value}
      onChange={e => onChange && onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
    />
  );
}

function Checkbox({ checked, onChange, label, disabled }) {
  return (
    <label className={`cb ${disabled ? 'is-disabled' : ''}`} onClick={(e) => { if (!disabled) onChange && onChange(!checked); }}>
      <span className={`cb__box ${checked ? 'is-checked' : ''}`}>
        {checked && (
          <svg viewBox="0 0 12 12" width="12" height="12">
            <path d="M2 6 L5 9 L10 3" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label && <span className="cb__label">{label}</span>}
    </label>
  );
}

function Radio({ value, options, onChange, name }) {
  return (
    <div className="radio-row">
      {options.map(opt => (
        <label key={opt.value} className="radio">
          <input
            type="radio"
            name={name}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span className="radio__dot"></span>
          <span className="radio__label">
            {opt.icon && <span className="radio__icon">{opt.icon}</span>}
            {opt.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/* Avatar — 6 deterministic hues seeded by name */
const AVATAR_HUES = [
  ['#7cb6f5','#2a6fb5'], ['#f5a78c','#c75032'],
  ['#9fdc8b','#3c8f4a'], ['#f5d27a','#b97f1a'],
  ['#c9a4f5','#6b3fa8'], ['#7adfd8','#2a8884'],
];
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function Avatar({ name, size = 32 }) {
  const [a, b] = AVATAR_HUES[hashStr(name) % AVATAR_HUES.length];
  const initials = name.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase().slice(0,2) || '?';
  return (
    <span className="avatar" style={{
      width: size, height: size,
      background: `linear-gradient(140deg, ${a} 0%, ${b} 100%)`,
      fontSize: Math.max(10, Math.round(size * 0.40)),
    }}>
      <span className="avatar__sheen" aria-hidden="true" />
      {initials}
    </span>
  );
}

function StatusDot({ state }) {
  return <span className={`status-dot status-dot--${state}`} aria-hidden="true" />;
}

function Pill({ children, tone = 'default', icon }) {
  return (
    <span className={`pill pill--${tone}`}>
      {icon && <span className="pill__icon">{icon}</span>}
      {children}
    </span>
  );
}

function Timer({ seconds, urgent }) {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toString().padStart(2, '0');
  const isUrgent = urgent ?? seconds <= 30;
  return (
    <div className={`timer ${isUrgent ? 'is-urgent' : ''}`}>
      <svg className="timer__icon" width="14" height="14" viewBox="0 0 14 14">
        <circle cx="7" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7 8 L7 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M7 8 L10 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M5.5 1.5 L8.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span className="timer__value">{m}:{s}</span>
    </div>
  );
}

function PhaseTracker({ phases, current }) {
  return (
    <div className="phase-tracker">
      {phases.map((p, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={i}>
            <div className={`pt-node ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}>
              <span className="pt-node__dot">
                {done
                  ? <svg viewBox="0 0 10 10" width="10" height="10"><path d="M2 5 L4 7 L8 3" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  : <span className="pt-node__num">{i + 1}</span>}
              </span>
              <span className="pt-node__label">{p}</span>
            </div>
            {i < phases.length - 1 && (
              <div className={`pt-line ${done ? 'is-done' : ''}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* Syntax-highlighter for code blocks — small + good enough across many langs */
function highlight(code, lang) {
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const kwList = (KEYWORDS[lang] || KEYWORDS.python).split(/\s+/);
  // Build a fast regex; sort longest-first so e.g. "instanceof" matches before "in"
  kwList.sort((a, b) => b.length - a.length);
  const kwRe = new RegExp('\\b(' + kwList.join('|') + ')\\b', 'g');
  const builtinRe = new RegExp('\\b(' + BUILTINS.split(/\s+/).join('|') + ')\\b', 'g');

  let html = escape(code);
  // Comments — # for python/ruby, // for c-family, /* */ for c-family
  if (lang === 'python' || lang === 'ruby') {
    html = html.replace(/(#.*$)/gm, '<span class="cm">$1</span>');
  }
  html = html.replace(/(\/\/.*$)/gm, '<span class="cm">$1</span>');
  html = html.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="cm">$1</span>');

  // Strings — single/double quoted (already HTML-entity-escaped)
  html = html.replace(/(&quot;[^&\n]*?&quot;|&#39;[^&\n]*?&#39;|`[^`\n]*?`)/g, '<span class="st">$1</span>');

  // Numbers
  html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="nu">$1</span>');

  // Keywords + builtins (skip if already inside a span)
  html = html.replace(kwRe, '<span class="kw">$1</span>');
  html = html.replace(builtinRe, '<span class="bn">$1</span>');

  // Function names following def/function/fn/func
  html = html.replace(/<span class="kw">(def|function|fn|func|fun)<\/span>(\s+)(\w+)/g,
    '<span class="kw">$1</span>$2<span class="fn">$3</span>');

  return html;
}

function CodeView({ code, lang = 'python', readOnly, onChange, showLineNumbers = true, className = '' }) {
  const lines = code.split('\n');
  const ref = React.useRef(null);
  const langDef = LANG_BY[lang] || LANG_BY.python;

  return (
    <div className={`code-view ${readOnly ? 'is-readonly' : ''} ${className}`}>
      <div className="code-view__topbar">
        <span className="code-view__filename">
          solution.{langDef.ext}
        </span>
        <span className="code-view__lang"
              style={{
                background: langDef.color + '22',
                color: langDef.color,
                borderColor: langDef.color + '55'
              }}>
          <span className="code-view__lang-glyph">{langDef.glyph}</span>
          {langDef.label}
        </span>
        {readOnly && <span className="code-view__ro-badge">READ ONLY</span>}
      </div>
      <div className="code-view__body">
        {showLineNumbers && (
          <div className="code-view__gutter">
            {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
          </div>
        )}
        <div className="code-view__scroll">
          <pre className="code-view__pre"
               dangerouslySetInnerHTML={{ __html: highlight(code, lang) }} />
          {!readOnly && (
            <textarea
              ref={ref}
              className="code-view__textarea"
              value={code}
              onChange={(e) => onChange && onChange(e.target.value)}
              spellCheck="false"
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const t = e.target;
                  const start = t.selectionStart;
                  const end = t.selectionEnd;
                  const next = code.slice(0, start) + '    ' + code.slice(end);
                  onChange && onChange(next);
                  setTimeout(() => { t.selectionStart = t.selectionEnd = start + 4; }, 0);
                }
              }}
            />
          )}
        </div>
      </div>
      <div className="code-view__statusbar">
        <span>Ln {lines.length}, Col 1</span>
        <span>{code.length} chars · {lines.length} lines</span>
        <span>UTF-8 · LF · spaces: 4</span>
      </div>
    </div>
  );
}

/* Notepad-style read-only text panel */
function NotepadView({ text, onChange, readOnly, label }) {
  return (
    <div className={`notepad ${readOnly ? 'is-readonly' : ''}`}>
      <div className="notepad__topbar">
        <span className="notepad__title">{label || 'Description.txt'} {readOnly ? '— Read Only' : ''}</span>
        <span className="notepad__pill">Plain English</span>
      </div>
      <div className="notepad__body">
        {readOnly ? (
          <pre className="notepad__pre">{text}</pre>
        ) : (
          <textarea
            className="notepad__textarea"
            value={text}
            onChange={(e) => onChange && onChange(e.target.value)}
            placeholder="Describe what this function does in plain English…"
          />
        )}
      </div>
      <div className="notepad__statusbar">
        <span>{text.length} chars</span>
        <span>·</span>
        <span>{text.split(/\s+/).filter(Boolean).length} words</span>
        <span style={{ marginLeft: 'auto' }}>Ln {text.split('\n').length}</span>
      </div>
    </div>
  );
}

/* Languages — shared definitions used by picker + code view + starter */
const LANGS = [
  { value: 'python', label: 'Python',     glyph: 'Py',  color: '#3776ab', ext: 'py',  starter: `def ` },
  { value: 'js',     label: 'JavaScript', glyph: 'JS',  color: '#b9a000', ext: 'js',  starter: `function ` },
  { value: 'ts',     label: 'TypeScript', glyph: 'TS',  color: '#2f74c0', ext: 'ts',  starter: `function ` },
  { value: 'java',   label: 'Java',       glyph: 'Jv',  color: '#b3361f', ext: 'java', starter: `public class Solution {\n    \n}` },
  { value: 'c',      label: 'C',          glyph: 'C',   color: '#5687b0', ext: 'c',   starter: `#include <stdio.h>\n\n` },
  { value: 'cpp',    label: 'C++',        glyph: 'C++', color: '#00599c', ext: 'cpp', starter: `#include <iostream>\n\nint main() {\n    \n    return 0;\n}` },
  { value: 'cs',     label: 'C#',         glyph: 'C#',  color: '#6c1aa0', ext: 'cs',  starter: `using System;\n\npublic class Solution {\n    \n}` },
  { value: 'rust',   label: 'Rust',       glyph: 'Rs',  color: '#b7410e', ext: 'rs',  starter: `fn ` },
  { value: 'go',     label: 'Go',         glyph: 'Go',  color: '#00add8', ext: 'go',  starter: `package main\n\nfunc ` },
  { value: 'ruby',   label: 'Ruby',       glyph: 'Rb',  color: '#b32134', ext: 'rb',  starter: `def \nend` },
  { value: 'swift',  label: 'Swift',      glyph: 'Sw',  color: '#f05138', ext: 'swift', starter: `func ` },
  { value: 'kotlin', label: 'Kotlin',     glyph: 'Kt',  color: '#7f52ff', ext: 'kt',  starter: `fun ` },
];
const LANG_BY = Object.fromEntries(LANGS.map(l => [l.value, l]));

/* Per-language keyword sets — enough for visual syntax highlighting */
const KEYWORDS = {
  python: 'def return if else elif for while in not and or None True False import from as class lambda with try except finally raise yield pass break continue global nonlocal is',
  js:     'function return if else for while const let var class new null undefined true false import export from as async await try catch finally throw of in typeof instanceof do switch case break continue',
  ts:     'function return if else for while const let var class new null undefined true false import export from as async await try catch finally throw of in typeof instanceof do switch case break continue interface type enum readonly public private protected',
  java:   'public private protected class interface extends implements return if else for while new null true false import package static final void int double float long short byte char boolean String try catch finally throw throws this super abstract synchronized volatile transient enum switch case break continue do',
  c:      'int char float double void short long unsigned signed return if else for while do switch case break continue struct typedef enum static const sizeof include define',
  cpp:    'int char float double void short long unsigned signed return if else for while do switch case break continue struct typedef enum static const sizeof class public private protected virtual override new delete this nullptr true false namespace using template typename auto include define',
  cs:     'public private protected class interface return if else for while new null true false using namespace static readonly void int double float string bool var this base virtual override async await try catch finally throw foreach in switch case break continue',
  rust:   'fn let mut const static return if else for while loop in match struct enum trait impl pub use mod ref move self Self where as crate true false None Some Ok Err',
  go:     'func return if else for switch case break continue var const type struct interface package import map chan range defer go nil true false',
  ruby:   'def end class module return if else elsif unless do while until for in then case when begin rescue ensure raise yield nil true false self super require',
  swift:  'func let var return if else for in while guard switch case default break continue class struct enum protocol extension import public private internal fileprivate open static final override init self Self true false nil',
  kotlin: 'fun val var return if else for in while when class object interface companion data sealed enum import package public private internal protected open override true false null this',
};
const BUILTINS = 'len print range str int float list dict set tuple enumerate map filter reversed sorted sum min max abs console log Math Array Object JSON System out println printf cout cin endl Vec String println main vec';

/* Segmented language picker — popover style for 12+ languages */
function LanguagePicker({ value, onChange, label = 'Your language' }) {
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState({ top: 0, left: 0, width: 320 });
  const ref = React.useRef(null);
  const triggerRef = React.useRef(null);

  // Position the popover under the trigger using viewport coords (so it
  // escapes any ancestor overflow:hidden / stacking contexts).
  const reposition = React.useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const popW = 320;
    const popH = 360; // estimate; we just need to keep it on-screen
    // Prefer right-aligned with the trigger
    let left = r.right - popW;
    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));
    // If not enough room below, flip above
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow > popH + 12 || r.top < popH + 12
      ? r.bottom + 6
      : r.top - popH - 6;
    setCoords({ top, left, width: popW });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    reposition();
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target) &&
          triggerRef.current && !triggerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  const current = LANG_BY[value] || LANGS[0];

  const popover = open && ReactDOM.createPortal(
    <div className="lang-popover" ref={ref}
         style={{ top: coords.top, left: coords.left, width: coords.width }}>
      <div className="lang-popover__head">Choose language</div>
      <div className="lang-popover__grid">
        {LANGS.map(opt => (
          <button
            key={opt.value}
            className={`lang-opt ${value === opt.value ? 'is-active' : ''}`}
            onClick={() => { onChange(opt.value); setOpen(false); }}
            type="button"
          >
            <span className="lang-opt__glyph" style={{ color: opt.color }}>{opt.glyph}</span>
            <span className="lang-opt__name">{opt.label}</span>
            {value === opt.value && (
              <svg className="lang-opt__check" width="10" height="10" viewBox="0 0 10 10">
                <path d="M1 5 L4 8 L9 2" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );

  return (
    <div className={`lang-picker ${open ? 'is-open' : ''}`}>
      {label && <span className="lang-picker__label">{label}</span>}
      <button ref={triggerRef} className="lang-trigger" onClick={() => setOpen(o => !o)} type="button">
        <span className="lang-trigger__glyph" style={{ color: current.color }}>{current.glyph}</span>
        <span className="lang-trigger__name">{current.label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" className="lang-trigger__chev">
          <path d="M1 1 L5 5 L9 1" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {popover}
    </div>
  );
}

window.Button = Button;
window.GlassPanel = GlassPanel;
window.TextField = TextField;
window.TextArea = TextArea;
window.Checkbox = Checkbox;
window.Radio = Radio;
window.Avatar = Avatar;
window.StatusDot = StatusDot;
window.Pill = Pill;
window.Timer = Timer;
window.PhaseTracker = PhaseTracker;
window.CodeView = CodeView;
window.NotepadView = NotepadView;
window.LanguagePicker = LanguagePicker;
window.LANGS = LANGS;
window.LANG_BY = LANG_BY;
