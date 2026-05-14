"""
Black-box smoke test for the running FastAPI app (per agents/skills/webapp-testing).

Run under the bundled server lifecycle helper:

  backend/scripts/e2e_smoke.sh

Or with the backend already listening:

  E2E_BASE_URL=http://127.0.0.1:8000 python3 smoke_backend.py
"""
from __future__ import annotations

import json
import os
import sys

from playwright.sync_api import sync_playwright


def _ws_url(base: str) -> str:
    if base.startswith("https://"):
        return "wss://" + base.removeprefix("https://") + "/ws/game"
    return "ws://" + base.removeprefix("http://") + "/ws/game"


def main() -> int:
    base = os.environ.get("E2E_BASE_URL", "http://127.0.0.1:8000").rstrip("/")

    with sync_playwright() as p:
        ctx = p.request.new_context(base_url=base)
        res = ctx.get("/health")
        if not res.ok:
            print("GET /health failed:", res.status, res.text(), file=sys.stderr)
            return 1
        body = res.json()
        if body.get("status") != "ok":
            print("unexpected /health body:", body, file=sys.stderr)
            return 1

    try:
        from websockets.exceptions import WebSocketException
        from websockets.sync.client import connect as ws_connect
    except ImportError:
        print("missing dependency: pip install -r backend/requirements-dev.txt", file=sys.stderr)
        return 1

    url = _ws_url(base)
    try:
        with ws_connect(url, open_timeout=10) as ws:
            ws.send(
                json.dumps(
                    {"event": "room:join", "data": {"code": "BADBAD", "name": "E2E"}},
                )
            )
            raw = ws.recv(timeout=10)
            msg = json.loads(raw) if isinstance(raw, str) else json.loads(raw.decode())
            if msg.get("event") != "room:error":
                print("unexpected WS event:", msg, file=sys.stderr)
                return 1
            if msg.get("data", {}).get("code") != "ROOM_NOT_FOUND":
                print("unexpected room:error payload:", msg, file=sys.stderr)
                return 1
    except WebSocketException as e:
        print("WebSocket error:", e, file=sys.stderr)
        return 1
    except (TimeoutError, OSError, ConnectionError) as e:
        print("connection error:", e, file=sys.stderr)
        return 1
    except Exception as e:  # noqa: BLE001 — last-resort for unexpected wire failures
        print("smoke WebSocket check failed:", e, file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
