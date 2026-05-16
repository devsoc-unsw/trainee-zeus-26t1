"""Judge0 wrapper — execute code snippets against test inputs.

Submits code to the Judge0 sandboxing API and collects per-test
pass/fail results. Used as an optional behavioural-equivalence signal
for the AI judge.

Stub: the teammate implementing this fills in the body. Until then,
`run_code` raises NotImplementedError. This module is not called from
`manager.py` — it's a standalone utility for `scoring.py` (or any
future caller) to invoke as desired.

See docs/superpowers/specs/2026-05-16-ai-judge-judge0-stubs.md.
"""
from __future__ import annotations

from typing import Literal

from app.game.schemas import TestCase, TestResult


async def run_code(
    code: str,
    language: Literal["python", "javascript", "java"],
    tests: list[TestCase],
) -> list[TestResult]:
    """Execute `code` against each test in `tests`. Return one result per test.

    Implementation notes for the teammate:
    - Submit each test to Judge0 (https://judge0.com or self-hosted).
    - Map `language` to Judge0's language IDs (Python 3 = 71, JS = 63,
      Java = 62 at time of writing — verify against current Judge0 docs).
    - Add JUDGE0_API_URL and JUDGE0_API_KEY to backend env config.
    - Add an HTTP client to backend/requirements.txt if not already present
      (httpx is already a transitive dep via supabase).
    - Write tests in backend/tests/test_code_execution.py — mock the HTTP
      layer; do not call the real Judge0 in unit tests.
    """
    # TODO: implement
    raise NotImplementedError(
        "run_code is not yet implemented. "
        "See docs/superpowers/specs/2026-05-16-ai-judge-judge0-stubs.md"
    )
