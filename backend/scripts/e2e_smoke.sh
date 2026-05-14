#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WITH_SERVER="$ROOT/agents/skills/webapp-testing/scripts/with_server.py"
BACKEND="$ROOT/backend"
SMOKE="$ROOT/backend/tests/e2e/smoke_backend.py"

exec python3 "$WITH_SERVER" \
  --server "cd \"$BACKEND\" && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8765" \
  --port 8765 \
  --timeout 45 \
  -- env E2E_BASE_URL=http://127.0.0.1:8765 python3 "$SMOKE"
