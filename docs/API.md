# Code Telephone (Zeus) — Backend API for integrators

This service is the **Code Telephone / Zeus** game backend: a small **REST** surface for health checks and a **WebSocket** hub for lobby, rounds, and reconnect sync. Payload field names in `data` objects are **camelCase** in JSON (see `backend/app/game/schemas.py` and the canonical spec below).

## Base URLs

| Context | URL |
|--------|-----|
| Local Uvicorn (typical) | `http://localhost:8000` |
| Browser / public client | Use the host and port you expose (e.g. `http://localhost:8000` in local dev, or your deployed origin). |
| Docker — **Next.js container → FastAPI** | `http://backend:8000` (Docker DNS; server-side only). The browser still uses the mapped host, e.g. `http://localhost:8000`. See **Docker networking** in the repo [README](../README.md) (`NEXT_PUBLIC_API_URL` vs `INTERNAL_API_URL`). |

Use `ws://<host>/ws/game` with the same host/port as HTTP (or `wss://` when the site is served over HTTPS).

## Canonical specification and interactive docs

- **OpenAPI 3 (YAML):** [`backend/openapi.yaml`](../backend/openapi.yaml) — authoritative list of HTTP paths and WebSocket event names.
- **Swagger UI:** when the server is running, open `/docs` (e.g. `http://localhost:8000/docs`).

This page summarizes behavior; it does not replace the OpenAPI file.

---

## REST

### `GET /health`

**Response** `200` — `application/json`

```json
{ "status": "ok" }
```

No request body or query parameters. Used for liveness checks.

---

## WebSocket

**URL:** `ws://<host>/ws/game` (path registered in [`backend/app/routers/game_ws.py`](../backend/app/routers/game_ws.py)).

**Frames:** each message is a **UTF-8 JSON** object (text frame):

```json
{ "event": "<eventName>", "data": { } }
```

`data` may be an empty object `{}`. Malformed JSON or missing/non-string `event` frames are ignored by the server.

### Client → server

| Event | Purpose |
|-------|---------|
| `room:create` | Create a room as host (`name`, `roundCount` 3 or 5). Ignored if this socket is already in a room. |
| `room:join` | Join an existing lobby by room `code` and `name`. |
| `room:leave` | Leave the room (and disconnect handling updates others). |
| `game:start` | Host starts the game from lobby (requires ≥3 players). |
| `round:submit` | Submit content for the current active round. On **code** rounds, optional `language`: `"python"` \| `"javascript"` \| `"java"` (defaults to `"python"` if omitted). Ignored on describe rounds. |
| `game:sync` | Reattach socket to an existing `roomId` + `playerId`; server replies with `game:state`. |
| `game:reset` | Host returns room to lobby after the game has ended (`status` `over`). |

### Server → client

| Event | Purpose |
|-------|---------|
| `room:created` | Acknowledgement after `room:create` (room id, join code, your `playerId`, roster). |
| `room:joined` | Acknowledgement after `room:join` (room metadata and roster). |
| `room:updated` | Broadcast when membership or host changes (public player list + `hostId`). |
| `room:error` | Error with `code` and `message` (e.g. validation, not host, game in progress). |
| `game:started` | Game is active; includes `roundCount` and `timeLimits`. |
| `round:begin` | Start of a round; **per-connection** payload `{roundNum, roundType, seed, timeLimit}` — `seed` carries the prompt / inherited content; `timeLimit` is the round duration in seconds (the frontend derives a local `secondsLeft` countdown from it). |
| `round:player_submitted` | Progress broadcast when a player submits. Payload `{playerId, totalSubmitted, totalPlayers}` — counts toward round completion. |
| `round:ended` | Round finished (all in or timeout); includes `submissions` (each item has `content`, `roundType`, and `language` on code rounds or `null` on describe) and optional `nextRound`. |
| `game:reveal` | Final **chains** for the completed game. Each **code** segment includes `language`; describe segments use `language: null`. May include optional **scores** (per-chain semantic-similarity, populated once AI judging is wired up — see `backend/app/game/scoring.py`). |
| `game:over` | Emitted after a short delay following reveal. |
| `game:state` | Snapshot for reconnect (`game:sync`): status, round, timer, seed, submitted flag, players. |

Implementation reference: [`backend/app/game/manager.py`](../backend/app/game/manager.py).

---

## Optional: E2E smoke test

From the **repository root**, with Python 3 available:

```bash
bash backend/scripts/e2e_smoke.sh
```

This starts Uvicorn on `127.0.0.1:8765` via `agents/skills/webapp-testing/scripts/with_server.py` and runs `backend/tests/e2e/smoke_backend.py` against `E2E_BASE_URL`.
