# Handoff — Merge FastAPI Backend into Next.js

**Date:** 2026-05-20
**Branch:** `main` (changes are spec + plan docs only, no code touched yet)
**Status:** Brainstorm complete, spec approved, Plan 1 of 4 written. Plans 2–4 and execution still to do.

## What this handoff covers

The decision to collapse the split Next.js + FastAPI stack into a single Next.js app deployed to Vercel. The brainstorming session ran end-to-end: scope confirmed, architecture chosen, design spec written and self-reviewed, and the first implementation plan (Foundation) drafted.

No application code has been written. Everything in this handoff lives under `docs/superpowers/`.

## Locked decisions

| Area | Decision |
|---|---|
| Deploy target | One Vercel deploy |
| Realtime | Supabase Realtime (`postgres_changes`) — no separate WS server |
| Demo scope | Room + lobby + chain + AI judge + Judge0 |
| Deferred | ELO, accounts, replays, Supabase Auth |
| Port strategy | Full rewrite of Python game logic into TypeScript |
| Language | TypeScript across the codebase (permissive `allowJs` during migration) |
| AI judge provider | Google Gemini |
| Auth model | Signed-cookie nickname + room code, no accounts |
| Old `backend/` | Move to `legacy/backend/`, gitignored |
| Architecture | Postgres-as-truth + Route Handlers; clients are read-only subscribers (RLS-enforced) |
| Plan split | 4 plans (Foundation / Lobby / Game+Judge / Polish+Deploy) |

The full reasoning behind each choice is in the design spec.

## Files produced

- `docs/superpowers/specs/2026-05-20-nextjs-merge-design.md` — design spec, 8 sections, self-reviewed.
- `docs/superpowers/plans/2026-05-20-foundation.md` — Plan 1 of 4. 12 tasks, ~50 steps, covers Step 0 + Step 1 of the spec's migration plan (repo move, TypeScript config, 4 new SQL migrations including RLS, both Supabase clients, env vars rewritten, README rewritten).

Plans 2, 3, 4 are not yet written.

## What still needs writing (Plans 2–4)

Each plan's exit criterion comes straight from the spec's migration section.

| Plan | Covers spec step | Exit criterion |
|---|---|---|
| 2 — Lobby | Step 2 (Identity + room lifecycle) | Two browser tabs can create/join a room; lobby player list updates live over Realtime. |
| 3 — Game + AI Judge | Step 3 + Step 4 (Round mechanic, Reveal, Gemini judging) | 3-player chain runs end-to-end. Reveal shows AI scores streaming in per chain. |
| 4 — Polish + Deploy | Step 5 + Step 6 (Judge0, deploy) | Judge0 results feed the score when available; reveal unaffected when not. Live demo URL on Vercel. |

Drafting each plan should mirror Plan 1's structure: per-file table at the top, then ≥10 tasks of 3–6 steps each, each step concrete enough to execute without re-reading the spec, commit checkpoints framed as "Stop and wait for Andy" (see Andy preferences below).

## What still needs doing (execution)

After the plans are written, none of the implementation has been done. The shortest path:

1. **Plan 1 — Foundation.** Repo hoist, TypeScript config, 6 SQL migrations applied to Supabase, both Supabase clients, env cleanup, README rewrite. The dev server must still render the existing static UI at the end.
2. **Plan 2 — Lobby.** Signed-cookie session helper, `/api/rooms` (create/join/leave), Realtime `useRoom` hook, lobby page wired to live subscriptions.
3. **Plan 3 — Game + AI Judge.** Port `manager.py` → `lib/game/`. `/api/rooms/[code]/start`, `/submit`, `/reset`. Reveal page subscribes to `chain_scores`. Gemini integration.
4. **Plan 4 — Polish + Deploy.** Judge0 wrapper, fold test results into the judge prompt, Vercel env wiring, smoke E2E with Playwright, `vercel deploy`.

Each plan is independently demoable in its terminal state — if you only get Plans 1+2 done by demo day, you have a live lobby; Plans 1+2+3 gives you the full game minus Judge0; the full set gives you behavioral scoring and a public URL.

## How to resume

**If continuing the planning work:**
1. Read the spec at `docs/superpowers/specs/2026-05-20-nextjs-merge-design.md` so you have the architecture in your head.
2. Read Plan 1 at `docs/superpowers/plans/2026-05-20-foundation.md` to lock in style (granularity, code-block-per-step, commit checkpoint framing).
3. Invoke `superpowers:writing-plans` and draft Plan 2 (Lobby — spec's Step 2).
4. Repeat for Plans 3 and 4.

**If executing Plan 1:**
1. Read the spec and Plan 1.
2. Invoke `superpowers:subagent-driven-development` (one fresh subagent per task) or `superpowers:executing-plans` (inline, batched).
3. After each task, pause for Andy to run the commit — the executor must not run `git add`/`commit`/`push` itself (see preference below). The only `git` writes the executor performs are the `git mv` / `git rm --cached` calls inside Tasks 2–3, which are explicitly flagged.

## Andy preferences worth carrying forward

- **No AI-attributed git activity.** Andy runs all `git add`, `git commit`, `git push` himself. Plans frame these as "Commit checkpoint (Andy) — Stop and wait for Andy to commit." The only exceptions in Plan 1 are `git mv` and `git rm --cached`, which are required to make the repo move reviewable as a diff; both are called out explicitly in the plan.
- **Demo-focused over production-grade.** Andy explicitly preferred easiest-for-demo over thorough auth: nickname + room code, no Supabase Auth, no CSRF tokens, no rate limiting. Don't reintroduce these without asking.
- **TypeScript everywhere, permissively.** `allowJs: true`, `strict: false`, `checkJs: false` is the chosen starting state. Tighten file-by-file as you touch files; don't do a mass conversion.

## Known risks to watch

- **Vercel serverless timeouts.** AI judging multiple chains in one request can exceed the 60s Pro tier limit. Plan 3 sequences judging chain-by-chain and uses `chain_scores.status = 'pending' → 'done'` rows + Realtime so scores stream in. If a single chain takes > 60s, the design fails — break the judge route into a per-chain endpoint and have the client kick off N parallel requests instead. Decision point lives at Plan 3 Task ~6.
- **`socket_id` column drop.** Migration 004 drops `players.socket_id`. The old `frontend/src/lib/socket/` (now `lib/socket/` after Plan 1) still references it via the old Python WS protocol. Plan 2 deletes that whole directory and replaces it with `lib/realtime/`; if anything imports from `lib/socket/` after Plan 1 completes, it must be rewritten or deleted in Plan 2.
- **Migration numbering.** New migrations are `004_submissions_and_phases.sql`, `005_chain_scores.sql`, `006_rls.sql`. The existing `003_scoring_and_elo.sql` stays in place and dormant. If anyone has already started numbering migrations differently in a working tree, reconcile before applying.
- **`redesign/` folder.** Out of scope for this whole rework. Plan 1 explicitly excludes it from `tsconfig.json`. Don't fold it in without a separate brainstorm.

## Open questions parked for later

These came up during brainstorming and were explicitly deferred — not blockers for Plan 1.

- **Per-phase timers.** `rooms.phase_ends_at` is in the schema but not wired in anywhere. Decide before Plan 3 whether to add visible round timers; if yes, it's a small additional task in Plan 3.
- **AI judge fire-and-forget mechanism.** Spec leaves a choice between `waitUntil` from the submit handler vs. a separate `/api/judge/[roomId]` route the client posts to on reveal entry. Plan 3 should pick one. Recommend: separate endpoint — easier to retry from the client if the cold start fails.
- **Test database strategy.** Two options on the table: a second Supabase project for tests, or local `supabase start`. Pick at the start of Plan 2 (the first plan with route handlers that need integration tests).

## Out of scope (explicit)

So nothing creeps in during execution:

- ELO, accounts, replays, Supabase Auth.
- The `redesign/` folder.
- Cross-language judging (Python original + JS reconstruction).
- Parallel multi-chain judging.
- CSRF tokens and rate limiting.
- Per-phase timers (unless explicitly added — see open questions above).
- Production observability (Sentry, logs, etc.).

## Reference

- Spec: `docs/superpowers/specs/2026-05-20-nextjs-merge-design.md`
- Plan 1 of 4: `docs/superpowers/plans/2026-05-20-foundation.md`
- Plans 2–4: not yet written.
- Source code state at handoff: branch `main`, working tree clean. The split-stack code under `backend/` and `frontend/` is unchanged.

## Suggested next message to start picking this up

> Read `docs/superpowers/specs/2026-05-20-nextjs-merge-design.md` and `docs/superpowers/plans/2026-05-20-foundation.md`. Then either (a) draft Plan 2 (Lobby — spec's Step 2) by invoking `superpowers:writing-plans`, or (b) execute Plan 1 by invoking `superpowers:subagent-driven-development`. Confirm which before starting.
