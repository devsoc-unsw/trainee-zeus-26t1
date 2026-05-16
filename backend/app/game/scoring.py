"""AI judge — semantic similarity scoring for completed chains.

Calls the Anthropic Claude API to compare each chain's original code
to its final reconstructed code and return a 0.0-1.0 similarity score.

Stub: the teammate implementing this fills in the body. Until then,
`score_chain` raises NotImplementedError; the caller in `manager.py`
catches that and the reveal proceeds without scoring.

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
    - Use the Anthropic Claude API with a structured-output prompt.
    - Add ANTHROPIC_API_KEY to backend env config.
    - Add the `anthropic` SDK to backend/requirements.txt.
    - Write tests in backend/tests/test_scoring.py.
    """
    # TODO: implement
    raise NotImplementedError(
        "score_chain is not yet implemented. "
        "See docs/superpowers/specs/2026-05-16-ai-judge-judge0-stubs.md"
    )
