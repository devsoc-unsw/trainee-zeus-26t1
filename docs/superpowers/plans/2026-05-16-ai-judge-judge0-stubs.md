# AI Judge + Judge0 Stubs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create Python stubs (signatures + docstrings + `raise NotImplementedError` bodies) for the AI judge and Judge0 services, and wire `score_chain` into `manager.py:_finish_game` so the call site is reachable. A teammate will fill in the bodies.

**Architecture:** Two new modules under `backend/app/game/`: `scoring.py` (Anthropic Claude — calls `score_chain`) and `code_execution.py` (Judge0 — calls `run_code`). New Pydantic models (`ChainScore`, `TestCase`, `TestResult`) live in the existing `schemas.py`. `_finish_game` gains a best-effort `_score_chains_safe` helper that catches `NotImplementedError` so the reveal still works without scoring.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, asyncio. No new dependencies in this pass — the teammate filling in `score_chain` will add the Anthropic SDK, and the teammate filling in `run_code` will add an HTTP client.

**Spec:** `docs/superpowers/specs/2026-05-16-ai-judge-judge0-stubs.md`

**Commit policy:** Do not auto-commit. Leave changes unstaged so the user can review and commit themselves.

---

## File Map

- **Modify:** `backend/app/game/schemas.py` — add `ChainScore`, `TestCase`, `TestResult` models
- **Create:** `backend/app/game/scoring.py` — `score_chain()` stub
- **Create:** `backend/app/game/code_execution.py` — `run_code()` stub
- **Modify:** `backend/app/game/manager.py` — wire `_score_chains_safe` helper, update `_finish_game`
- **Modify:** `docs/API.md` — note new optional `scores` field on `game:reveal`
- **Modify:** `backend/openapi.yaml` — note new optional `scores` field in the description

---

## Task 1: Add Pydantic models to `schemas.py`

**Files:**
- Modify: `backend/app/game/schemas.py` — append at end, before `outbound_event`/`camelize_model` helpers

- [ ] **Step 1: Read the current end of the file**

Open `backend/app/game/schemas.py`. The file currently ends with `RoundSubmitPayload` followed by two helper functions (`outbound_event`, `camelize_model`). The new models go BEFORE those helper functions.

- [ ] **Step 2: Add the new models**

Insert the following block immediately after the `RoundSubmitPayload` class and BEFORE the `def outbound_event(...)` line. Keep `Literal` imported at the top of the file (it already is).

```python
# --- Scoring & code execution payloads ---


class ChainScore(BaseModel):
    """Per-chain semantic-similarity score returned by the AI judge."""

    model_config = ConfigDict(populate_by_name=True)

    chain_index: int = Field(alias="chainIndex")
    overall_score: float = Field(alias="overallScore")
    notes: str | None = None


class TestCase(BaseModel):
    """A single Judge0 test input/expected-output pair."""

    model_config = ConfigDict(populate_by_name=True)

    stdin: str
    expected_stdout: str = Field(alias="expectedStdout")


class TestResult(BaseModel):
    """Outcome of running a single test case through Judge0."""

    model_config = ConfigDict(populate_by_name=True)

    passed: bool
    actual_stdout: str = Field(alias="actualStdout")
    runtime_ms: int | None = Field(default=None, alias="runtimeMs")
    error: str | None = None
```

- [ ] **Step 3: Verify the file parses**

Run from the repo root:

```bash
python -c "from backend.app.game import schemas; print(schemas.ChainScore, schemas.TestCase, schemas.TestResult)"
```

Expected: three class reprs printed, no traceback.

If the `python -c` import path doesn't resolve from the repo root, use the working pattern the existing tests use:

```bash
cd backend && python -c "from app.game import schemas; print(schemas.ChainScore, schemas.TestCase, schemas.TestResult)"
```

Expected: `<class 'app.game.schemas.ChainScore'> <class 'app.game.schemas.TestCase'> <class 'app.game.schemas.TestResult'>`.

---

## Task 2: Create `scoring.py`

**Files:**
- Create: `backend/app/game/scoring.py`

- [ ] **Step 1: Write the file**

Write this exact content to `backend/app/game/scoring.py`:

```python
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
```

- [ ] **Step 2: Verify the file parses**

Run from the repo root:

```bash
cd backend && python -c "from app.game.scoring import score_chain; print(score_chain)"
```

Expected: `<function score_chain at 0x...>` printed, no traceback.

---

## Task 3: Create `code_execution.py`

**Files:**
- Create: `backend/app/game/code_execution.py`

- [ ] **Step 1: Write the file**

Write this exact content to `backend/app/game/code_execution.py`:

```python
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
```

- [ ] **Step 2: Verify the file parses**

Run from the repo root:

```bash
cd backend && python -c "from app.game.code_execution import run_code; print(run_code)"
```

Expected: `<function run_code at 0x...>` printed, no traceback.

---

## Task 4: Wire `_finish_game` to call scoring

**Files:**
- Modify: `backend/app/game/manager.py` — `_finish_game` (line 528) + add new `_score_chains_safe` helper

- [ ] **Step 1: Add the import**

Locate the existing import block at the top of `manager.py`. It currently includes:

```python
from app.game.schemas import (
    GameSyncPayload,
    RoomCreatePayload,
    RoomJoinPayload,
    RoundSeed,
    RoundSubmitPayload,
    outbound_event,
    camelize_model,
)
```

Add `ChainScore` to this list (keep the alphabetical-ish ordering — insert before `GameSyncPayload`):

```python
from app.game.schemas import (
    ChainScore,
    GameSyncPayload,
    RoomCreatePayload,
    RoomJoinPayload,
    RoundSeed,
    RoundSubmitPayload,
    outbound_event,
    camelize_model,
)
```

- [ ] **Step 2: Replace `_finish_game`**

The current `_finish_game` method (starts at line 528) looks like:

```python
    async def _finish_game(self, room: Room) -> None:
        chains = self._chains_payload(room)
        await self._broadcast(room, "game:reveal", {"chains": chains})

        async def _over_delayed() -> None:
            rid = room.id
            rc = room.round_count
            await asyncio.sleep(REVEAL_TO_OVER_SEC)
            async with room.lock:
                room.status = "over"
            await asyncio.to_thread(
                game_repository.persist_room_state,
                rid,
                status="over",
                current_round=rc,
            )
            await self._broadcast(room, "game:over", {})

        async with room.lock:
            if room.over_task:
                room.over_task.cancel()
            room.over_task = asyncio.create_task(_over_delayed())
```

Replace it with this version (the only changes are: build payload conditionally based on scoring result, and add a helper method below):

```python
    async def _finish_game(self, room: Room) -> None:
        chains = self._chains_payload(room)
        scores = await self._score_chains_safe(chains)
        payload: dict[str, Any] = {"chains": chains}
        if scores is not None:
            payload["scores"] = [
                s.model_dump(mode="json", by_alias=True) for s in scores
            ]
        await self._broadcast(room, "game:reveal", payload)

        async def _over_delayed() -> None:
            rid = room.id
            rc = room.round_count
            await asyncio.sleep(REVEAL_TO_OVER_SEC)
            async with room.lock:
                room.status = "over"
            await asyncio.to_thread(
                game_repository.persist_room_state,
                rid,
                status="over",
                current_round=rc,
            )
            await self._broadcast(room, "game:over", {})

        async with room.lock:
            if room.over_task:
                room.over_task.cancel()
            room.over_task = asyncio.create_task(_over_delayed())

    async def _score_chains_safe(
        self, chains: list[dict[str, Any]]
    ) -> list[ChainScore] | None:
        """Best-effort scoring — never blocks the reveal.

        Lazy-imports `scoring` so a missing Anthropic SDK doesn't crash
        the hub on module load. Catches NotImplementedError (stub state)
        and any runtime failure; logs and returns None.
        """
        try:
            from app.game.scoring import score_chain
            return await score_chain(chains)
        except NotImplementedError:
            logger.info("score_chain not implemented; reveal has no scores")
            return None
        except Exception:  # noqa: BLE001
            logger.warning("score_chain failed", exc_info=True)
            return None
```

- [ ] **Step 3: Verify manager.py parses**

```bash
cd backend && python -c "from app.game.manager import GameHub; print(GameHub)"
```

Expected: `<class 'app.game.manager.GameHub'>` printed, no traceback.

- [ ] **Step 4: Run the existing test suite**

```bash
cd backend && pytest -v -x
```

Expected: all tests still pass (or skip, for integration tests). The scoring change should be transparent to existing tests because `NotImplementedError` is caught.

If pytest is not available, skip this step and rely on the import check above + the runtime check in Task 7.

---

## Task 5: Update `docs/API.md`

**Files:**
- Modify: `docs/API.md` — line 74 (the `game:reveal` row)

- [ ] **Step 1: Replace the `game:reveal` row**

The current line in the server-to-client events table:

```
| `game:reveal` | Final **chains** for the completed game. |
```

Replace with:

```
| `game:reveal` | Final **chains** for the completed game. May include optional **scores** (per-chain semantic-similarity, populated once AI judging is wired up — see `backend/app/game/scoring.py`). |
```

---

## Task 6: Update `backend/openapi.yaml`

**Files:**
- Modify: `backend/openapi.yaml` — top-of-file description block

- [ ] **Step 1: Add a sentence to the description**

The current `info.description` ends at line 18 with `See \`x-websocket\` for path and envelope details.`

Append one more line inside the description (so it becomes the second-to-last line of the description block, before `See \`x-websocket\`...`). The full updated description block should read:

```yaml
info:
  title: Code Telephone — Zeus backend
  version: 0.1.0
  description: |
    HTTP surface for health checks plus real-time game play over WebSockets.

    **WebSocket (`GET` upgrade to `/ws/game`)** — Messages are JSON objects with
    shape `{ "event": "<name>", "data": { ... } }` (`data` may be an empty object).

    **Client → server events:** `room:create`, `room:join`, `room:leave`, `game:start`,
    `round:submit`, `game:sync`, `game:reset`.

    **Server → client events:** `room:created`, `room:joined`, `room:updated`, `room:error`,
    `game:started`, `round:begin`, `round:player_submitted`, `round:ended`, `game:reveal`,
    `game:over`, `game:state`.

    The `game:reveal` payload contains `chains` (required) and may include `scores`
    (optional — populated once AI judging is implemented).

    See `x-websocket` for path and envelope details.
```

---

## Task 7: End-to-end smoke check

The stubs intentionally don't do work — verification is "imports resolve, no crashes."

- [ ] **Step 1: Import smoke test**

```bash
cd backend && python -c "
from app.game.schemas import ChainScore, TestCase, TestResult
from app.game.scoring import score_chain
from app.game.code_execution import run_code
from app.game.manager import GameHub
print('all imports OK')
"
```

Expected output: `all imports OK`.

- [ ] **Step 2: Confirm `_score_chains_safe` catches NotImplementedError**

```bash
cd backend && python -c "
import asyncio
from app.game.manager import GameHub
hub = GameHub()
result = asyncio.run(hub._score_chains_safe([]))
print('result:', result)
"
```

Expected output: `result: None`. (The helper also calls `logger.info(...)` — that log may or may not print depending on pytest/runtime log config; the important thing is the `None` return without an unhandled exception.)

- [ ] **Step 3: Run pytest**

```bash
cd backend && pytest -v -x
```

Expected: all existing tests pass (integration tests may skip with `RUN_SUPABASE_DB_TESTS` not set — that's fine).

If a test fails, **stop and report**. The scoring change is supposed to be transparent. If it's not, the helper or `_finish_game` change has a bug.

---

## Final review (don't commit)

- [ ] **Step 1: Show the diff**

```bash
git -C /mnt/d/Documents/trainee-zeus-26t1 status
git -C /mnt/d/Documents/trainee-zeus-26t1 diff --stat
```

Expected unstaged changes:
- New files: `backend/app/game/scoring.py`, `backend/app/game/code_execution.py`
- Modified: `backend/app/game/schemas.py`, `backend/app/game/manager.py`, `docs/API.md`, `backend/openapi.yaml`

(The spec doc at `docs/superpowers/specs/2026-05-16-ai-judge-judge0-stubs.md` is already in the working tree from the brainstorming step; the plan doc this file lives in is also untracked.)

- [ ] **Step 2: Hand off to the user**

Do NOT run `git add` or `git commit`. The user reviews and commits manually. Summarize what was created and where the teammate should start (the `# TODO: implement` markers in `scoring.py` and `code_execution.py`).
