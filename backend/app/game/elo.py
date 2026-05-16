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
