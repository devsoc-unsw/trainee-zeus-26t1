"""AI judge — semantic similarity scoring for completed chains.

Calls the Gemini API (free tier — Gemini 2.5 Flash) to compare each
chain's original code to its final reconstructed code and return a
0.0-1.0 similarity score.

Cost / quota policy:
- Use the Gemini free tier only. Do NOT enable billing on the GCP
  project — when daily/minute quotas exhaust, the API will return
  errors that bubble up to `_score_chains_safe` in manager.py, which
  catches them, logs, and returns None. The reveal still happens,
  just without the optional `scores` field.
- For local dev: `GEMINI_API_KEY` env var. No billing setup needed.

See docs/superpowers/specs/2026-05-17-gemini-scoring-implementation.md.
"""
from __future__ import annotations

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
    """Score each chain's semantic similarity start-to-end.

    Raises RuntimeError if GEMINI_API_KEY is not set. Other failures
    bubble up to `_score_chains_safe` in manager.py.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or not api_key.strip():
        raise RuntimeError("GEMINI_API_KEY is not set")
    client = genai.Client(api_key=api_key.strip())

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

        parsed = json.loads(response.text or "{}")
        raw = float(parsed["overall_score"])
        score = max(0.0, min(1.0, raw))
        return ChainScore(
            chain_index=idx,
            overall_score=score,
            notes=parsed.get("notes"),
        )

    return list(
        await asyncio.gather(*(score_one(i, c) for i, c in enumerate(chains))),
    )
