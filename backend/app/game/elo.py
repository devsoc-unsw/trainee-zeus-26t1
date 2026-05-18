"""ELO rating updates from completed-game chain scores.

Pure functions, no I/O. The caller in `manager.py` loads current ELO
from the DB (when wired) and persists deltas afterwards.

See docs/superpowers/specs/2026-05-16-elo-scoring-persistence-stubs.md.
"""
from __future__ import annotations

K_FACTOR = 32
DEFAULT_ELO = 1000


def _expected_score(rating_a: float, rating_b: float) -> float:
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400.0))


def _actual_score(score_a: float, score_b: float) -> float:
    """Map semantic chain scores to a match outcome for ELO."""
    diff = score_a - score_b
    if diff > 0.5:
        return 1.0
    if abs(diff) <= 0.1:
        return 0.5
    return 0.0


def compute_elo_changes(players: list[dict]) -> list[dict]:
    """Compute per-player ELO deltas from chain performance.

    Input shape (one entry per chain-starting player):
        {
            "player_id": str,          # lobby id (required for reveal)
            "player_name": str,        # optional, for clients
            "user_id": str,            # optional, for persistence
            "current_elo": int,
            "chain_score": float,      # 0.0–1.0 from AI judge
        }

    Output shape:
        {
            "player_id": str,
            "player_name": str | None,
            "user_id": str | None,
            "before": int,
            "after": int,
            "delta": int,
        }
    """
    if not players:
        return []

    ids: list[str] = []
    for p in players:
        pid = p.get("player_id") or p.get("user_id")
        if not pid:
            continue
        ids.append(str(pid))

    if not ids:
        return []

    ratings: dict[str, float] = {
        str(p.get("player_id") or p.get("user_id")): float(
            p.get("current_elo", DEFAULT_ELO)
        )
        for p in players
        if p.get("player_id") or p.get("user_id")
    }
    score_by_id: dict[str, float] = {
        str(p.get("player_id") or p.get("user_id")): float(p["chain_score"])
        for p in players
        if (p.get("player_id") or p.get("user_id")) and "chain_score" in p
    }
    delta_acc: dict[str, float] = {pid: 0.0 for pid in ids}

    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            id_a, id_b = ids[i], ids[j]
            ra, rb = ratings[id_a], ratings[id_b]
            sa, sb = score_by_id[id_a], score_by_id[id_b]
            exp_a = _expected_score(ra, rb)
            actual_a = _actual_score(sa, sb)
            change = K_FACTOR * (actual_a - exp_a)
            delta_acc[id_a] += change
            delta_acc[id_b] -= change

    out: list[dict] = []
    for p in players:
        pid = p.get("player_id") or p.get("user_id")
        if not pid:
            continue
        pid = str(pid)
        before = int(p.get("current_elo", DEFAULT_ELO))
        delta = int(round(delta_acc.get(pid, 0.0)))
        after = max(0, before + delta)
        row: dict = {
            "player_id": pid,
            "before": before,
            "after": after,
            "delta": delta,
        }
        if p.get("player_name"):
            row["player_name"] = p["player_name"]
        if p.get("user_id"):
            row["user_id"] = p["user_id"]
        out.append(row)
    return out
