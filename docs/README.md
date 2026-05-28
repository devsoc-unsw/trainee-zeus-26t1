# Code Telephone — Documentation

Project documentation lives here. Start with the briefing, then dive into the area you're working on.

## Where to start

- **[`project-briefing.md`](./project-briefing.md)** — What we're building, why, the tech stack, and the constraints. Read this first.
- **[`build-status.md`](./build-status.md)** — Snapshot of the UI surface: routes, components, design decisions. *(Note: written during the static-UI phase; the routes table is out of date — the live route list is in the root `README.md`.)*
- **[`ui-design.md`](./ui-design.md)** — The full visual design system: tokens, component specs, screen layouts, and the suggested frontend file structure. Source of truth for anything you're rendering.
- **[`aero-reference/`](./aero-reference/)** — Original SVG components from the Aero UI Figma kit, renamed by component. Open these in a browser or inspect their `<linearGradient>` defs when you need exact colour values that aren't already captured in `ui-design.md`.

## Where to put new docs

- Visual / UI work → extend `ui-design.md`. Don't fork it.
- Architecture, system design, infra → new file at `docs/architecture.md` (doesn't exist yet).
- Anything you research and want others to see → a new file in `docs/`, then link it here.
