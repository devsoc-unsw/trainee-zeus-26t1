# Gemini AI Judge Implementation — Design

**Date:** 2026-05-17
**Status:** Approved, ready for implementation
**Branch:** `ai-scoring`
**Scope:** Fill in `backend/app/game/scoring.py:score_chain()`. Stub raises `NotImplementedError` today; replace with a real Gemini API call that scores each chain's semantic similarity. The reveal screen already handles the optional `scores` field gracefully — this work just makes the field appear.

**Related:** Stub design at `docs/superpowers/specs/2026-05-16-ai-judge-judge0-stubs.md`. This spec is the implementation pass for the `scoring.py` half only. `code_execution.py` (Judge0) remains stubbed.

## Goal

When a game ends, `_finish_game` calls `score_chain(chains)`. Today that raises `NotImplementedError`, caught by `_score_chains_safe`, and the reveal proceeds without scores. After this work, each chain gets a 0.0–1.0 semantic similarity score comparing the original code (segment 0) to the final reconstructed code (last `code`-type segment).

## Approach

- Use **Google's `google-genai` SDK** (the newer one, NOT the deprecated `google-generativeai`).
- Model: **`gemini-2.5-flash`** — free tier, fast, plenty good for 50-line code snippets.
- **Structured output** via `response_mime_type="application/json"` + a `response_schema` that mirrors `ChainScore` minus the chain index (one call per chain, so we add the index ourselves).
- **One Gemini call per chain**, fired concurrently with `asyncio.gather`. With typical 3–5 chains per game, the latency is dominated by the slowest single call (~2 seconds for Flash on short prompts).
- **Cost policy:** free tier only. When quota hits 429, the exception bubbles up to `_score_chains_safe`, which logs and returns None — reveal shows "Score pending". Resumes the next day when quota resets.

## Configuration

- New env var: `GEMINI_API_KEY`. Get one at <https://aistudio.google.com/apikey> — no billing required for the free tier.
- Add to `.env.example` with a placeholder.
- Backend `requirements.txt`: add `google-genai>=0.3.0`.

## File-level changes

### `backend/app/game/scoring.py` (replace body of `score_chain`)

Current:
```python
async def score_chain(chains: list[dict[str, Any]]) -> list[ChainScore]:
    raise NotImplementedError(...)
```

New:
```python
import asyncio
import json
import logging
import os
from typing import Any

from google import genai
from google.genai import types

from app.game.schemas import ChainScore

logger = logging.getLogger(__name__)

_MODEL = "gemini-2.5-flash"

_PROMPT = """\
You are scoring a "Code Telephone" round. A function passed through a chain of
players, alternating code and English. Compare the ORIGINAL code to the FINAL
reconstructed code and return a single semantic similarity score between 0.0
and 1.0.

Scoring rubric:
- 1.0 = the two functions compute the same thing on the same inputs (variable
  names, style, and minor structural differences are irrelevant).
- 0.7 = same general intent, but at least one observable behaviour differs
  (edge case, return shape, off-by-one).
- 0.4 = related concept but functionally different.
- 0.0 = unrelated.

Use `notes` (one short sentence) to explain the score. Be concise.

ORIGINAL CODE:
```
{original}
```

RECONSTRUCTED CODE:
```
{reconstructed}
```
"""

_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "overall_score": {"type": "number", "minimum": 0.0, "maximum": 1.0},
        "notes": {"type": "string"},
    },
    "required": ["overall_score"],
}


async def score_chain(chains: list[dict[str, Any]]) -> list[ChainScore]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    client = genai.Client(api_key=api_key)

    async def score_one(idx: int, chain: dict[str, Any]) -> ChainScore:
        segments = chain.get("segments", [])
        if not segments:
            return ChainScore(chain_index=idx, overall_score=0.0, notes="empty chain")
        original = segments[0].get("content", "")
        reconstructed_seg = next(
            (s for s in reversed(segments) if s.get("roundType") == "code"),
            segments[-1],
        )
        reconstructed = reconstructed_seg.get("content", "")

        prompt = _PROMPT.format(original=original, reconstructed=reconstructed)

        response = await client.aio.models.generate_content(
            model=_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_RESPONSE_SCHEMA,
            ),
        )

        parsed = json.loads(response.text)
        return ChainScore(
            chain_index=idx,
            overall_score=float(parsed["overall_score"]),
            notes=parsed.get("notes"),
        )

    return await asyncio.gather(
        *(score_one(i, c) for i, c in enumerate(chains)),
    )
```

The `asyncio.gather` raises on first failure. `_score_chains_safe` in `manager.py` catches any exception and returns None, so partial-failure semantics are: all-or-nothing per game. Acceptable for v1; partial results can wait.

### `backend/requirements.txt`

Add:
```
google-genai>=0.3.0
```

### `.env.example`

Add a section:
```
# ── AI judge (optional) ────────────────────────────────────────────
# Free Gemini API key from https://aistudio.google.com/apikey.
# When unset or quota exhausted, scoring is skipped and the reveal
# screen shows "Score pending".
GEMINI_API_KEY=
```

### `frontend/src/app/reveal/page.jsx`

**No change required** — the reveal screen already reads `useRound().chains[*]` and the score pill already handles `null` as "Score pending". Once the backend emits `scores` on `game:reveal`, the existing JSX picks them up.

(Note: the frontend may also need to hydrate the score from the chain payload. Confirm during integration. If `useRound` doesn't store `scores` separately yet, add a `scores` field to its state alongside `chains` — see Open items.)

## Scope

**In:**
- `scoring.py` body.
- `requirements.txt` dep.
- `.env.example` env var documentation.

**Out:**
- Per-segment scoring (only start-to-end for v1).
- Caching responses across games.
- Retries on transient errors (Gemini's SDK has reasonable defaults).
- Judge0 / `code_execution.py` — separate task.
- Frontend `useRound` extension to store `scores` — see Open items.

## Acceptance

- `pytest -v` still passes (no new tests required for v1; existing tests cover the stub-state path via `NotImplementedError` catching).
- With `GEMINI_API_KEY` set in `.env` and a real game played end-to-end, `game:reveal` payload includes a `scores` array with one entry per chain. Verify via browser devtools Network → WS frames.
- With `GEMINI_API_KEY` unset, scoring still bubbles a `RuntimeError` which `_score_chains_safe` catches; reveal renders without scores. Verified by running a game without the env var set.
- The reveal screen continues to work whether or not scores are populated.

## Open items

- The frontend `useRound` hook does not currently store the `scores` field from `game:reveal`. Adding it is a 2-line patch (`scores: data?.scores ?? null` alongside `chains` in the `on("game:reveal", ...)` handler) and is the bridge that lets `<ScoreNumber>` actually display the AI verdict instead of "Score pending". The teammate implementing this scoring task should add that field too — it's the last mile of value delivery.
- Prompt engineering: the rubric above is opinionated. Iterate after seeing real game data.
