# Code Telephone — Static UI Build Status

A snapshot of what's built. Useful as an onboarding doc for new contributors and as a checkpoint of where the static-UI phase has landed.

For the why behind decisions, see [`project-briefing.md`](./project-briefing.md). For the design system itself, see [`ui-design.md`](./ui-design.md).

---

## Routes

Five routes, all on the same Win7 desktop shell (`app/layout.jsx` always renders the radial-blue desktop + the Superbar).

| URL | Page | What's on it | Source |
|---|---|---|---|
| `/` | Home wizard | 2-step setup: pick a nickname, then choose **Create room** / **Join with code** / **Quick play** | `app/page.jsx` |
| `/waiting-room` | Waiting Room | Pre-game lobby — room code, player list with ready states, language selector, Start Game button | `app/waiting-room/page.jsx` |
| `/editor` | Write phase | Prompt panel + LeetCode-style IDE (editable) | `app/editor/page.jsx` |
| `/describe` | Describe phase | Two windows side-by-side: read-only IDE (left) + editable Notepad (right) + floating PhaseHUD | `app/describe/page.jsx` |
| `/reimplement` | Reimplement phase | Mirror of Describe: read-only Notepad (left) + editable IDE (right) + PhaseHUD | `app/reimplement/page.jsx` |

The wizard's **Finish** button on `/` currently navigates to `/waiting-room` for all three methods (backend pivot point — different "create" / "join" / "matchmake" calls will live there later).

---

## Components

### Desktop chrome (rendered by `layout.jsx` on every page)
- **`Superbar`** — taskbar pinned to the bottom. Translucent dark background with diagonal sheen + 1px top edge.
- **`StartOrb`** — Win7 Start button. Four layered radial gradients (outer rim, body, top-half shine, hover glow) wrapping a hand-drawn waving flag SVG.
- **`Clock`** — system-tray clock. Client component, 15s tick. SSR-safe placeholder until mount.
- **`TaskbarItem`** — pinned/active app slots with the signature Win7 underglow stripe on the active item.

### Window primitives
- **`Window`** — the base app window. Aero title bar (multi-stop gradient + upper-glare overlay + diagonal sheen), window controls (min/max as translucent grey, close as the extracted 3-stop red), optional menubar, content area. Accepts `x`, `y`, `width`, `height`, `icon`, `menubar`. **Absolute positioning when `x`/`y` are set** — this is the same prop shape future drag-to-move will write back to.
- **`Notepad`** — Win7 Notepad recreation. Wraps `Window` with: a Notepad page-with-blue-lines icon, the canonical File/Edit/Format/View/Help menu (keyboard accelerators underlined), white plain-text body with monospace font, and the chunky bottom status bar with diagonal resize-grip. Supports `readOnly` (off-white tint, hidden caret, `[Read Only]` title suffix per Windows convention).

### Surface
- **`GlassPanel`** — translucent Aero panel. Crossed diagonal sheens (primary + mirror) match the layered construction in `aero-reference/tinted-glass.svg`.

### Inputs
- **`Button`** — variants: `default`, `primary`, `danger`. Default uses the extracted 3-stop grey gradient with the mid-ledge at 50.8 → 56.7%; hover **overlays** a pale-blue layer on top rather than replacing the gradient (matches `button.svg`).
- **`Checkbox`** — three states: `none`, `checked`, `indeterminate`. Layered diagonal box background, blue checkmark SVG, indeterminate is a filled blue square.
- **`Radio`** — checked/unchecked. Selected state uses the extracted `#78CCDC → #126288 → #21496D` ramp with a pale glow ring.
- **`TextField`** — single-line input. Recessed white surface with inset shadow, blue focus glow.
- **`TextArea`** — multi-line with optional label, right-aligned badge, char counter (turns red past `maxCount`).

### Game-specific
- **`CodeEditor`** — LeetCode/HackerRank-style IDE inside Aero chrome. Light glassy top bar (language pill, filename, reset/settings icons, optional READ ONLY yellow badge) over a dark VSCode-Dark+-themed editor body. Editable via the textarea-overlay technique. Tab inserts 4 spaces; Enter auto-indents (and adds 4 more after lines ending in `:` or `{`). Status bar shows Ln/Col + line/char counts. Syntax highlighting via the hand-rolled tokeniser at `lib/highlight.js`.
- **`PhaseHUD`** — floating Aero panel for phase-level controls. Title, countdown, ready count, skip/submit. Used on Describe and Reimplement where the controls don't belong inside the per-document windows.
- **`PlayerAvatar`** — 32×32 square avatar. Colour palette seeded by name (six distinct hues), white initials with a Win7-style inner highlight + diagonal sheen.

---

## Design system

All tokens live in `frontend/src/app/globals.css` as CSS custom properties, extracted directly from the Aero UI source SVGs at [`docs/aero-reference/`](./aero-reference/). 60+ tokens covering:

- **Colours** — Win7 blues, the orb radial multi-stop palette (cyan → navy), button greys, close-button red ramp, checkbox/radio blues, glass whites
- **Gradients** — pre-computed multi-stop `linear-gradient` / `radial-gradient` values for buttons, title bars, the close button, the start orb's four layers, and the diagonal Aero sheens (primary + mirror)
- **Typography** — `Segoe UI` for UI chrome, `Consolas` for code, fixed sizes from 9px chrome labels up to 56px score reveals
- **Borders / radii / shadows** — including the `inset 0 1px 0 rgba(255,255,255,0.6)` top-highlight that's on almost every Aero panel

See [`ui-design.md` §2](./ui-design.md) for the full token list and where each value came from.

---

## Architectural decisions worth knowing

- **CSS Modules + CSS custom properties, no Tailwind, no CSS-in-JS.** Multi-stop gradients with non-standard percentages (button mid-ledge at 50.8 → 56.7%), pseudo-element sheen layers, and inset+outer shadow combos are first-class in plain CSS. Tailwind would require arbitrary values everywhere and lose readability. CSS-in-JS adds runtime cost without benefit.
- **Plain JS, not TypeScript.** Component files are `.jsx`; pure-logic files (`lib/highlight.js`, `lib/supabase/client.js`) are `.js`. The project's `jsconfig.json` maps `@/*` to `./src/*`.
- **Hand-rolled syntax highlighter.** `lib/highlight.js` is a regex tokeniser with keyword/builtin sets for Python, JavaScript, and Java. Good enough for short game snippets. Swap for Monaco when we need autocomplete or error squiggles — the `CodeEditor` interface stays the same.
- **Windows take absolute position via props.** `<Window x={56} y={88} width={560} height={460} />`. The same prop shape will back drag-state when we wire it up: the value just becomes state instead of a literal.
- **Aero reference SVGs are the source of truth.** When in doubt about a colour or gradient, open the SVG at `docs/aero-reference/<component>.svg` and read its `<linearGradient>` / `<radialGradient>` defs.

---

## What isn't built yet

- **Reveal / Scoring screen** — the chain laid out horizontally with the AI-judge score reveal
- **Waiting phase view** — the "I've submitted, waiting on others" state with a progress bar (separate from the pre-game Waiting Room)
- **Drag-to-move** — architecture is ready; needs a client-state conversion on `Window` + mouse handlers
- **Window manager** — z-index coordination, bring-to-front on click, focus state
- **URL deep-linking** — `/r/ROOM-XXXX` pre-fills the wizard's join field
- **Window open/close transitions** beyond the current scale-from-center fade
- **Sounds** — the Win7 chime moments (window open, error, notification, startup)
- **Real interactivity** — actual room creation, code joining, matchmaking, WebSocket state sync

---

## File structure

```
frontend/src/
├── app/
│   ├── globals.css                ← design tokens + desktop background
│   ├── layout.jsx                 ← root layout (desktop + Superbar)
│   ├── page.{jsx,module.css}      ← Home wizard
│   ├── waiting-room/page.{jsx,module.css}
│   ├── editor/page.{jsx,module.css}
│   ├── describe/page.{jsx,module.css}
│   └── reimplement/page.{jsx,module.css}
├── components/
│   ├── desktop/   {Superbar, StartOrb, Clock, TaskbarItem}.{jsx,module.css}
│   ├── window/    Window.{jsx,module.css}
│   ├── notepad/   Notepad.{jsx,module.css}
│   ├── glass/     GlassPanel.{jsx,module.css}
│   ├── input/     {Button, Checkbox, Radio, TextField, TextArea}.{jsx,module.css}
│   └── game/      {CodeEditor, PhaseHUD, PlayerAvatar}.{jsx,module.css}
└── lib/
    ├── highlight.js               ← tokeniser
    └── supabase/client.js
```
