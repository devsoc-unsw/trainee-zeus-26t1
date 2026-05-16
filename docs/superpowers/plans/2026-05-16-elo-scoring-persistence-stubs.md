# ELO + Scoring Persistence Stubs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new SQL migration (`users`, `games`, `game_scores`, `elo_history` tables), a pure-function ELO stub (`elo.py`), three new repository functions in `game_repository.py`, and wire `manager.py:_finish_game` to record every completed game. All bodies are stubbed; a teammate fills them in.

**Architecture:** Persistence stays best-effort (same pattern as existing `persist_room_*` functions — try/except, log on failure, never raise). The ELO calculator is a pure function (`elo.py`) so it can be unit-tested in isolation. Manager wiring catches `NotImplementedError` from `compute_elo_changes` and skips ELO updates until the teammate implements it. Schema is additive — only existing table change is a nullable `user_id` column on `players`.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, Supabase Postgres. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-16-elo-scoring-persistence-stubs.md`

**Commit policy:** Do not auto-commit. Leave changes unstaged so the user can review and commit themselves.

---

## File Map

- **Create:** `backend/sql/003_scoring_and_elo.sql` — additive migration
- **Create:** `backend/app/game/elo.py` — `compute_elo_changes()` pure-function stub
- **Modify:** `backend/app/db/game_repository.py` — append 3 functions (`persist_game_completed`, `persist_elo_updates`, `get_user_elo`)
- **Modify:** `backend/app/game/manager.py` — wire `_finish_game` + 2 new helpers (`_build_chain_score_rows`, `_compute_elo_updates_safe`)

---

## Task 1: Create the SQL migration

**Files:**
- Create: `backend/sql/003_scoring_and_elo.sql`

- [ ] **Step 1: Write the migration**

Write this exact content to `backend/sql/003_scoring_and_elo.sql`:

```sql
-- 003_scoring_and_elo.sql
-- Adds long-lived user identity, completed-game records, per-chain scores,
-- and ELO history. Run AFTER supabase_game_schema.sql and 002_rooms_round_count.sql.
-- All changes are additive; the only existing table touched is `players`,
-- which gains a nullable user_id column.

-- Long-lived user identity. Anonymous for now (no auth provider link);
-- teammate decides whether to backfill from Supabase Auth later.
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name varchar(32) NOT NULL,
  elo integer NOT NULL DEFAULT 1000,
  games_played integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Link ephemeral lobby players → long-lived users. Nullable so anonymous
-- play still works (no ELO impact when null).
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS players_user_id_idx ON players(user_id);

-- Completed game records (separate from `rooms`, which can be recycled).
CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  round_count smallint NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now()
);

-- One row per chain in a completed game.
CREATE TABLE IF NOT EXISTS game_scores (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  chain_index smallint NOT NULL,
  start_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  overall_score real NOT NULL,
  notes text,
  PRIMARY KEY (game_id, chain_index)
);

-- Append-only ELO log. Mirrors updates to users.elo.
CREATE TABLE IF NOT EXISTS elo_history (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  elo_before integer NOT NULL,
  elo_after integer NOT NULL,
  delta integer NOT NULL,
  ts timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS elo_history_user_idx ON elo_history(user_id, ts DESC);
```

- [ ] **Step 2: Verify the SQL is at least surface-syntactic**

There is no offline `pg_lint` step in this project. Visual checks:

- All `CREATE TABLE` and `CREATE INDEX` statements use `IF NOT EXISTS` so re-running is safe.
- Every FK references an existing column (`rooms.id`, `players.id`, `users.id`).
- `gen_random_uuid()` requires `pgcrypto` — already enabled by default on Supabase.

The teammate runs this migration in the Supabase SQL editor when they're ready to wire persistence. No CLI verification needed in this pass.

---

## Task 2: Create `backend/app/game/elo.py`

**Files:**
- Create: `backend/app/game/elo.py`

- [ ] **Step 1: Write the file**

Write this exact content to `backend/app/game/elo.py`:

```python
"""ELO rating updates from completed-game chain scores.

Pure functions, no I/O. The caller in `manager.py` is responsible for
loading current ELO values from the DB and persisting deltas afterwards.

Stub: the teammate filling this in chooses the exact formula.

See docs/superpowers/specs/2026-05-16-elo-scoring-persistence-stubs.md.
"""
from __future__ import annotations

K_FACTOR = 32           # standard for fast-moving rating systems
DEFAULT_ELO = 1000


def compute_elo_changes(players: list[dict]) -> list[dict]:
    """Compute per-player ELO deltas from chain performance.

    Input shape (one entry per player who has a user_id):
        [
            {"user_id": str, "current_elo": int, "chain_score": float},
            ...
        ]

    `chain_score` is the 0.0-1.0 semantic similarity score for the
    chain this player started.

    Output shape:
        [{"user_id": str, "before": int, "after": int, "delta": int}, ...]

    Implementation notes for the teammate:
    - Pairwise comparisons (each player vs each other) with standard
      ELO expected/actual scoring is a sensible default.
    - Suggestion: score difference > 0.5 → "win"; |diff| <= 0.1 → "draw";
      otherwise "loss". Adjust K_FACTOR for more/less volatile ratings.
    - Pure function — no DB calls, no logging.
    """
    # TODO: implement
    raise NotImplementedError(
        "compute_elo_changes is not yet implemented. "
        "See docs/superpowers/specs/2026-05-16-elo-scoring-persistence-stubs.md"
    )
```

- [ ] **Step 2: Verify the file's syntax**

Run from the repo root:

```bash
cd backend && python3 -m py_compile app/game/elo.py && echo "elo.py: SYNTAX OK"
```

Expected: `elo.py: SYNTAX OK`.

(Backend has no venv with pydantic installed locally on the WSL setup, so `python3 -c "import ..."` won't work for cross-module imports. `py_compile` is sufficient for stub verification — it parses without resolving imports.)

---

## Task 3: Append 3 functions to `game_repository.py`

**Files:**
- Modify: `backend/app/db/game_repository.py` — append to end of file

- [ ] **Step 1: Append the new functions**

Open `backend/app/db/game_repository.py` and append the following block to the end of the file (after the existing `persist_room_state` function):

```python


def persist_game_completed(
    game_id: str,
    room_id: str,
    round_count: int,
    chain_scores: list[dict[str, Any]] | None,
) -> None:
    """Insert one row into `games` and one row per chain into `game_scores`.

    If `chain_scores` is None (AI scoring not yet implemented or failed),
    the game row is still inserted with no `game_scores` rows — we know
    the game finished even without scores.

    `chain_scores` row shape (when not None):
        {"chain_index": int, "start_player_id": str | None,
         "overall_score": float, "notes": str | None}

    Best-effort — never raises. See spec
    docs/superpowers/specs/2026-05-16-elo-scoring-persistence-stubs.md.
    """
    sb = _client()
    if not sb:
        return
    # TODO: implement
    # - INSERT INTO games (id, room_id, round_count) VALUES (...)
    # - if chain_scores: bulk INSERT INTO game_scores (...) for each row
    # - consider an RPC for atomicity (audit notes recommend this)
    logger.debug("persist_game_completed stub: %s", game_id)


def persist_elo_updates(
    game_id: str,
    updates: list[dict[str, Any]],
) -> None:
    """Apply per-user ELO updates: update users.elo and append elo_history rows.

    `updates` row shape:
        {"user_id": str, "before": int, "after": int, "delta": int}

    Best-effort — never raises.
    """
    sb = _client()
    if not sb:
        return
    # TODO: implement
    # - for each update: UPDATE users SET elo = after, games_played = games_played + 1
    # - INSERT INTO elo_history (user_id, game_id, elo_before, elo_after, delta) VALUES (...)
    # - prefer an RPC for atomicity
    logger.debug("persist_elo_updates stub: %s updates for game %s", len(updates), game_id)


def get_user_elo(user_id: str) -> int | None:
    """Read current ELO from users.elo.

    Returns None if the user is not found OR if the DB is unavailable.
    """
    sb = _client()
    if not sb:
        return None
    # TODO: implement
    # - SELECT elo FROM users WHERE id = user_id LIMIT 1
    # - return row["elo"] if found, else None
    return None
```

- [ ] **Step 2: Verify the file's syntax**

```bash
cd backend && python3 -m py_compile app/db/game_repository.py && echo "game_repository.py: SYNTAX OK"
```

Expected: `game_repository.py: SYNTAX OK`.

---

## Task 4: Wire `_finish_game` and add 2 helpers in `manager.py`

`_finish_game` already broadcasts `game:reveal` with optional `scores` from subsystem #2. This task adds the persistence path and the two helpers.

**Files:**
- Modify: `backend/app/game/manager.py` — update `_finish_game`, add helpers after it

- [ ] **Step 1: Update `_finish_game` to call the persistence functions**

The current method (from subsystem #2) is:

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
```

Replace with this version (only addition: the persistence block between the reveal broadcast and `async def _over_delayed`):

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

        # Persist game completion (best-effort, fire-and-forget).
        game_id = new_id()
        chain_score_rows = self._build_chain_score_rows(room, scores)
        _persist_async(
            game_repository.persist_game_completed,
            game_id,
            room.id,
            room.round_count,
            chain_score_rows,
        )
        if scores is not None:
            elo_updates = self._compute_elo_updates_safe(room, scores)
            if elo_updates:
                _persist_async(
                    game_repository.persist_elo_updates,
                    game_id,
                    elo_updates,
                )

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

- [ ] **Step 2: Add the two helper methods**

Locate the `_score_chains_safe` method (added in subsystem #2 — it sits between `_finish_game` and `_chains_payload`). Immediately AFTER `_score_chains_safe`'s closing line and BEFORE `def _chains_payload(self, room: Room) -> list[dict[str, Any]]:`, insert these two methods:

```python
    def _build_chain_score_rows(
        self,
        room: Room,
        scores: list[ChainScore] | None,
    ) -> list[dict[str, Any]] | None:
        """Join ChainScore + start_player_id (from rotation_order) into
        row dicts ready for game_scores. Returns None when scores is None
        so the caller can skip the insert."""
        if scores is None:
            return None
        n = len(room.rotation_order)
        rows: list[dict[str, Any]] = []
        for s in scores:
            idx = s.chain_index
            start_player_id = (
                room.rotation_order[idx] if 0 <= idx < n else None
            )
            rows.append(
                {
                    "chain_index": idx,
                    "start_player_id": start_player_id,
                    "overall_score": s.overall_score,
                    "notes": s.notes,
                }
            )
        return rows

    def _compute_elo_updates_safe(
        self,
        room: Room,
        scores: list[ChainScore],
    ) -> list[dict[str, Any]] | None:
        """Compute ELO updates from current scores. Catches
        NotImplementedError (stub state) and any runtime failure;
        returns None on failure so the caller can skip the insert."""
        try:
            from app.game.elo import compute_elo_changes
            # Build the input shape: one entry per chain-starting player
            # who has a user_id. Anonymous players (no user_id) are skipped.
            # NOTE: room.players uses ephemeral player_id, not user_id.
            # Until users are wired, this loop produces an empty list,
            # which compute_elo_changes treats as a no-op.
            # TODO (teammate): when players have user_id, populate this list.
            return compute_elo_changes([])
        except NotImplementedError:
            logger.info("compute_elo_changes not implemented; no ELO updates")
            return None
        except Exception:  # noqa: BLE001
            logger.warning("compute_elo_changes failed", exc_info=True)
            return None
```

- [ ] **Step 3: Verify the file's syntax**

```bash
cd backend && python3 -m py_compile app/game/manager.py && echo "manager.py: SYNTAX OK"
```

Expected: `manager.py: SYNTAX OK`.

---

## Task 5: Smoke check + final diff

The stubs intentionally don't do work — verification is "files parse, no crashes."

- [ ] **Step 1: Syntax-check everything**

```bash
cd /mnt/d/Documents/trainee-zeus-26t1/backend && python3 -m py_compile \
  app/game/elo.py \
  app/db/game_repository.py \
  app/game/manager.py \
  && echo "ALL FILES: SYNTAX OK"
```

Expected: `ALL FILES: SYNTAX OK`.

- [ ] **Step 2: Run pytest if available**

```bash
which pytest 2>/dev/null && cd /mnt/d/Documents/trainee-zeus-26t1/backend && pytest -v -x
```

If `pytest` is on PATH (e.g. the user set up the backend venv), all tests should pass. The change is transparent: persistence functions no-op without DB creds; `compute_elo_changes` raises `NotImplementedError` which the helper catches.

If `pytest` is not on PATH (current WSL state), skip this step. The teammate runs tests when they set up their backend env.

- [ ] **Step 3: Show the diff**

```bash
git -C /mnt/d/Documents/trainee-zeus-26t1 status
git -C /mnt/d/Documents/trainee-zeus-26t1 diff --stat
```

Expected unstaged changes:
- New: `backend/sql/003_scoring_and_elo.sql`, `backend/app/game/elo.py`
- Modified: `backend/app/db/game_repository.py`, `backend/app/game/manager.py`

(Plus the plan doc this file lives in, and the spec from the brainstorming step.)

- [ ] **Step 4: Hand off**

Do NOT run `git add` or `git commit`. The user reviews and commits manually. Summarize for the teammate filling in:

- `elo.py:compute_elo_changes` — implement the ELO math.
- `game_repository.py:persist_game_completed`, `persist_elo_updates`, `get_user_elo` — implement the Supabase writes.
- Run `backend/sql/003_scoring_and_elo.sql` in the Supabase SQL editor before exercising the writes.
- Mention the outstanding question: how/where players acquire a `user_id` (auth decision).
