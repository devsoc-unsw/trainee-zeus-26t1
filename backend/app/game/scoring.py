"""AI judge — semantic similarity scoring for completed chains.

Calls the Gemini API (free tier — Gemini 2.5 Flash) to compare each
chain's original code to its final reconstructed code and return a
0.0-1.0 similarity score.

Stub: the teammate implementing this fills in the body. Until then,
`score_chain` raises NotImplementedError; the caller in `manager.py`
catches that and the reveal proceeds without scoring.

Cost / quota policy:
- Use the Gemini free tier only. Do NOT enable billing on the GCP
  project — when daily/minute quotas exhaust, the API will simply
  return 429 errors and `_score_chains_safe` in manager.py will
  catch them, log, and return None. The reveal still happens, just
  without the optional `scores` field. AI judging "turns itself off"
  for the rest of the day; resumes next day when quota resets.
- For local dev: `GEMINI_API_KEY` env var. No billing setup needed.

See docs/superpowers/specs/2026-05-16-ai-judge-judge0-stubs.md.
"""
from __future__ import annotations

from typing import Any

from app.game.schemas import ChainScore


async def score_chain(chains: list[dict[str, Any]]) -> list[ChainScore]:
    """Score each chain's semantic similarity start-to-end.

    Input: the camelCase JSON output of `manager.GameHub._chains_payload` —
    a list of chains. Each chain has `startPlayerId`, `startPlayerName`,
    and `segments` (each segment has `roundNum`, `roundType`, `authorId`,
    `authorName`, `content`).

    Output: one ChainScore per input chain, with `chain_index` matching
    the input order.

    Implementation notes for the teammate:
    - Compare segment[0] (the original code) to the last `code`-type
      segment (the final reconstruction).
    - Use the Gemini API with `response_mime_type="application/json"`
      + `response_schema` for structured output.
    - Pick `gemini-2.5-flash` — fast, cheap, plenty good for this task.
    - Add GEMINI_API_KEY to backend env config (one key per developer;
      generate at https://aistudio.google.com/apikey).
    - Add the `google-genai` SDK to backend/requirements.txt (the new
      SDK — NOT the older `google-generativeai`).
    - Free-tier failures (429, quota exhausted, network blip) should
      bubble up as exceptions; `_score_chains_safe` catches them.
    - Write tests in backend/tests/test_scoring.py.
    """
    # TODO: implement
    raise NotImplementedError(
        "score_chain is not yet implemented. "
        "See docs/superpowers/specs/2026-05-16-ai-judge-judge0-stubs.md"
    )
