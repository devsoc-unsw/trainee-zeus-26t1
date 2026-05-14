# Code Telephone — Static UI Design

This document is the source of truth for the visual design and component library. It covers design tokens, component specs (driven by the Aero UI (Windows 7) Community reference PDF), screen layouts, and the suggested frontend file structure.

**Scope of current phase:** static UI only. Every screen renders with placeholder/mocked data; no game logic, no realtime, no API calls.

**Source of truth for visuals:** vector SVGs extracted from the Aero UI Figma kit, stored at [`./aero-reference/`](./aero-reference/). All colour tokens and gradient stops below are extracted directly from those SVG `<linearGradient>` / `<radialGradient>` definitions, not eyeballed from screenshots. When a value is marked _(eyeballed)_ it's a render-based approximation because the source SVG doesn't isolate that element.

---

## 1. Design Philosophy

> "Windows 7 Aero — faithfully, not ironically."

The Win7 Aero aesthetic is executed with full commitment and high polish. Goals:

- Feels like a genuinely well-crafted Win7 desktop running in a browser
- **Every screen is a "window"** with proper chrome (title bar, controls) and the Superbar always present at the bottom
- Never feels "web-like" — no full-page scroll, no mobile-first, no toast notifications. Use dialog boxes, status bar messages, and modal windows instead
- Every transition mimics Win7 window open/close — scale from center + slight fade

---

## 2. Design Tokens

These should live as CSS custom properties in `frontend/src/app/globals.css` (or a dedicated `tokens.css` imported globally).

### 2.1 Colours

Extracted from `aero-reference/*.svg`. Where multiple shades exist for the same element, the suffix denotes lightness (lower = darker).

```css
:root {
  /* ─────────────────────────────────────────────────────────────
     Button greys — extracted from button.svg (rest state)
     The rest button is a 3-stop vertical gradient, mostly flat
     #EBEBEB on top, dropping to #D2D2D2 at the mid "ledge",
     recovering to #E2E2E2 at the bottom.
     ───────────────────────────────────────────────────────────── */
  --btn-grey-top:    #EBEBEB;
  --btn-grey-ledge:  #D2D2D2;
  --btn-grey-bottom: #E2E2E2;

  /* Button HOVER overlay (a blue layer composited ON TOP of the
     grey rest gradient — does NOT replace it). From button.svg. */
  --btn-hover-blue-top:    #E4F4FD;
  --btn-hover-blue-bottom: #C7E9FB;

  /* ─────────────────────────────────────────────────────────────
     Window controls — extracted from app-window.svg
     ───────────────────────────────────────────────────────────── */
  /* Close button — 3-stop vertical red gradient */
  --close-red-700: #9B2813;  /* ~60% offset (top) */
  --close-red-500: #B32E16;  /* ~70% offset (mid) */
  --close-red-300: #B8644E;  /* ~93% offset (bottom — rosier) */

  /* Min/max buttons — translucent dark grey overlay (op ~0.4) */
  --wc-grey-500: rgba(84, 84, 84, 0.4);     /* #545454 @ 40% */
  --wc-grey-400: rgba(111, 112, 119, 0.4);  /* #6F7077 @ 40% */
  --wc-grey-edge: rgba(159, 160, 165, 0.6); /* #9FA0A5 @ 60% */
  --wc-highlight: #E7E7E7;                   /* top-edge sheen stripe */

  /* ─────────────────────────────────────────────────────────────
     Navigation orb / Start orb deep blues — from navigation.svg + superbar.svg
     The Win7 orb is built from layered radial gradients with cyan
     highlights bleeding into deep navy.
     ───────────────────────────────────────────────────────────── */
  --orb-cyan:      #7BF4FF;  /* top highlight, brightest */
  --orb-blue-400: #02EDFF;  /* outer ring highlight (start orb) */
  --orb-blue-500: #0C8ADB;  /* mid blue */
  --orb-blue-600: #0D8CC8;
  --orb-blue-700: #104785;  /* deep blue */
  --orb-blue-800: #021F67;  /* near-black navy */
  --orb-blue-900: #00477A;  /* darkest rim */

  /* Inner body gradient */
  --orb-body-100: #D1E7EE;
  --orb-body-300: #ADD0E1;
  --orb-body-500: #3982B1;
  --orb-body-700: #285699;
  --orb-body-900: #244B93;
  --orb-body-deep: #152469;

  /* Glossy highlight ring */
  --orb-shine-1: #3A67A7;
  --orb-shine-2: #5085BC;
  --orb-shine-3: #8BCDE2;
  --orb-shine-4: #E6F6F9;
  --orb-flag:    #0A50A1;  /* the deep flag-blue accent */

  /* ─────────────────────────────────────────────────────────────
     Checkbox — from checkbox.svg
     Box is layered pale greys; the checkmark + indeterminate
     square use medium / dark navy blues.
     ───────────────────────────────────────────────────────────── */
  --check-box-top:    #ECEDF1;
  --check-box-bottom: #E5E6EB;
  --check-mark:       #2D5B85;
  --check-mark-dark:  #284259;

  /* ─────────────────────────────────────────────────────────────
     Radio button — from radio-button.svg
     ───────────────────────────────────────────────────────────── */
  --radio-rest-ring:  #B6B7BC;
  --radio-hover-fill: #8BD2FF;
  --radio-dot-light:  #78CCDC;
  --radio-dot-mid:    #126288;
  --radio-dot-dark:   #21496D;
  --radio-glow:       #4FB5FF;   /* selected outer ring start */
  --radio-glow-pale:  #C7ECFF;   /* selected outer ring end */

  /* ─────────────────────────────────────────────────────────────
     Glass surface — partially from aero-glass.svg + tinted-glass.svg,
     partially eyeballed because the SVG renders much of the glass
     as composited overlays without a single canonical gradient.
     ───────────────────────────────────────────────────────────── */
  --glass-sheen:        rgba(240, 240, 240, 0.67);  /* #F0F0F0 op=0.67 — diagonal sheen */
  --glass-band-top:     rgba(255, 255, 255, 0.0);   /* glass top fades from transparent... */
  --glass-band-bottom:  rgba(255, 255, 255, 1.0);   /* ...to white at bottom */
  --glass-white-low:    rgba(255, 255, 255, 0.30);
  --glass-white-mid:    rgba(255, 255, 255, 0.45);
  --glass-white-high:   rgba(255, 255, 255, 0.55);
  --glass-white-top:    rgba(255, 255, 255, 0.70);

  /* Panel base — eyeballed from rendered Aero look */
  --panel-bg:            rgba(210, 230, 248, 0.97);
  --panel-border:        rgba(255, 255, 255, 0.45);
  --panel-top-highlight: rgba(255, 255, 255, 0.60);

  /* ─────────────────────────────────────────────────────────────
     Title bar (eyeballed — title bar bg isn't a single gradient
     in the source SVG; built from layered paths).
     ───────────────────────────────────────────────────────────── */
  --titlebar-top:    #E8EFF5;
  --titlebar-upper:  #C8D4E0;
  --titlebar-mid:    #B8C4D0;
  --titlebar-lower:  #C8D4E0;
  --titlebar-bottom: #D8E0E8;

  /* ─────────────────────────────────────────────────────────────
     Win7 core blue family — for desktop bg, accent strokes,
     button-primary surfaces. (Derived to harmonise with the orb
     blues above.)
     ───────────────────────────────────────────────────────────── */
  --w7-blue-900: #0d4a73;
  --w7-blue-700: #1a6b9e;
  --w7-blue-500: #2a7ab8;
  --w7-blue-400: #3a9ac8;
  --w7-blue-300: #4aa8d8;

  /* Text */
  --text-on-glass: #1a2a3a;   /* dark navy, NOT pure black */
  --text-muted:    #4a5a6a;
  --text-on-dark:  #e6eef5;

  /* Status */
  --status-done:   #3a9a5c;
  --status-active: #e8a030;
  --status-wait:   #7a8a9a;
  --status-danger: #d94f3d;

  /* Code editor — VS Code dark+ inspired, not from Aero kit */
  --code-bg:      #1e2a38;
  --code-fg:      #d6e0eb;
  --code-keyword: #c586c0;
  --code-string:  #ce9178;
  --code-number:  #b5cea8;
  --code-comment: #6a9955;
  --code-fn:      #dcdcaa;
}
```

### 2.2 Gradients

```css
:root {
  /* ─────────────────────────────────────────────────────────────
     Desktop background (radial, centered) — eyeballed; not in
     the Aero kit but harmonises with the orb/blue family.
     ───────────────────────────────────────────────────────────── */
  --desktop-bg: radial-gradient(
    ellipse at 50% 40%,
    #4aa8d8 0%,
    #1a6b9e 40%,
    #0d4a73 100%
  );

  /* ─────────────────────────────────────────────────────────────
     Title bar (active window) — eyeballed (see note in §2.1).
     ───────────────────────────────────────────────────────────── */
  --titlebar-active: linear-gradient(
    to bottom,
    var(--titlebar-top)    0%,
    var(--titlebar-upper)  40%,
    var(--titlebar-mid)    50%,
    var(--titlebar-lower)  60%,
    var(--titlebar-bottom) 100%
  );

  /* ─────────────────────────────────────────────────────────────
     Win7 button (rest) — EXTRACTED from button.svg.
     Note the unusual stop distribution: the gradient is mostly
     uniform #EBEBEB until 51%, then drops to #D2D2D2 over 6%
     (the "ledge"), then rises to #E2E2E2 by 97%. That sharp
     mid-transition gives Win7 buttons their polished metallic
     look — DO NOT smooth it out.
     ───────────────────────────────────────────────────────────── */
  --btn-rest: linear-gradient(
    to bottom,
    var(--btn-grey-top)    0%,
    var(--btn-grey-top)    50.8%,
    var(--btn-grey-ledge)  56.7%,
    var(--btn-grey-bottom) 96.9%,
    var(--btn-grey-bottom) 100%
  );

  /* Win7 button (hover) — OVERLAY on top of --btn-rest.
     Composite via a pseudo-element with this background and
     mix-blend-mode: multiply or just stack as a second layer.
     The blue is concentrated below the mid-ledge. */
  --btn-hover-overlay: linear-gradient(
    to bottom,
    transparent 0%,
    transparent 65.9%,
    var(--btn-hover-blue-top)    66.0%,
    var(--btn-hover-blue-bottom) 66.8%,
    var(--btn-hover-blue-bottom) 100%
  );

  /* Primary blue button — eyeballed; mirrors the rest button's
     structure but in the w7-blue family. */
  --btn-primary: linear-gradient(
    to bottom,
    #6abce8 0%,
    #3a9ac8 45%,
    #2a7ab8 55%,
    #4aa8d8 100%
  );

  /* ─────────────────────────────────────────────────────────────
     Close button — EXTRACTED from app-window.svg.
     Vertical 3-stop. Plus a small E7E7E7 top-highlight stripe
     applied as a separate ::before.
     ───────────────────────────────────────────────────────────── */
  --close-btn: linear-gradient(
    to bottom,
    var(--close-red-700) 61.3%,
    var(--close-red-500) 70.8%,
    var(--close-red-300) 93.3%
  );

  /* ─────────────────────────────────────────────────────────────
     Diagonal glass sheen — derived from aero-glass.svg + tinted-glass.svg.
     The Tinted Glass uses TWO diagonals crossing each other (one
     going up-right at ~35°, one mirrored up-left). For most
     surfaces a single 105° sheen is enough; for hero glass
     surfaces use --glare-cross.
     ───────────────────────────────────────────────────────────── */
  --glare: linear-gradient(
    105deg,
    transparent 30%,
    var(--glass-sheen) 45%,
    rgba(240, 240, 240, 0.3) 55%,
    transparent 70%
  );

  --glare-mirror: linear-gradient(
    75deg,
    transparent 30%,
    var(--glass-sheen) 45%,
    rgba(240, 240, 240, 0.3) 55%,
    transparent 70%
  );

  /* Stack both for the criss-cross effect from tinted-glass.svg */
  /* Usage: background-image: var(--glare), var(--glare-mirror), <base>; */

  /* ─────────────────────────────────────────────────────────────
     Glass vertical band split — from tinted-glass.svg paint2.
     Goes from transparent at top to white-tinted at bottom.
     ───────────────────────────────────────────────────────────── */
  --glass-band: linear-gradient(
    to bottom,
    var(--glass-band-top)    0%,
    var(--glass-band-bottom) 100%
  );

  /* ─────────────────────────────────────────────────────────────
     Start orb — EXTRACTED from superbar.svg.
     The Win7 orb is built from FOUR layered radial gradients.
     Render as nested elements (outer ring, body, shine, flag)
     rather than a single CSS gradient.
     ───────────────────────────────────────────────────────────── */
  --orb-outer-ring: radial-gradient(
    circle at 50% 30%,
    var(--orb-blue-400) 10%,
    var(--orb-blue-600) 21%,
    var(--orb-blue-700) 41%,
    var(--orb-blue-900) 52%
  );

  --orb-body: radial-gradient(
    circle at 50% 25%,
    var(--orb-body-100) 0%,
    var(--orb-body-300) 30%,
    var(--orb-body-500) 65%,
    var(--orb-body-700) 90%,
    var(--orb-body-deep) 100%
  );

  --orb-shine: radial-gradient(
    ellipse at 50% 30%,
    white 0%,
    rgba(255, 255, 255, 0) 60%
  );

  /* Navigation orb (smaller, in-app back/forward) — same
     family but a tighter single radial */
  --nav-orb: radial-gradient(
    circle at 30% 25%,
    var(--orb-cyan) 7%,
    var(--orb-blue-500) 27%,
    var(--orb-blue-700) 41%,
    var(--orb-blue-800) 52%
  );

  /* ─────────────────────────────────────────────────────────────
     Superbar background — eyeballed (the Aero kit shows the
     superbar with rasters embedded; the bar itself is dark
     translucent with a sheen).
     ───────────────────────────────────────────────────────────── */
  --superbar-bg: rgba(10, 30, 70, 0.85);
}
```

### 2.3 Typography

```css
:root {
  --font-ui: 'Segoe UI', Tahoma, 'Helvetica Neue', sans-serif;
  --font-code: 'Consolas', 'Cascadia Code', 'Courier New', monospace;

  /* sizes */
  --fs-chrome: 11px;   /* title bars, taskbar, menu items */
  --fs-body:   12px;   /* body text, labels */
  --fs-section: 14px;  /* section headings */
  --fs-h1:     18px;   /* window title big headings */
  --fs-timer:  28px;   /* countdown timer (700 weight) */
  --fs-score:  56px;   /* big score reveal number */

  /* weights */
  --fw-regular: 400;
  --fw-semibold: 600;
  --fw-bold: 700;
}
```

Use **Segoe UI** as the global font. No custom fonts — Segoe UI is the identity.

### 2.4 Borders, radii, shadows

```css
:root {
  --radius-btn:    3px;   /* slightly rounded buttons */
  --radius-panel:  6px;   /* glass panels */
  --radius-window: 8px 8px 4px 4px;  /* windows: top rounder than bottom */

  --border-glass:  1px solid var(--panel-border);
  --border-button: 1px solid rgba(100, 150, 200, 0.6);
  --border-input:  1px solid rgba(100, 130, 160, 0.5);

  /* Inner highlight along top edge of glass panels */
  --inset-top-highlight: inset 0 1px 0 var(--panel-top-highlight);

  /* Window drop shadow */
  --shadow-window: 0 8px 24px rgba(0, 0, 0, 0.35),
                   0 2px 6px rgba(0, 0, 0, 0.25);

  /* Subtle elevation for buttons / smaller panels */
  --shadow-button: 0 1px 2px rgba(0, 0, 0, 0.15);
}
```

### 2.5 Spacing

Use a 4px base scale: `4 / 8 / 12 / 16 / 24 / 32 / 48`. No spacing tokens needed as variables — these are small enough numbers to inline.

---

## 3. Component Library

Each component below maps to a page in the Aero UI PDF (referenced inline). Build them as React components under `frontend/src/components/`.

### 3.1 Aero Glass Panel `<GlassPanel>`

**Reference:** Aero UI PDF p.8 (Aero Glass)

The base translucent surface. Two horizontal bands (lighter top, slightly darker bottom) with a diagonal sheen sweep.

**Structure:**
```
<div class="glass-panel">
  <div class="glass-glare" />
  <div class="glass-content">{children}</div>
</div>
```

**Key CSS:**
- `background: var(--panel-bg)`
- `border: var(--border-glass)`
- `box-shadow: var(--inset-top-highlight)`
- `border-radius: var(--radius-panel)`
- `.glass-glare` is an absolutely-positioned `::before` or sibling div using `--glare` gradient at `opacity: 0.6`

### 3.2 Tinted Glass Panel `<TintedGlassPanel tint="#blue">`

**Reference:** Aero UI PDF p.9 (Tinted Glass)

Aero Glass with a coloured fill layer overlaid. Same structure as `<GlassPanel>` but with an extra absolutely-positioned `.tint-overlay` div using `background: <tint>` at `opacity: 0.35`.

Use cases: secondary windows, dialog accent areas.

### 3.3 App Window `<Window title="ROOM-4829" icon="...">`

**Reference:** Aero UI PDF p.10 (App Window)

A complete window: title bar with title text + app icon, window controls (minimize / maximize / close), white content area.

**Structure:**
```
<div class="window">
  <div class="window-titlebar">
    <img class="window-icon" />
    <span class="window-title">{title}</span>
    <div class="window-controls">
      <button class="wc-min">_</button>
      <button class="wc-max">□</button>
      <button class="wc-close">×</button>
    </div>
  </div>
  <div class="window-menubar">{menubar}</div>     // optional
  <div class="window-content">{children}</div>
</div>
```

**Title bar CSS:**
- `background: var(--titlebar-active)`
- Height: `28px`
- Overlay a `::before` with `rgba(255,255,255,0.55)` covering top 50% for upper glare
- Overlay a `::after` with `--glare` for diagonal sheen
- Text: `12px Segoe UI`, `color: var(--text-on-glass)`, text-shadow `0 1px 0 rgba(255,255,255,0.6)`

**Window controls** *(extracted from `aero-reference/app-window.svg`)*:
- All buttons: `width: 44px`, `height: 22px`
- **Minimize/maximize:** TRANSLUCENT dark grey overlay (not solid glassy grey). Stack:
  ```css
  background:
    linear-gradient(to bottom, var(--wc-grey-500) 79%, var(--wc-grey-400) 93%);
  border: 1px solid var(--wc-grey-edge);
  ```
  Add a tiny `--wc-highlight` (`#E7E7E7`) horizontal sheen stripe near the top via `::before`.
- **Close button:** use `--close-btn` gradient. White `×` icon. No left border — sits flush at top-right corner. Add the same top-edge highlight stripe.

**Window content:**
- `background: white` for traditional windows, or pass `glass` variant to use `--panel-bg`
- `border-radius: 0 0 4px 4px`

### 3.4 Tinted App Window `<TintedWindow>`

**Reference:** Aero UI PDF p.11 (Tinted App Window)

Variant of `<Window>` where the title bar uses tinted glass instead of plain. Same component, accept a `tint` prop and apply to title bar background composite.

### 3.5 File Menu / Menu Bar `<MenuBar items={[...]}>`

**Reference:** Aero UI PDF p.12 (File Menu)

Horizontal menu strip below the title bar.

- Height: `22px`
- Background: subtle gradient `linear-gradient(to bottom, #e0e8f0, #cdd6e0)`
- Items: `11px Segoe UI`, padding `0 8px`, hover shows a blue highlight box (`rgba(140, 180, 220, 0.4)`)
- Standard items for the gameplay window: `File | Edit | Format | View | Help` (cosmetic only in v1)

### 3.6 Button `<Button variant="default|primary|danger">`

**Reference:** [`aero-reference/button.svg`](./aero-reference/button.svg)

**Default (rest):**
- `background: var(--btn-rest)`  *(extracted 3-stop grey)*
- `border: var(--border-button)`
- `border-radius: var(--radius-btn)`
- `padding: 4px 14px`
- Font: `12px Segoe UI`, `color: var(--text-on-glass)`
- `box-shadow: var(--inset-top-highlight), var(--shadow-button)`

**Hover (important — different architecture from typical web buttons):**
- Keep `background: var(--btn-rest)` (do NOT replace)
- Layer `--btn-hover-overlay` on top via a `::after` pseudo-element, or stack backgrounds:
  ```css
  background: var(--btn-hover-overlay), var(--btn-rest);
  ```
- Outer glow: `box-shadow: 0 0 6px rgba(80, 160, 220, 0.5), var(--inset-top-highlight)`

This matches how the Aero kit composites it — the rest gradient stays underneath, a thin blue layer rides on top below the mid-ledge.

**Primary (blue):**
- `background: var(--btn-primary)`
- `color: white`, text-shadow `0 1px 1px rgba(0,0,0,0.3)`
- `border: 1px solid var(--w7-blue-700)`

**Danger:**
- `background: var(--close-btn)` (same red gradient as close button)
- `color: white`, text-shadow `0 1px 1px rgba(0,0,0,0.4)`

**Disabled:**
- `opacity: 0.5`, `cursor: not-allowed`, no hover state

### 3.7 Checkbox `<Checkbox state="none|checked|indeterminate" label>`

**Reference:** [`aero-reference/checkbox.svg`](./aero-reference/checkbox.svg)

**Box:**
- `width: 13px`, `height: 13px`
- Layered diagonal fill *(extracted)*:
  ```css
  background:
    linear-gradient(135deg, var(--check-box-top) 49%, transparent 100%),
    linear-gradient(135deg, white 85%, transparent 100%),
    var(--check-box-bottom);
  ```
- `border: 1px solid #7a8a9a`
- Inset shadow: `inset 0 1px 2px rgba(0,0,0,0.1)`

**Checked:** blue tick (SVG, `fill: var(--check-mark)` with a `var(--check-mark-dark)` 1px shadow underneath for depth)

**Indeterminate:** filled blue square inside (`var(--check-mark)`, 7×7, centered, with a `var(--check-mark-dark)` border)

**With label:** flex row, gap `6px`, label uses `12px Segoe UI`.

### 3.8 Radio Button `<Radio state="rest|hover|pressed" selected={bool} label>`

**Reference:** [`aero-reference/radio-button.svg`](./aero-reference/radio-button.svg)

**Circle (rest):**
- `width: 13px`, `height: 13px`, `border-radius: 50%`
- `background: radial-gradient(circle at 50% 50%, white 60%, var(--radio-rest-ring) 100%)` *(extracted: rest ring is `#B6B7BC`)*
- `border: 1px solid #7a8a9a`

**Hover:** outer fill shifts to `var(--radio-hover-fill)` (`#8BD2FF`), faint blue outer glow

**Selected:** inner blue dot (5×5, centered) *(extracted colours)*:
```css
background:
  linear-gradient(135deg, var(--radio-dot-light) 28%, var(--radio-dot-mid) 64%),
  var(--radio-dot-dark);
```
Plus a `radial-gradient(var(--radio-glow-pale), var(--radio-glow))` outer ring at 1px around the dot for the wet-glass highlight.

**Pressed + selected:** slightly darker blue, inset shadow

### 3.9 Text Field `<TextField placeholder>`

**Reference:** Aero UI PDF p.5 (Text Field)

- `background: white`
- `border: var(--border-input)`
- Inset shadow `inset 0 1px 2px rgba(0,0,0,0.1)`
- `padding: 4px 6px`
- Font: `12px Segoe UI`
- Focus: border `#3a9ac8`, outer glow `0 0 4px rgba(80,160,220,0.4)`

Multi-line variant: `<TextArea>` — same styling, taller, allows wrapping.

### 3.10 Dial Slider `<Slider min max value>`

**Reference:** Aero UI PDF p.2 (Dial Slider)

- Track: 3px tall, `linear-gradient(to bottom, #b8c4d0, #d8e0e8)`, rounded
- Thumb: 12×16px, white gradient with subtle dimensional shading, pointer shape (slightly tapered bottom)
- Tick marks beneath the track for stepped sliders

Not critical for v1 game screens but include in the component library for completeness.

### 3.11 Navigation Orbs `<NavOrb direction="back|forward">`

**Reference:** [`aero-reference/navigation.svg`](./aero-reference/navigation.svg)

The classic Win7 circular blue back/forward orb buttons.

- `width: 26px`, `height: 26px`, `border-radius: 50%`
- Background: `var(--nav-orb)` *(extracted 4-stop radial: cyan → mid blue → deep blue → near-black navy)*
- White arrow SVG centered (`◀` or `▶`)
- Outer ring: `2px solid rgba(255,255,255,0.5)`
- Glossy top-half highlight: overlay `linear-gradient(to bottom, white 0%, transparent 50%)` at `opacity: 0.4` via `::after`

Use in the lobby for "back to home" or in the reveal screen for chain navigation.

### 3.12 Superbar `<Superbar>`

**Reference:** Aero UI PDF p.7 (Superbar)

**Always pinned to the bottom of the viewport.** Fixed positioning.

**Structure:**
```
<div class="superbar">
  <button class="start-orb" />
  <div class="taskbar-items">
    <TaskbarItem state="active" icon="..." />
    <TaskbarItem state="inactive" icon="..." />
  </div>
  <div class="system-tray">
    <div class="clock">
      <div class="time">9:42 PM</div>
      <div class="date">14/05/2026</div>
    </div>
  </div>
</div>
```

**Key CSS:**
- `position: fixed; bottom: 0; left: 0; right: 0`
- `height: 40px`
- `background: var(--superbar-bg)`
- `backdrop-filter: blur(8px)` (graceful degradation if unsupported)
- Top border: `1px solid rgba(255,255,255,0.2)`
- Subtle diagonal sheen overlay using `--glare` at low opacity

**Start Orb** *(extracted from `aero-reference/superbar.svg` — built from FOUR layered radial gradients)*:
- `width: 54px`, `height: 36px` (oval/pill)
- Layer 1 (outermost ring): `background: var(--orb-outer-ring)` — the deep cyan-to-navy halo
- Layer 2 (body): inset circle ~3px smaller, `background: var(--orb-body)` — the deep blue body with pale highlights
- Layer 3 (shine): inset ellipse on the top-left, `background: var(--orb-shine)` — the glossy reflection
- Layer 4 (flag): Win7 flag SVG centered, fill `var(--orb-flag)`
- Glowing ring on hover: `box-shadow: 0 0 12px var(--orb-cyan)`

**Taskbar items:**
- `width: 44px`, `height: 36px`
- Active state: pale glassy highlight box (`rgba(255,255,255,0.18)`) with a coloured underglow strip
- Inactive: just the icon, transparent background
- Hover: faint glow

**Clock:**
- Two-line layout, right-aligned
- `10px Segoe UI`, color `var(--text-on-dark)`

### 3.13 Game-specific components

Not in the Aero PDF — bespoke to Code Telephone but use the same visual language.

#### `<PlayerAvatar initials color>` 
- 32×32 square (or 24×24 small), `border-radius: 4px`
- Coloured background per player (use a palette of 6 distinct hues)
- Initials in white, `12px Segoe UI`, weight 600
- Subtle inner highlight + drop shadow to match Aero feel

#### `<StatusDot state="typing|submitted|waiting">`
- 8×8 circle
- `typing` (amber `--status-active`): pulsing animation (`@keyframes` scale 1 → 1.3, opacity 1 → 0.5)
- `submitted` (green `--status-done`): solid, no animation
- `waiting` (grey-blue `--status-wait`): solid, no animation

#### `<PhaseTracker phases={[...]} current={index}>`
- Horizontal row of 4 nodes connected by a thin line
- Each node is a 24×24 circle:
  - Done: green check icon, green fill
  - Active: pencil icon, amber fill, pulsing glow
  - Upcoming: number, muted blue-grey fill
- Connecting line: 2px, colour matches the "done" colour for completed segments

#### `<CodeEditorPanel language code editable>`
- Outer container styled like a tinted glass panel with a dark inner editor
- Inner editor: `background: var(--code-bg)`, font `var(--font-code)`, `13px`
- Line numbers gutter on the left (12% wide, `rgba(255,255,255,0.05)` background)
- Language badge top-right: small pill, e.g. "Python", styled like a tinted glass mini-pill
- Read-only variant: same styling, no cursor, slight opacity reduction on the editor area

#### `<DescriptionPanel readOnly>`
- Same outer chrome as the code panel but content area is a textarea on a glassy white background
- "Plain English only" pill badge at top-right when in describe phase

#### `<Timer seconds>`
- Pill-shaped, `padding: 6px 18px`
- Font: `var(--fs-timer)`, weight 700, `var(--font-ui)`
- Default: glassy white background
- Under 30s: red gradient background (`--close-red-top` → `--close-red-bottom`), white text, gentle pulse

#### `<ScoreNumber value>`
- Huge number, `var(--fs-score)`, weight 700
- Tabular numerals (`font-variant-numeric: tabular-nums`)
- Used in the reveal screen — designed to animate counting up

---

## 4. Screen Layouts

The Superbar is always present at the bottom. Every screen renders one or more `<Window>` components against the desktop background.

### 4.1 Desktop shell

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│              (blue radial gradient                       │
│               with subtle top-right glow)                │
│                                                          │
│                  ┌──────────────────┐                    │
│                  │   active window  │                    │
│                  │                  │                    │
│                  │                  │                    │
│                  └──────────────────┘                    │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [orb] [IE] [Code Telephone]               9:42 PM 14/05  │  ← Superbar
└──────────────────────────────────────────────────────────┘
```

Implementation: top-level `app/layout.js` renders the desktop background + `<Superbar />`. Routes render their own `<Window>` centred over the desktop.

### 4.2 Lobby / Room screen

```
┌─ Code Telephone — ROOM-4829 ───────────── _ □ X ─┐
│ File   Edit   View   Help                         │
├───────────────────────────────────────────────────┤
│                                                   │
│  Room Code:  ROOM-4829                            │
│                                                   │
│  Players (3/6)                                    │
│  ┌───────────────────────────────────────────┐    │
│  │ [JS] Jordan       ☑ ready    (host)       │    │
│  │ [AM] Amrita       ☑ ready                 │    │
│  │ [LK] Lukas        ☐ not ready             │    │
│  │ [  ] empty slot                            │    │
│  │ [  ] empty slot                            │    │
│  │ [  ] empty slot                            │    │
│  └───────────────────────────────────────────┘    │
│                                                   │
│  Language:  ⦿ Python  ◯ JavaScript  ◯ Java         │
│                                                   │
│                          [ Leave ]  [ Start Game ]│
└───────────────────────────────────────────────────┘
```

**Layout notes:**
- Window width: `560px`, height: `auto` (max ~520px)
- Centered both axes
- "Start Game" is `<Button variant="primary">`, only enabled for host
- Non-host sees "Waiting for host..." in the same position, no button

### 4.3 Gameplay window (the main screen)

```
┌─ Code Telephone — Round 3 ─────────────────────── _ □ X ─┐
│ File   Edit   View   Help                                 │
├───────────────────────────────────────────────────────────┤
│  Phase 2 of 4 — Describe the function          [ 0:47 ]   │
├──────────────┬────────────────────────────────────────────┤
│  PLAYERS     │  ┌──── Function (read-only) ──── Python ─┐ │
│  ● Jordan ✓  │  │  1  def reverse_string(s):           │ │
│  ● Amrita ✎  │  │  2      return s[::-1]               │ │
│  ● Lukas    │  │                                       │ │
│  ● You    ✎ │  └──────────────────────────────────────┘ │
│              │                                            │
│  PHASE       │  ┌──── Your description ── Plain English ┐│
│  ✓ Write     │  │                                       ││
│  ✎ Describe  │  │  [textarea]                           ││
│  3 Re-impl   │  │                                       ││
│  4 Reveal    │  │                                       ││
│              │  └──────────────────────────────────────┘ │
│              │                                            │
│              │              2/4 ready    [Skip] [Submit] │
└──────────────┴────────────────────────────────────────────┘
```

**Layout notes:**
- Window: full viewport minus 60px (room for superbar + margin)
- Left sidebar: `220px` fixed width, glass panel
- Main area: flex column
  - Top banner: phase label (left) + timer (right), `48px` tall
  - Content area: changes per phase (see variants below)
  - Bottom row: `48px` tall, ready count (left) + Skip/Submit (right)

**Phase variants** (the content area between banner and bottom row):

| Phase | Top panel | Bottom panel |
|---|---|---|
| Write | Prompt text (read-only glass panel) | Code editor (editable) |
| Describe | Code panel (read-only) | Description textarea (editable) |
| Reimplement | Description panel (read-only) | Code editor (editable) |
| Waiting | "Waiting for other players..." + Win7 progress bar | (nothing — single full-height panel) |

### 4.4 Reveal / Scoring screen

```
┌─ Code Telephone — Round Reveal ──────────────── _ □ X ─┐
│                                                         │
│  The chain                                              │
│  ┌──────┐  →  ┌──────┐  →  ┌──────┐  →  ┌──────┐        │
│  │ [JS] │     │ [AM] │     │ [LK] │     │  ✦   │        │
│  │ Code │     │ Desc │     │ Code │     │Score │        │
│  └──────┘     └──────┘     └──────┘     └──────┘        │
│                                                         │
│  ┌─────────────────────────┬───────────────────────┐    │
│  │  ORIGINAL (Jordan)      │  RECONSTRUCTED (Lukas)│    │
│  │  def reverse(s):        │  def flip(text):      │    │
│  │      return s[::-1]     │      return text[::-1]│    │
│  └─────────────────────────┴───────────────────────┘    │
│                                                         │
│              ┌───────────────────┐                      │
│              │       87%         │                      │
│              │  semantic match   │                      │
│              └───────────────────┘                      │
│                                                         │
│  ELO   Jordan +8    Amrita +12    Lukas -4              │
│                                                         │
│                       [ View replay ]  [ Play again ]   │
└─────────────────────────────────────────────────────────┘
```

**Layout notes:**
- Window: 900×700px, centered
- Chain row: 4 nodes connected with arrows (use simple SVG arrows in `--w7-blue-500`)
- Each chain node is a 140×100px glass panel with avatar + label + preview snippet
- Diff section: 2-column split, syntax-highlighted code; future enhancement: line-level red/green diff highlighting
- Score: huge number (`<ScoreNumber>`) in a tinted glass pill
- ELO row: each player's delta in green/red

---

## 5. Suggested Frontend File Structure

```
frontend/src/
├── app/
│   ├── layout.js              ← desktop background + <Superbar/>
│   ├── globals.css            ← token CSS vars + base resets
│   ├── page.js                ← landing / "boot" screen (optional)
│   ├── lobby/
│   │   ├── page.js            ← Lobby window
│   │   └── lobby.module.css
│   ├── game/
│   │   ├── page.js            ← Gameplay window (handles all 4 phases)
│   │   └── game.module.css
│   └── reveal/
│       ├── page.js            ← Reveal window
│       └── reveal.module.css
├── components/
│   ├── desktop/
│   │   ├── DesktopBackground.jsx
│   │   ├── Superbar.jsx
│   │   ├── StartOrb.jsx
│   │   └── Clock.jsx
│   ├── window/
│   │   ├── Window.jsx         ← App Window
│   │   ├── TintedWindow.jsx
│   │   ├── WindowControls.jsx
│   │   └── MenuBar.jsx
│   ├── glass/
│   │   ├── GlassPanel.jsx
│   │   └── TintedGlassPanel.jsx
│   ├── input/
│   │   ├── Button.jsx
│   │   ├── Checkbox.jsx
│   │   ├── Radio.jsx
│   │   ├── TextField.jsx
│   │   ├── TextArea.jsx
│   │   ├── Slider.jsx
│   │   └── NavOrb.jsx
│   ├── game/
│   │   ├── PlayerAvatar.jsx
│   │   ├── StatusDot.jsx
│   │   ├── PhaseTracker.jsx
│   │   ├── CodeEditorPanel.jsx
│   │   ├── DescriptionPanel.jsx
│   │   ├── Timer.jsx
│   │   └── ScoreNumber.jsx
│   └── icons/                  ← SVG icons (win flag, arrows, controls)
└── styles/
    └── mixins.css              ← reusable @apply-style class pieces (if used)
```

**Why this layout:**
- Components grouped by domain (`desktop`, `window`, `glass`, `input`, `game`) so the Aero UI primitives stay separate from game-specific UI
- Each route under `app/` is a single window — easy to mock with static placeholder data
- CSS Modules per route keep page-specific layout CSS scoped; design tokens live globally

---

## 6. Build Order (Recommendation)

To make incremental progress visible, build in this order. Each step should produce a screenshot-worthy artifact.

1. **Design tokens + desktop background + Superbar** — opening the app already feels like Windows 7
2. **`<Window>` + `<GlassPanel>`** — the two structural primitives everything else sits inside
3. **Input components** — Button, Checkbox, Radio, TextField (enough to build the Lobby)
4. **Lobby screen** — first real screen with mocked player data
5. **Gameplay screen — write phase** — code editor panel, timer, phase tracker, player list
6. **Gameplay screen — other phases** — describe, reimplement, waiting (just toggle which panel renders)
7. **Reveal screen** — chain visualization, diff view, score number, ELO row
8. **Polish pass** — window open/close transitions, Superbar clock ticking, status dot animations, sound effects

Each step is testable in isolation in a Next.js dev server with a hard-coded mock for the data the component needs.

---

## 7. References

- **Aero UI vector source** — [`./aero-reference/`](./aero-reference/) (12 SVGs, one per component; gradient stops extracted into §2)
- **Aero UI (Windows 7) Community** Figma kit — file ID `7gyDf4UNgoreGJKdIo5OmA` (original source for the SVGs above)
- **Project briefing** — [`./project-briefing.md`](./project-briefing.md)
