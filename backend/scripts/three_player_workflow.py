#!/usr/bin/env python3
"""
Three-player Code Telephone workflow test (WebSocket).

Simulates the full game loop against a running backend:
  lobby → start → write (r1) → describe (r2) → reimplement (r3) → reveal

Usage (backend on localhost:8000):
  cd backend
  python scripts/three_player_workflow.py

  python scripts/three_player_workflow.py --base-url http://127.0.0.1:8000

Environment:
  WS_BASE_URL / E2E_BASE_URL — HTTP origin for WebSocket (default http://localhost:8000)

Requires: pip install websockets (see requirements-dev.txt if present) or use
the repo venv with backend dependencies installed.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Allow imports from backend/tests when run as scripts/three_player_workflow.py
_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))
_TESTS = _BACKEND / "tests"
if str(_TESTS) not in sys.path:
    sys.path.insert(0, str(_TESTS))

from ws_workflow import (  # noqa: E402
    PlayerScript,
    assert_focal_chain,
    run_three_player_workflow,
    ws_url_from_base,
)


class SyncWsAdapter:
    """Thin wrapper so ws_workflow can use websockets.sync.client."""

    def __init__(self, ws) -> None:
        self._ws = ws

    def send_json(self, payload: dict) -> None:
        self._ws.send(json.dumps(payload))

    def receive_json(self) -> dict:
        raw = self._ws.recv(timeout=30)
        if isinstance(raw, bytes):
            raw = raw.decode()
        return json.loads(raw)


def _connect_three(url: str):
    try:
        from websockets.sync.client import connect
    except ImportError:
        print(
            "Install websockets: pip install websockets",
            file=sys.stderr,
        )
        raise SystemExit(1) from None

    ws1 = connect(url, open_timeout=15)
    ws2 = connect(url, open_timeout=15)
    ws3 = connect(url, open_timeout=15)
    return (
        SyncWsAdapter(ws1),
        SyncWsAdapter(ws2),
        SyncWsAdapter(ws3),
    )


def _print_round(round_num: int, round_type: str, players: list[PlayerScript]) -> None:
    phase = "Write" if round_type == "code" and round_num == 1 else (
        "Describe" if round_type == "describe" else "Reimplement"
    )
    print(f"\n--- Round {round_num} ({phase}) ---")
    for p in players:
        begin = next(
            (m["data"] for m in reversed(p.inbox) if m.get("event") == "round:begin"),
            {},
        )
        seed = begin.get("seed") or {}
        if round_num == 1:
            print(f"  [{p.name}] prompt: {(seed.get('promptText') or '')[:60]}...")
        else:
            preview = (seed.get("receivedContent") or "")[:80].replace("\n", " ")
            from_name = seed.get("fromPlayerName") or "?"
            print(f"  [{p.name}] from {from_name}: {preview}...")


def main() -> int:
    parser = argparse.ArgumentParser(description="3-player Code Telephone WS workflow")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("WS_BASE_URL")
        or os.environ.get("E2E_BASE_URL")
        or "http://localhost:8000",
        help="HTTP origin of the API (WebSocket path /ws/game)",
    )
    parser.add_argument(
        "--host",
        default="Jordan",
        help="Host / Player A nickname",
    )
    parser.add_argument(
        "--guests",
        nargs=2,
        default=["Amrita", "Lukas"],
        metavar=("GUEST1", "GUEST2"),
        help="Player B and C nicknames",
    )
    args = parser.parse_args()

    url = ws_url_from_base(args.base_url)
    print(f"Connecting to {url}")
    print(f"Players: {args.host} (host), {args.guests[0]}, {args.guests[1]}")

    connections = _connect_three(url)

    def connect_fn():
        return connections

    try:
        reveal = run_three_player_workflow(
            connect_fn,
            host_name=args.host,
            guest_names=(args.guests[0], args.guests[1]),
            on_round_begin=_print_round,
        )
    finally:
        for c in connections:
            try:
                c._ws.close()
            except Exception:
                pass

    chains = reveal.get("chains") or []
    print(f"\n=== Reveal: {len(chains)} chain(s) ===")
    for i, chain in enumerate(chains):
        starter = chain.get("startPlayerName", "?")
        segs = chain.get("segments") or []
        print(f"  Chain {i} (starter {starter}): {len(segs)} segments")
        for seg in segs:
            preview = (seg.get("content") or "")[:50].replace("\n", " ")
            print(
                f"    r{seg.get('roundNum')} {seg.get('roundType')} "
                f"@{seg.get('authorName')}: {preview}..."
            )

    try:
        assert_focal_chain(chains, args.host)
        print(f"\nOK — focal chain for {args.host} has original + reconstruction.")
    except AssertionError as e:
        print(f"\nWARN — focal chain check: {e}", file=sys.stderr)
        return 1

    if reveal.get("scores"):
        print("\nScores:", json.dumps(reveal["scores"], indent=2))
    else:
        print("\nScores: (none — AI judge stub or scoring skipped)")

    print("\nWorkflow completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
