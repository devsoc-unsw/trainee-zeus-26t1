# ELO + Scoring Persistence Stubs — Design

**Date:** 2026-05-16
**Status:** Approved, ready for implementation
**Scope:** Backend persistence layer for completed games — new SQL tables (`users`, `games`, `game_scores`, `elo_history`), a pure-function ELO calculator stub (`elo.py`), three new `game_repository.py` functions, and `manager.py` wiring so `_finish_game` records every completed game.

**Related:** Subsystem #3 of the "game logic stubs" series. Subsystem #1 (round networking, frontend) and #2 (AI judge + Judge0 stubs, backend) are complete. Subsystem #4 (reveal screen, frontend) follows.

## Goal

Define the database schema and Python interface for persisting completed games, per-chain scores, and per-user ELO changes. The actual ELO formula and DB writes remain stubbed; a teammate fills them in once user-identity is settled.

## User Identity Decision

A `users` table is introduced **anonymously** — no auth provider link yet. `players.user_id` is a nullable FK; a player without a `user_id` is anonymous and earns no ELO. When auth is decided later, a teammate can backfill or link `users.id` to `supabase.auth.users.id` (or a custom UUID) without a schema migration.

This unblocks ELO design now while deferring the auth decision.

## Scope

**In:**
- New SQL migration `backend/sql/003_scoring_and_elo.sql`
- New module `backend/app/game/elo.py` with `compute_elo_changes()` pure-function stub
- Three new persistence functions in `backend/app/db/game_repository.py`:
  - `persist_game_completed(game_id, room_id, round_count, chain_scores)`
  - `persist_elo_updates(game_id, updates)`
  - `get_user_elo(user_id) -> int | None`
- Two new private helpers in `manager.py`'s `GameHub`:
  - `_build_chain_score_rows(room, scores)` — shape-shifts `list[ChainScore] | None` into rows for `game_scores`
  - `_compute_elo_updates_safe(room, scores)` — wraps `elo.compute_elo_changes`, catches `NotImplementedError`
- Wiring in `_finish_game` (after the scoring + reveal broadcast added in subsystem #2) so every completed game is persisted, with ELO updates conditional on having scores

**Out (deferred):**
- Auth integration / `user_id` assignment
- Leaderboard read endpoint (`GET /api/v1/leaderboard` or similar)
- Anti-cheat / abuse mitigation around ELO
- Backfilling existing data
- A migration runner — teammate runs the SQL manually in the Supabase SQL editor, matching the existing project pattern (`002_rooms_round_count.sql` is also a hand-run migration)

## Database Schema (`003_scoring_and_elo.sql`)

```sql
-- Long-lived user identity. Anonymous for now; teammate decides
-- whether to backfill from Supabase Auth later.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name varchar(32) NOT NULL,
  elo integer NOT NULL DEFAULT 1000,
  games_played integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Link ephemeral lobby players → long-lived users. Nullable so
-- anonymous play still works (no ELO impact when null).
ALTER TABLE players ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX players_user_id_idx ON players(user_id);

-- Completed game records (separate from `rooms`, which can be
-- recycled / reset for a new game).
CREATE TABLE games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  round_count smallint NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now()
);

-- One row per chain in a completed game.
CREATE TABLE game_scores (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  chain_index smallint NOT NULL,
  start_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  overall_score real NOT NULL,
  notes text,
  PRIMARY KEY (game_id, chain_index)
);

-- Append-only ELO log. Mirrors updates to users.elo.
CREATE TABLE elo_history (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  elo_before integer NOT NULL,
  elo_after integer NOT NULL,
  delta integer NOT NULL,
  ts timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX elo_history_user_idx ON elo_history(user_id, ts DESC);
```

All additive — only existing change is a nullable `user_id` column on `players`.

## Python — `backend/app/game/elo.py`

```python
"""ELO rating updates from completed-game chain scores.

Pure functions, no I/O. The caller in `manager.py` is responsible for
loading current ELO values from the DB and persisting deltas afterwards.

Stub: the teammate filling this in chooses the exact formula.
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
        [{"user_id", "before": int, "after": int, "delta": int}, ...]

    Implementation notes:
    - Pairwise comparisons (each player vs each other) with standard
      ELO expected/actual scoring is a sensible default.
    - Score difference > 0.5 → "win"; |diff| <= 0.1 → "draw"; otherwise "loss".
    - Adjust K_FACTOR for more/less volatile ratings.
    """
    raise NotImplementedError(
        "compute_elo_changes is not yet implemented. "
        "See docs/superpowers/specs/2026-05-16-elo-scoring-persistence-stubs.md"
    )
```

## Python — `backend/app/db/game_repository.py` additions

Three new functions, all following the existing best-effort pattern (try/except, log on failure, never raise). Each is appended to the end of `game_repository.py` after `persist_room_state`.

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

    `chain_scores` row shape:
        {"chain_index": int, "start_player_id": str | None,
         "overall_score": float, "notes": str | None}
    """
    # TODO: implement (best-effort, same pattern as existing persist_*)
    pass


def persist_elo_updates(
    game_id: str,
    updates: list[dict[str, Any]],
) -> None:
    """Apply per-user ELO updates: update `users.elo` and append `elo_history` rows.

    `updates` row shape:
        {"user_id": str, "before": int, "after": int, "delta": int}
    """
    # TODO: implement (consider an RPC for atomicity — see audit notes)
    pass


def get_user_elo(user_id: str) -> int | None:
    """Read current ELO from users.elo.
    Returns None if user not found or DB is unavailable.
    """
    # TODO: implement
    return None
```

## Manager Wiring — `_finish_game`

After the scoring + reveal broadcast (already in place from subsystem #2):

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

    # NEW persistence path (best-effort, fire-and-forget):
    game_id = new_id()
    chain_score_rows = self._build_chain_score_rows(room, scores)
    _persist_async(
        game_repository.persist_game_completed,
        game_id, room.id, room.round_count, chain_score_rows,
    )
    if scores is not None:
        elo_updates = self._compute_elo_updates_safe(room, scores)
        if elo_updates:
            _persist_async(
                game_repository.persist_elo_updates,
                game_id, elo_updates,
            )

    # ... existing game:over delayed logic unchanged
```

Two new helper methods on `GameHub`:

```python
def _build_chain_score_rows(
    self, room: Room, scores: list[ChainScore] | None,
) -> list[dict[str, Any]] | None:
    """Join ChainScore + start_player_id (from rotation_order) into
    row dicts ready for `game_scores`. Returns None when scores is None."""
    if scores is None:
        return None
    n = len(room.rotation_order)
    rows: list[dict[str, Any]] = []
    for s in scores:
        idx = s.chain_index
        start_player_id = room.rotation_order[idx] if 0 <= idx < n else None
        rows.append({
            "chain_index": idx,
            "start_player_id": start_player_id,
            "overall_score": s.overall_score,
            "notes": s.notes,
        })
    return rows


def _compute_elo_updates_safe(
    self, room: Room, scores: list[ChainScore],
) -> list[dict[str, Any]] | None:
    """Compute ELO updates from current scores. Catches NotImplementedError
    (stub state) and any other failure; returns None on failure."""
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

## Properties of the Wiring

- **Backwards-compatible.** A teammate who runs the migration but leaves the Python stubs as-is sees: every completed game records a `games` row, no `game_scores` rows, no `elo_history` rows, no `users.elo` mutations. Realtime gameplay unaffected.
- **Best-effort throughout.** All DB writes are fire-and-forget via the existing `_persist_async` helper. Any failure logs and returns; the game-flow continues.
- **Stub gating is explicit.** `compute_elo_changes` raising `NotImplementedError` is caught in `_compute_elo_updates_safe`. Pre-implementation, ELO updates are simply skipped.
- **Player-to-user mapping is the teammate's call.** The stub `_compute_elo_updates_safe` passes an empty list to `compute_elo_changes` with a TODO. When auth is wired, the loop populates `user_id` from `room.players[*].user_id` (a field that doesn't exist yet — added later).

## Acceptance

- `003_scoring_and_elo.sql` exists and is internally consistent (FK references valid).
- `elo.py` exports `compute_elo_changes`; it raises `NotImplementedError`.
- Three new repo functions exist; all are no-ops (`pass` / `return None`).
- `manager.py` imports compile; `_finish_game` runs end-to-end without raising when nothing is implemented yet.
- `pytest` still passes (no test changes; existing tests cover lobby/round flow only).
- A teammate filling in `elo.py` does not need to touch `manager.py`.
- A teammate filling in the repo functions does not need to touch `elo.py`.
