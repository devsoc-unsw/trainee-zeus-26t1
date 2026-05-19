#!/usr/bin/env bash
# Run the 3-player WebSocket workflow against a running backend.
#
# Usage:
#   ./backend/scripts/run_three_player_workflow.sh
#   WS_BASE_URL=http://127.0.0.1:8765 ./backend/scripts/run_three_player_workflow.sh
#
# Or start backend + test in one shot (from repo root):
#   bash backend/scripts/e2e_three_player.sh

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT/backend"
export WS_BASE_URL="${WS_BASE_URL:-http://localhost:8000}"
exec python scripts/three_player_workflow.py --base-url "$WS_BASE_URL" "$@"
