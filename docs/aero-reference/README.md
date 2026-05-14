# Aero UI Reference SVGs

Source files extracted from the **Aero UI (Windows 7) Community** Figma kit (file ID `7gyDf4UNgoreGJKdIo5OmA`). One SVG per component page. Renamed from the original `Basic Input-*.svg` / `Shell-*.svg` naming for clarity.

| File | Component | Notes |
|---|---|---|
| `button.svg` | Button | Rest + hover states, vertical 3-stop greys; hover adds a blue overlay |
| `checkbox.svg` | Checkbox | None / selected / indeterminate, plain + text-after |
| `radio-button.svg` | Radio Button | Rest / hover / pressed, plain + text-after |
| `text-field.svg` | Text Field | Single-line input |
| `dial-slider.svg` | Dial Slider | Horizontal slider with thumb + ticks |
| `navigation.svg` | Navigation orbs | The blue glossy back/forward circles |
| `aero-glass.svg` | Aero Glass | The base translucent glass surface |
| `tinted-glass.svg` | Tinted Glass | Glass with a coloured fill layer |
| `app-window.svg` | App Window | Title bar + window controls + content |
| `tinted-app-window.svg` | Tinted App Window | Variant with tinted title bar |
| `superbar.svg` | Superbar (taskbar) | Start orb + pinned icons + clock |
| `file-menu.svg` | File Menu (Menu Bar) | Horizontal menu strip |

## How to use these

These are the source of truth for colour values, gradient stops, and proportions. When implementing a component:

1. Open the SVG in a browser or vector editor to see it at full scale
2. Inspect the `<linearGradient>` / `<radialGradient>` definitions for exact stop colours and offsets
3. Match those values in CSS — see [`../ui-design.md`](../ui-design.md) for the already-extracted design tokens

## Caveats

- **Text was outlined to paths.** The SVGs have no `<text>` elements — labels are vector paths. Refer to the briefing for typography (`Segoe UI`).
- **Some elements use rasters.** The Superbar SVG embeds raster images for the IE/Explorer/Media Player icons. The Start Orb itself is rendered as multi-stop gradients (see the extracted values in `ui-design.md`).
- **No interactive states for some components.** Only what was drawn in the Figma kit is here — pressed states for buttons, focus rings for inputs, disabled states, etc. need to be designed by extending the visual language.
