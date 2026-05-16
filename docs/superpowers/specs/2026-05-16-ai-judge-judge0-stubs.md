# AI Judge + Judge0 Stubs — Design

**Date:** 2026-05-16
**Status:** Approved, ready for implementation
**Scope:** Backend Python stubs for AI semantic scoring (Gemini free tier) and code execution (Judge0), plus integration of the scoring call into the existing `_finish_game` flow.

**Related:** Subsystem #2 of the "game logic stubs" series. Subsystem #1 (frontend round networking) is complete. Subsystems #3 (ELO/persistence) and #4 (reveal screen) follow.

## Goal

Define the public surface and integration point for two future services: an AI judge that scores how semantically close each chain's reconstructed code is to the original, and a Judge0 wrapper that runs code snippets against test inputs. Stubs only — bodies raise `NotImplementedError`. Two teammates can fill them in independently.

## Scope

**In:**
- New module `backend/app/game/scoring.py` with `score_chain()`
- New module `backend/app/game/code_execution.py` with `run_code()`
- New Pydantic models in `backend/app/game/schemas.py`: `ChainScore`, `TestCase`, `TestResult`
- Wiring `score_chain` into `manager.py:_finish_game` via a best-effort helper that swallows `NotImplementedError` so the reveal still works without scoring
- `game:reveal` payload contract change: now `{chains, scores?}` instead of `{chains}`

**Out (deferred):**
- The actual Gemini API integration
- The actual Judge0 HTTP integration
- API key management / env vars
- Caching, rate limiting, retries
- Per-segment scoring (only overall start-to-end for v1)
- Prompts for the AI judge (teammate writes the prompt template)

## File Structure

```
backend/app/game/
├── manager.py          ← (existing — wire score_chain into _finish_game)
├── room.py             ← (existing — unchanged)
├── schemas.py          ← (existing — add ChainScore, TestCase, TestResult)
├── prompts.py          ← (existing — unchanged)
├── scoring.py          ← NEW: score_chain() — Gemini free tier (2.5 Flash)
└── code_execution.py   ← NEW: run_code() — Judge0 API
```

Two separate files because the services have different external dependencies (Gemini SDK vs. Judge0 HTTP) and will likely be implemented by different teammates.

## Public Surface

### `scoring.py`

```python
async def score_chain(chains: list[dict[str, Any]]) -> list[ChainScore]:
    """Score the semantic similarity start-to-end for each chain.

    For each chain, compares the original code (segment[0].content) to the
    reconstructed code (the last `code` segment) and returns a 0.0-1.0
    similarity score with optional rationale.

    The implementer is expected to call the Gemini API (free tier,
    `gemini-2.5-flash`, structured output via `response_schema`) and
    parse the JSON response. See `docs/project-briefing.md` for the
    stretch-goal description of the semantic-similarity judging.

    Cost policy: free tier only — never enable billing. When quotas
    exhaust, exceptions bubble up to `_score_chains_safe` and the
    reveal proceeds without scores until the quota resets.

    Raises NotImplementedError until the teammate fills in the body.
    """
    raise NotImplementedError(...)
```

### `code_execution.py`

```python
async def run_code(
    code: str,
    language: Literal["python", "javascript", "java"],
    tests: list[TestCase],
) -> list[TestResult]:
    """Submit code to Judge0 and collect per-test results.

    `tests` are stdin/stdout pairs. Each result reports pass/fail,
    actual output, and any runtime error.

    Standalone utility — not called from manager.py yet. The teammate
    implementing `score_chain` may choose to call it as a secondary
    signal (behavioural equivalence), but that decision is theirs.

    Raises NotImplementedError until the teammate fills in the body.
    """
    raise NotImplementedError(...)
```

### `schemas.py` — new Pydantic models

```python
class ChainScore(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    chain_index: int = Field(alias="chainIndex")   # 0-indexed
    overall_score: float = Field(alias="overallScore")  # 0.0 - 1.0
    notes: str | None = None


class TestCase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    stdin: str
    expected_stdout: str = Field(alias="expectedStdout")


class TestResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    passed: bool
    actual_stdout: str = Field(alias="actualStdout")
    runtime_ms: int | None = Field(default=None, alias="runtimeMs")
    error: str | None = None
```

camelCase aliases match the existing project convention (all wire-format JSON fields are camelCase).

## Manager Integration

The current `_finish_game` (line 528 of `manager.py`) is:

```python
async def _finish_game(self, room: Room) -> None:
    chains = self._chains_payload(room)
    await self._broadcast(room, "game:reveal", {"chains": chains})
    # ... game:over delayed
```

New version adds the scoring call:

```python
async def _finish_game(self, room: Room) -> None:
    chains = self._chains_payload(room)
    scores = await self._score_chains_safe(chains)
    payload: dict[str, Any] = {"chains": chains}
    if scores is not None:
        payload["scores"] = [s.model_dump(mode="json", by_alias=True) for s in scores]
    await self._broadcast(room, "game:reveal", payload)
    # ... existing game:over delayed logic unchanged
```

Plus a new helper method on `GameHub`:

```python
async def _score_chains_safe(
    self, chains: list[dict[str, Any]]
) -> list[ChainScore] | None:
    """Best-effort scoring — never blocks the reveal."""
    try:
        from app.game.scoring import score_chain
        return await score_chain(chains)
    except NotImplementedError:
        logger.info("score_chain not implemented; reveal has no scores")
        return None
    except Exception:
        logger.warning("score_chain failed", exc_info=True)
        return None
```

**Properties of this wiring:**

- The reveal still works without scoring (frontend treats `scores` as optional).
- When the teammate implements `score_chain`, scores appear automatically.
- Any failure in scoring (network, API key missing, exception) is caught and logged; the game-flow continues.
- The lazy `import` inside the helper means missing Gemini SDK won't crash module load.

## Protocol Change

`game:reveal` payload:

| Field | Before | After |
|---|---|---|
| `chains` | required | required |
| `scores` | absent | optional — present when scoring is implemented |

Update `docs/API.md` and `backend/openapi.yaml` to reflect the new optional field. (Spec self-review check: confirm both docs get updated.)

## What the Teammate Inherits

When they open `scoring.py`, they should be able to:

1. Read the docstring to understand what the function should do.
2. Read the input shape (`chains` is the camelCase JSON output of `_chains_payload`).
3. Read the output shape (`list[ChainScore]`).
4. Decide how to build the Claude API prompt and parse its response.
5. Add env-var config (`GEMINI_API_KEY` — get one at https://aistudio.google.com/apikey, no billing required) and the `google-genai` SDK to `backend/requirements.txt`.
6. Implement, write tests in `backend/tests/test_scoring.py`, and submit a PR.

Same structure for `code_execution.py` — input/output shapes are clear; they decide on Judge0 endpoint config (`JUDGE0_API_URL`, `JUDGE0_API_KEY`) and request format.

## Acceptance

- `pytest` still passes (existing tests don't reference the new modules).
- A new game flow ends without crashing — `_finish_game` runs, `score_chain` raises `NotImplementedError`, the helper catches it, and `game:reveal` broadcasts `{chains}` with no `scores` field.
- A teammate can fill in `score_chain` or `run_code` independently without touching `manager.py` again.
