# Code Telephone — Documentation

Project documentation lives here. Start with the briefing, then dive into the area you're working on.

## Where to start

- **[`project-briefing.md`](./project-briefing.md)** — What we're building, why, the tech stack, and the constraints. Read this first.
- **[`build-status.md`](./build-status.md)** — Snapshot of what's actually built: routes (pages + API), components, lib modules, migrations, and what's still on the roadmap.
- **[`ui-design.md`](./ui-design.md)** — The full visual design system: tokens, component specs, and screen layouts. The token section is the source of truth for colour/gradient values.
- **[`superpowers/handoffs/`](./superpowers/handoffs/)** — Dated handoff notes from each major sweep. Read the most recent one to catch up on where things are.
- **[`aero-reference/`](./aero-reference/)** — Original SVG components from the Aero UI Figma kit, renamed by component. Open these in a browser or inspect their `<linearGradient>` defs when you need exact colour values that aren't already captured in `ui-design.md`.

## Where to put new docs

- Visual / UI work → extend `ui-design.md`. Don't fork it.
- Architecture, system design, infra → new file at `docs/architecture.md` (doesn't exist yet).
- Anything you research and want others to see → a new file in `docs/`, then link it here.
