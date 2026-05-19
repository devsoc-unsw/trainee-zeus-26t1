# Per-round language picker — Design

**Date:** 2026-05-19
**Status:** Approved, ready for implementation
**Branch:** `select_language`
**Scope:** Let each player choose Python, JavaScript, or Java when writing code (round 1 and odd re-implement rounds). Persist the choice on `round:submit` and surface it on `game:reveal` so the reveal screen syntax-highlights each segment in the writer's language.

## Goal

- `/editor` and `/reimplement` show a language picker above the code editor.
- Submit sends `{ content, language }` on code rounds.
- Reveal read-only editors use `segment.language` (fallback `python`).

## Wire contract

| Event | Field | Type | Notes |
|-------|-------|------|-------|
| `round:submit` | `language` | `"python"` \| `"javascript"` \| `"java"` | Optional on code rounds; defaults to `"python"` if omitted. Ignored on describe rounds. |
| `round:ended` | `submissions[].language` | same \| `null` | `null` on describe submissions. |
| `game:reveal` | `chains[].segments[].language` | same \| `null` | `null` on describe segments. |

## Out of scope

- Waiting-room game-wide language radios (stay decorative).
- Supabase persistence of language.
- `localStorage` remembering last pick (defaults to Python each code round).

## References

- [`frontend/src/lib/highlight.js`](../../../frontend/src/lib/highlight.js) — supported languages.
- [`docs/API.md`](../../API.md) — integrator summary.
