/* global React */

/* ─────────────────────────────────────────────────────────────────
   Chrome: MenuBar (top, Tahoe) · Superbar (bottom, Win7) · Window
   ───────────────────────────────────────────────────────────────── */

/* ── Code Telephone logo lockup (replaces the Win7 Start Orb) ── */
function CTLogoMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32"
         style={{ display: 'block', filter: 'drop-shadow(0 1px 0 rgba(255,255,255,0.4))' }}>
      <defs>
        <linearGradient id="ctTile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#7cd5ff" />
          <stop offset="50%" stopColor="#3a9ac8" />
          <stop offset="100%" stopColor="#1a6b9e" />
        </linearGradient>
        <linearGradient id="ctSheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="7" fill="url(#ctTile)"
            stroke="rgba(255,255,255,0.55)" strokeWidth="1" />
      <rect x="2" y="2" width="28" height="14" rx="6" fill="url(#ctSheen)" />
      {/* Code-telephone glyph: { phone-cord arc } */}
      <g fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round"
         strokeLinejoin="round" transform="translate(0 0.5)">
        <path d="M 10 10 C 7 10, 7 16, 10 16 C 7 16, 7 22, 10 22" />
        <path d="M 22 10 C 25 10, 25 16, 22 16 C 25 16, 25 22, 22 22" />
        <path d="M 13 19 Q 16 22, 19 19" />
      </g>
    </svg>
  );
}

function CTLogoLockup({ small }) {
  return (
    <div className="ct-lockup">
      <CTLogoMark size={small ? 18 : 22} />
      <span className="ct-lockup__name">Code Telephone</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   MENU BAR — top, Tahoe-style
   Translucent, blurs the wallpaper. Left: Code Telephone wordmark
   + standard app menus. Right: system tray + clock.
   ───────────────────────────────────────────────────────────────── */
function MenuBar({ clock, theme, onToggleTheme, onSelectScreen, screenLabel }) {
  const [openMenu, setOpenMenu] = React.useState(null);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const menus = [
    { id: 'app',  label: 'Code Telephone', bold: true,
      items: [
        { label: 'About Code Telephone', meta: '' },
        '---',
        { label: 'Preferences…', meta: '⌘,' },
        '---',
        { label: 'Toggle Light / Dark', meta: theme === 'dark' ? '☾' : '☀', onClick: onToggleTheme },
        '---',
        { label: 'Quit', meta: '⌘Q' },
      ]
    },
    { id: 'file', label: 'File',
      items: [
        { label: 'New Game', meta: '⌘N' },
        { label: 'Join with Code…', meta: '⌘J' },
        '---',
        { label: 'Leave Room', meta: '' },
      ]
    },
    { id: 'edit', label: 'Edit',
      items: [
        { label: 'Undo', meta: '⌘Z' },
        { label: 'Redo', meta: '⇧⌘Z' },
        '---',
        { label: 'Cut',  meta: '⌘X' },
        { label: 'Copy', meta: '⌘C' },
        { label: 'Paste', meta: '⌘V' },
      ]
    },
    { id: 'view', label: 'View',
      items: [
        { label: 'Home',          onClick: () => onSelectScreen('home') },
        { label: 'Waiting Room',  onClick: () => onSelectScreen('lobby') },
        { label: 'Write Phase',   onClick: () => onSelectScreen('write') },
        { label: 'Describe Phase',onClick: () => onSelectScreen('describe') },
        { label: 'Reimplement',   onClick: () => onSelectScreen('reimplement') },
        { label: 'Waiting…',      onClick: () => onSelectScreen('waiting') },
        { label: 'Reveal',        onClick: () => onSelectScreen('reveal') },
        '---',
        { label: 'Show Desktop',  onClick: () => onSelectScreen('desktop') },
      ]
    },
    { id: 'help', label: 'Help',
      items: [
        { label: 'Game Rules' },
        { label: 'Keyboard Shortcuts' },
        '---',
        { label: 'Open Documentation' },
      ]
    },
  ];

  return (
    <div className="menubar" ref={ref}>
      <div className="menubar__left">
        <button className="menubar__brand" onClick={() => onSelectScreen('home')} title="Home">
          <CTLogoMark size={16} />
        </button>
        {menus.map((m, i) => (
          <button
            key={m.id}
            className={`menubar__item ${openMenu === m.id ? 'is-open' : ''} ${m.bold ? 'is-bold' : ''}`}
            onClick={() => setOpenMenu(openMenu === m.id ? null : m.id)}
            onMouseEnter={() => openMenu !== null && setOpenMenu(m.id)}
          >
            {m.label}
            {openMenu === m.id && (
              <div className="menubar__dropdown">
                {m.items.map((item, j) =>
                  item === '---'
                    ? <div className="menubar__sep" key={j} />
                    : (
                      <button
                        key={j}
                        className="menubar__menuitem"
                        onClick={(e) => { e.stopPropagation(); setOpenMenu(null); item.onClick && item.onClick(); }}
                      >
                        <span>{item.label}</span>
                        {item.meta ? <span className="menubar__meta">{item.meta}</span> : null}
                      </button>
                    )
                )}
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="menubar__center">
        {screenLabel && <span className="menubar__breadcrumb">{screenLabel}</span>}
      </div>

      <div className="menubar__right">
        {/* Battery */}
        <span className="menubar__sys" title="Battery 92%">
          <svg width="22" height="11" viewBox="0 0 22 11">
            <rect x="0.5" y="0.5" width="18" height="10" rx="2" fill="none"
                  stroke="currentColor" strokeWidth="1" opacity="0.85" />
            <rect x="2" y="2" width="14" height="7" fill="currentColor" opacity="0.85" />
            <rect x="19" y="3" width="2" height="5" rx="0.5" fill="currentColor" opacity="0.85" />
          </svg>
          <span className="menubar__sys-text">92%</span>
        </span>
        {/* Wifi */}
        <span className="menubar__sys" title="Wi-Fi">
          <svg width="16" height="12" viewBox="0 0 16 12">
            <path d="M8 11.5a1 1 0 100-2 1 1 0 000 2z" fill="currentColor"/>
            <path d="M3 6.5a7 7 0 0110 0" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M5 8a5 5 0 016 0" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M0.5 4.5a10 10 0 0115 0" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.7"/>
          </svg>
        </span>
        {/* Theme toggle */}
        <button className="menubar__sys menubar__sys--btn" onClick={onToggleTheme}
                title="Toggle light / dark">
          {theme === 'dark'
            ? <svg width="14" height="14" viewBox="0 0 14 14"><path d="M10.5 8.5A4.5 4.5 0 015.5 3.5 5 5 0 1010.5 8.5z" fill="currentColor"/></svg>
            : <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="2.6" fill="currentColor"/><g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><line x1="7" y1="1" x2="7" y2="2.5"/><line x1="7" y1="11.5" x2="7" y2="13"/><line x1="1" y1="7" x2="2.5" y2="7"/><line x1="11.5" y1="7" x2="13" y2="7"/><line x1="2.5" y1="2.5" x2="3.6" y2="3.6"/><line x1="10.4" y1="10.4" x2="11.5" y2="11.5"/><line x1="2.5" y1="11.5" x2="3.6" y2="10.4"/><line x1="10.4" y1="3.6" x2="11.5" y2="2.5"/></g></svg>}
        </button>
        {/* Clock */}
        <span className="menubar__clock" title={clock.full}>{clock.timeShort}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   SUPERBAR — bottom, Win7-style. Code Telephone lockup on the
   left (no more orb), taskbar items in the middle, system tray
   on the right.
   ───────────────────────────────────────────────────────────────── */
function Superbar({ items, activeScreen, onSelect, clock }) {
  return (
    <div className="superbar">
      <div className="superbar__sheen" aria-hidden="true" />
      <button className="superbar__brand" onClick={() => onSelect('home')}
              title="Code Telephone">
        <CTLogoMark size={22} />
      </button>
      <div className="superbar__sep" />

      <div className="superbar__items">
        {items.map(it => (
          <button
            key={it.id}
            className={`tb-item ${it.id === activeScreen ? 'is-active' : ''} ${it.open ? 'is-open' : ''}`}
            onClick={() => onSelect(it.id)}
            title={it.label}
          >
            <span className="tb-item__icon">{it.icon}</span>
            <span className="tb-item__label">{it.label}</span>
            {it.id === activeScreen && <span className="tb-item__glow" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <div className="superbar__tray">
        {/* mini system tray icons */}
        <button className="tray-icon" title="Notifications">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1.5c2 0 3.4 1.4 3.4 3.6v1.7c0 1 .3 1.6 1 2.4H2.6c.7-.8 1-1.4 1-2.4V5.1C3.6 2.9 5 1.5 7 1.5zM5.6 11.4a1.4 1.4 0 002.8 0" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button className="tray-icon" title="Sound">
          <svg width="16" height="14" viewBox="0 0 16 14"><path d="M2 5h2.5L7 2v10L4.5 9H2z" fill="currentColor"/><path d="M9.5 4.5c1 .8 1.6 2 1.6 3.5s-.6 2.7-1.6 3.5" stroke="currentColor" strokeWidth="1.1" fill="none"/></svg>
        </button>
        <div className="tray-clock">
          <div className="tray-clock__time">{clock.timeShort}</div>
          <div className="tray-clock__date">{clock.dateShort}</div>
        </div>
        <button className="superbar__show-desktop" title="Show Desktop"
                onClick={() => onSelect('desktop')} aria-label="Show desktop">
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   WINDOW — hybrid chrome
   Title bar uses the Win7 Aero ramp; controls are macOS traffic
   lights on the LEFT (close/min/max).  Body is a glass surface
   with an inner top highlight + soft shadow.
   ───────────────────────────────────────────────────────────────── */
function Window({
  title,
  subtitle,
  icon,
  width = 720,
  height,
  minHeight,
  x, y, centered,
  active = true,
  onClose, onMin, onMax,
  toolbar,
  noPadding,
  flush,           // when true, content area has no internal padding (for code editor etc.)
  children
}) {
  // Position state. When `centered` we resolve to real pixel coords on first
  // mount so that subsequent drags work in the same coordinate system. We
  // keep the window inside the viewport with a small margin.
  const resolveInitial = React.useCallback(() => {
    const w = typeof width  === 'number' ? width  : 720;
    const h = typeof height === 'number' ? height : 480;
    if (centered) {
      return {
        left: Math.max(8, Math.round((window.innerWidth  - w) / 2)),
        top:  Math.max(34, Math.round((window.innerHeight - h - 46) / 2) + 26),
      };
    }
    return { left: x ?? 80, top: y ?? 80 };
  }, [centered, x, y, width, height]);

  const [pos, setPos] = React.useState(resolveInitial);
  const [maximized, setMaximized] = React.useState(false);
  const [zBump, setZBump] = React.useState(0);
  const dragRef = React.useRef(null);

  // Re-center on window resize while still centered (no drag yet)
  const draggedRef = React.useRef(false);
  React.useEffect(() => {
    const onResize = () => {
      if (!draggedRef.current && !maximized) setPos(resolveInitial());
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resolveInitial, maximized]);

  const onTitleMouseDown = (e) => {
    // Ignore clicks on traffic lights or any other interactive control
    if (e.target.closest('.tl')) return;
    if (e.button !== 0) return;
    if (maximized) return;
    draggedRef.current = true;
    setZBump(z => z + 1);
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = pos.left;
    const startTop = pos.top;
    document.body.style.cursor = 'grabbing';

    const onMove = (ev) => {
      const nx = startLeft + (ev.clientX - startX);
      const ny = startTop + (ev.clientY - startY);
      // Clamp so the title bar stays grabbable
      const maxLeft = window.innerWidth - 80;
      const minLeft = -((typeof width === 'number' ? width : 720) - 120);
      const maxTop  = window.innerHeight - 60;
      const minTop  = 26; // below the menubar
      setPos({
        left: Math.max(minLeft, Math.min(maxLeft, nx)),
        top:  Math.max(minTop,  Math.min(maxTop,  ny)),
      });
    };
    const onUp = () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  };

  const handleMax = () => {
    setMaximized(m => !m);
    onMax && onMax();
  };

  const style = maximized
    ? { left: 8, top: 30, width: 'calc(100vw - 16px)', height: 'calc(100vh - 30px - 46px - 4px)' }
    : {
        width,
        height: height || undefined,
        minHeight: minHeight || undefined,
        left: pos.left,
        top: pos.top,
      };
  return (
    <div className={`win ${active ? 'is-active' : ''} ${maximized ? 'is-max' : ''}`}
         style={{ ...style, zIndex: 200 + zBump }}
         onMouseDown={() => setZBump(z => z + 1)}>
      <div
        className={`win__title ${active ? '' : 'is-inactive'}`}
        onMouseDown={onTitleMouseDown}
        onDoubleClick={handleMax}
        ref={dragRef}
      >
        <div className="win__lights" aria-hidden={!active}>
          <button className="tl tl--close" onClick={(e) => { e.stopPropagation(); onClose && onClose(); }} title="Close">
            <svg viewBox="0 0 8 8" width="6" height="6"><path d="M1 1 L7 7 M7 1 L1 7" stroke="#5a0e0a" strokeWidth="1.4" strokeLinecap="round"/></svg>
          </button>
          <button className="tl tl--min" onClick={(e) => { e.stopPropagation(); onMin && onMin(); }} title="Minimize">
            <svg viewBox="0 0 8 8" width="6" height="6"><path d="M1 4 H7" stroke="#5a3500" strokeWidth="1.4" strokeLinecap="round"/></svg>
          </button>
          <button className="tl tl--max" onClick={(e) => { e.stopPropagation(); handleMax(); }} title={maximized ? 'Restore' : 'Maximize'}>
            <svg viewBox="0 0 8 8" width="6" height="6"><path d="M2 6 L2 2 L6 2 M6 2 L2 6" stroke="#0c3d10" strokeWidth="1.4" strokeLinecap="round" fill="none"/></svg>
          </button>
        </div>
        <div className="win__title-inner">
          {icon && <span className="win__icon">{icon}</span>}
          <span className="win__title-text">{title}</span>
          {subtitle && <span className="win__title-sub">— {subtitle}</span>}
        </div>
        <div className="win__title-glare" aria-hidden="true" />
      </div>

      {toolbar && <div className="win__toolbar">{toolbar}</div>}

      <div className={`win__body ${flush ? 'is-flush' : ''} ${noPadding ? 'no-pad' : ''}`}>
        {children}
      </div>
    </div>
  );
}

window.MenuBar = MenuBar;
window.Superbar = Superbar;
window.Window = Window;
window.CTLogoMark = CTLogoMark;
window.CTLogoLockup = CTLogoLockup;
