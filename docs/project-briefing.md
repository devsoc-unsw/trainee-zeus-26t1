# Code Telephone — Project Briefing

## Overview

Code Telephone is a multiplayer browser game in the spirit of Gartic Phone, but built around code instead of drawing. A function passes through a chain of players, alternating between code and English, and the gap between the original and the reconstruction gets scored at the end.

## The game loop

A round runs in four phases:

1. **Write** — Player A is given a written prompt and writes a function that satisfies it.
2. **Describe** — Player B receives only the function (the prompt is hidden) and must summarise in plain English what they think it does.
3. **Reimplement** — Player C receives only Player B's description and writes a new function based on it.
4. **Reveal** — The full chain is laid out next to itself. An AI judge scores how semantically close the reconstructed function is to the original.

The fun lives in how the meaning warps between code and prose. A clean function with a misleading variable name will produce a wildly wrong reconstruction; a strong description can survive a sloppy intermediate.

## Stretch goals

The shipping v1 covers the chain and the reveal. Beyond that:

- **AI judge scoring** that measures semantic similarity rather than text similarity, so two functions that compute the same thing in different styles score highly.
- **Live code execution** through the Judge0 API, so the AI judge can also run both functions against test inputs and use behavioural equivalence as a signal.
- **Spectator mode** where non-players can watch a round live and place bets on how close the final reconstruction will land.
- **ELO** per player so the scoring has stakes across sessions.
- **Cross-language judging**, so player A can write Python, player C can write JavaScript, and the judge normalises across them.
- **Replay**, so after the reveal the whole chain can be stepped through to see exactly where meaning was lost.

## Tech stack

| Layer        | Choice |
|--------------|--------|
| Frontend     | Next.js (App Router), plain JavaScript, CSS Modules |
| Backend      | FastAPI (Python) |
| Persistent DB | PostgreSQL — users, ELO, replays |
| Cache / game state | Redis — current round, active connections, ephemeral state |
| Realtime     | WebSockets on FastAPI (Socket.io vs. native TBD) |
| Code execution | Judge0 API |
| AI scoring   | Anthropic Claude API |
| Auth scaffolding | Supabase JS client (already wired in the frontend) |

### Why split the frontend and backend

Next.js API routes are designed for request/response. The game is a long-lived shared state where many clients need to see each other's actions in real time, so the server has to hold state and push to clients. A separate FastAPI process gives us:

- A persistent WebSocket server that isn't fighting Next.js's serverless model.
- An async runtime that's comfortable orchestrating background work — Judge0 calls, AI scoring, ELO updates.
- An authoritative source of truth that all clients reconcile against.

## Visual direction

The whole product runs inside a recreation of the Windows 7 desktop. This is the central design decision and everything else hangs off it.

The brief is to do Aero faithfully — not as a joke, not as winking nostalgia, but as a serious recreation that holds up to scrutiny from someone who actually used Windows 7. Every screen is a window with proper chrome. The Superbar is always present at the bottom. Glass surfaces have the right gradient bands and diagonal sheen. Buttons have the metallic mid-ledge that Win7 buttons had.

This direction does a few useful things at once:

- It gives the product a strong identity that nothing else on the web is doing right now.
- It makes the multiplayer state legible — every player's progress is a window taskbar item, and the desktop is the shared space.
- It maps naturally to the game's structure: each phase is a distinct window state, and transitions feel like opening and closing apps rather than navigating routes.

The detailed visual system — colour tokens, gradient stops extracted from the Aero source SVGs, per-component specs, and screen layouts — lives in [`ui-design.md`](./ui-design.md).

## Team

This is a DevSoc (UNSW Software Development Society) training project: two training leads and three trainees. Org GitHub at https://github.com/orgs/devsoc-unsw/repositories.

DevSoc's house stack is Next.js + TypeScript. This project diverges by adding a Python backend (justified above) and by using plain JS on the frontend for the initial scaffold — TypeScript can be reintroduced later if useful.

## Constraints worth flagging

- **Scope is ambitious by design.** This isn't a weekend project; the chain, the judge, the realtime layer, and the polish on the UI all matter.
- **No MERN.** PostgreSQL over MongoDB, TypeScript or Python over plain JS for any code that grows beyond a prototype.
- **Judge0 owns the code-execution sandboxing problem.** We don't run untrusted code ourselves.
- **Redis for game state, Postgres for persistence.** Rounds are short-lived and high-frequency; Redis is the right shape. ELO, users, and replays survive past a round and belong in Postgres.

## Current phase

We are building the static UI only. No game logic, no realtime layer, no API integration. The goal is for every screen to render correctly with mocked data, so that when the backend comes online there is a complete visual surface to wire it to.

Open product/integration questions are deferred until the static UI is in place:

- Judge0 API key — not needed yet.
- Anthropic API key — not needed yet.
- WebSocket transport choice (Socket.io vs. native) — not needed yet.
- Auth model (accounts vs. nickname + room code) — not needed yet.

Resolved:

- **Frontend boilerplate** stays. Next.js 16 (App Router, plain JS, CSS Modules) in `frontend/`, FastAPI in `backend/`.
- **Deployment** will split the two services across separate hosts; specifics TBD.
- **Design assets** are limited to the Aero UI source SVGs at [`./aero-reference/`](./aero-reference/). All CSS is built from those.
