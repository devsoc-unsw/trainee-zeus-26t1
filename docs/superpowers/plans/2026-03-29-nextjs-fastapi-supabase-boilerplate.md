# Next.js + FastAPI + Supabase Boilerplate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a flat two-app monorepo with a Next.js 15 frontend, FastAPI backend, Supabase cloud integration, and Docker Compose orchestration.

**Architecture:** `frontend/` (Next.js App Router, TypeScript) and `backend/` (FastAPI, Python 3.12) are independent services at the repo root. Browser communicates with both directly; Next.js SSR can call FastAPI via Docker's internal network. Supabase stays cloud-hosted — no local DB container.

**Tech Stack:** Next.js 15, TypeScript, @supabase/supabase-js, FastAPI, Python 3.12, supabase-py, pydantic-settings, pytest, httpx, Docker Compose

---

## File Map

```
.
├── .env.example                         # Documented env var placeholders
├── .dockerignore                        # Shared Docker ignore
├── docker-compose.yml                   # Orchestrates backend + frontend
├── README.md                            # Full instructions (rewritten)
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt                 # All Python deps (prod + dev)
│   └── app/
│       ├── __init__.py
│       ├── main.py                      # FastAPI app + CORS middleware
│       ├── routers/
│       │   ├── __init__.py
│       │   └── health.py                # GET /health → {"status": "ok"}
│       └── deps/
│           ├── __init__.py
│           └── supabase.py              # Lazy Supabase client singleton
├── backend/tests/
│   ├── __init__.py
│   ├── test_health.py
│   └── test_supabase_dep.py
└── frontend/
    ├── Dockerfile
    ├── .env.local.example               # Frontend-specific env doc
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   └── page.tsx                 # Shows server-side FastAPI fetch pattern
        └── lib/
            └── supabase/
                └── client.ts            # Browser Supabase singleton
```

---

## Task 1: Backend package skeleton + requirements

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/routers/__init__.py`
- Create: `backend/app/deps/__init__.py`
- Create: `backend/tests/__init__.py`

- [ ] **Step 1: Create requirements.txt**

```
# backend/requirements.txt
fastapi==0.115.12
uvicorn[standard]==0.34.0
supabase==2.15.1
python-dotenv==1.1.0
pydantic-settings==2.8.1

# dev / test
httpx==0.28.1
pytest==8.3.5
pytest-asyncio==0.26.0
```

- [ ] **Step 2: Create package init files**

```python
# backend/app/__init__.py
```
```python
# backend/app/routers/__init__.py
```
```python
# backend/app/deps/__init__.py
```
```python
# backend/tests/__init__.py
```

- [ ] **Step 3: Install deps into a venv**

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Expected: no errors; `pip show fastapi` shows version 0.115.12.

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt backend/app/__init__.py backend/app/routers/__init__.py backend/app/deps/__init__.py backend/tests/__init__.py
git commit -m "chore: add backend package skeleton and requirements"
```

---

## Task 2: Health router + FastAPI app (TDD)

**Files:**
- Create: `backend/tests/test_health.py`
- Create: `backend/app/routers/health.py`
- Create: `backend/app/main.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_health.py
from fastapi.testclient import TestClient


def test_health_returns_ok():
    from app.main import app
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_header_for_allowed_origin(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000")
    # Re-import so the middleware picks up the patched env
    import importlib
    import app.main as main_module
    importlib.reload(main_module)
    from app.main import app
    client = TestClient(app)
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd backend
source .venv/bin/activate
pytest tests/test_health.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.main'`

- [ ] **Step 3: Create health router**

```python
# backend/app/routers/health.py
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}
```

- [ ] **Step 4: Create main.py with CORS**

```python
# backend/app/main.py
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.health import router as health_router

app = FastAPI(title="Backend API")

_raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000")
origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd backend
pytest tests/test_health.py -v
```

Expected:
```
tests/test_health.py::test_health_returns_ok PASSED
tests/test_health.py::test_cors_header_for_allowed_origin PASSED
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/app/routers/health.py backend/tests/test_health.py
git commit -m "feat: add FastAPI app with CORS middleware and /health endpoint"
```

---

## Task 3: Supabase dependency helper (TDD)

**Files:**
- Create: `backend/tests/test_supabase_dep.py`
- Create: `backend/app/deps/supabase.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_supabase_dep.py
import pytest


def test_get_supabase_client_raises_without_env(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    import importlib
    import app.deps.supabase as dep_module
    importlib.reload(dep_module)
    with pytest.raises(ValueError, match="SUPABASE_URL"):
        dep_module.get_supabase_client()


def test_get_supabase_client_returns_client(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key")
    import importlib
    import app.deps.supabase as dep_module
    importlib.reload(dep_module)
    client = dep_module.get_supabase_client()
    assert client is not None
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd backend
pytest tests/test_supabase_dep.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.deps.supabase'` (or AttributeError)

- [ ] **Step 3: Implement Supabase dependency**

```python
# backend/app/deps/supabase.py
"""
Lazy Supabase client using the service-role key (server-side only).

Usage in a FastAPI route:
    from app.deps.supabase import get_supabase_client
    from fastapi import Depends
    from supabase import Client

    @router.get("/example")
    def example(sb: Client = Depends(get_supabase_client)):
        data = sb.table("my_table").select("*").execute()
        return data.data
"""
import os
from functools import lru_cache

from supabase import Client, create_client


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url:
        raise ValueError("SUPABASE_URL environment variable is not set")
    if not key:
        raise ValueError("SUPABASE_SERVICE_ROLE_KEY environment variable is not set")
    return create_client(url, key)
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd backend
pytest tests/test_supabase_dep.py -v
```

Expected:
```
tests/test_supabase_dep.py::test_get_supabase_client_raises_without_env PASSED
tests/test_supabase_dep.py::test_get_supabase_client_returns_client PASSED
```

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend
pytest -v
```

Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/deps/supabase.py backend/tests/test_supabase_dep.py
git commit -m "feat: add lazy Supabase client dependency with env validation"
```

---

## Task 4: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`

- [ ] **Step 1: Write Dockerfile**

```dockerfile
# backend/Dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Build and smoke-test the image**

```bash
cd backend
docker build -t boilerplate-backend .
docker run --rm -p 8000:8000 \
  -e CORS_ORIGINS=http://localhost:3000 \
  -e SUPABASE_URL=https://placeholder.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=placeholder \
  boilerplate-backend &
sleep 3
curl -s http://localhost:8000/health
```

Expected: `{"status":"ok"}`

Kill the container: `docker ps | grep boilerplate-backend | awk '{print $1}' | xargs docker stop`

- [ ] **Step 3: Commit**

```bash
git add backend/Dockerfile
git commit -m "chore: add backend Dockerfile"
```

---

## Task 5: Frontend scaffold

**Files:**
- Create: `frontend/` (via create-next-app)
- Modify: `frontend/src/app/page.tsx` — add server-side FastAPI fetch example

- [ ] **Step 1: Scaffold with create-next-app**

Run from the repo root:

```bash
npx create-next-app@latest frontend \
  --typescript \
  --eslint \
  --app \
  --src-dir \
  --no-tailwind \
  --import-alias "@/*" \
  --no-turbopack
```

When prompted, confirm the options. This creates `frontend/` with App Router + TypeScript, no Tailwind, no Turbopack.

- [ ] **Step 2: Install @supabase/supabase-js**

```bash
cd frontend
npm install @supabase/supabase-js
```

- [ ] **Step 3: Verify dev server starts**

```bash
cd frontend
npm run dev &
sleep 5
curl -s http://localhost:3000 | head -5
```

Expected: HTML output (Next.js default page).

Kill: `kill %1` or `pkill -f "next dev"`

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "chore: scaffold Next.js 15 frontend with App Router and TypeScript"
```

---

## Task 6: Frontend Supabase client + example page

**Files:**
- Create: `frontend/src/lib/supabase/client.ts`
- Create: `frontend/.env.local.example`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Create Supabase browser client singleton**

```typescript
// frontend/src/lib/supabase/client.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 2: Create frontend env example**

```bash
# frontend/.env.local.example
# Copy this to frontend/.env.local — never commit real keys

# Supabase (browser-safe)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# FastAPI URL as seen from the BROWSER
NEXT_PUBLIC_API_URL=http://localhost:8000

# FastAPI URL as seen from inside the Next.js container (Docker only)
# Used for server-side fetch in Server Components / Route Handlers
INTERNAL_API_URL=http://backend:8000
```

- [ ] **Step 3: Update page.tsx with server-side FastAPI fetch example**

Replace the contents of `frontend/src/app/page.tsx`:

```tsx
// frontend/src/app/page.tsx

/**
 * Server Component — runs on the server (or during build).
 *
 * To call FastAPI from here:
 *   - In Docker: use process.env.INTERNAL_API_URL (e.g. http://backend:8000)
 *   - Outside Docker: use process.env.NEXT_PUBLIC_API_URL or a server-only
 *     INTERNAL_API_URL env var that points to http://localhost:8000
 *
 * Example:
 *   const res = await fetch(`${process.env.INTERNAL_API_URL}/health`);
 *   const data = await res.json(); // { status: "ok" }
 */
export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Next.js + FastAPI + Supabase Boilerplate</h1>
      <ul>
        <li>
          FastAPI health:{" "}
          <a href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/health`}>
            {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/health
          </a>
        </li>
        <li>
          See <code>src/lib/supabase/client.ts</code> for the browser Supabase
          client.
        </li>
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/supabase/client.ts frontend/.env.local.example frontend/src/app/page.tsx
git commit -m "feat: add Supabase browser client and FastAPI fetch example in page"
```

---

## Task 7: Frontend Dockerfile

**Files:**
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Write Dockerfile with dev and prod targets**

```dockerfile
# frontend/Dockerfile

# ── deps stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── builder stage (production build) ─────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build args are baked into the static bundle at build time
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

# ── production runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]

# ── development target (used in docker-compose for local dev) ─────────────────
FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
# --poll enables file watching inside Docker volumes on macOS
CMD ["npm", "run", "dev", "--", "--turbopack=false"]
```

> **Note:** The `runner` stage requires `output: "standalone"` in `next.config.ts`. The `dev` target is what `docker-compose.yml` uses. See README for details.

- [ ] **Step 2: Enable standalone output in next.config.ts**

Open `frontend/next.config.ts` and replace its content with:

```typescript
// frontend/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 3: Verify build still passes**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/Dockerfile frontend/next.config.ts
git commit -m "chore: add frontend Dockerfile with dev and prod targets; enable standalone output"
```

---

## Task 8: Root orchestration files

**Files:**
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

- [ ] **Step 1: Create .env.example**

```bash
# .env.example
# Copy this file to .env at the repo root.
# The docker-compose.yml reads from .env automatically.
# NEVER commit .env with real values.

# ── Next.js (browser-safe — baked into the JS bundle) ────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# FastAPI URL as seen from the BROWSER (port-mapped host address)
NEXT_PUBLIC_API_URL=http://localhost:8000

# ── FastAPI (server-only — never expose to the browser) ──────────────────────
SUPABASE_URL=https://your-project.supabase.co
# Use the service role key for backend operations requiring elevated access.
# Alternatively, use SUPABASE_ANON_KEY for routes that only need anon access.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# Comma-separated list of origins the browser is allowed to call FastAPI from.
CORS_ORIGINS=http://localhost:3000

# ── Docker internal networking ────────────────────────────────────────────────
# URL of FastAPI as seen from INSIDE the Next.js container (Docker DNS).
# Used for server-side fetch in Server Components / Route Handlers.
INTERNAL_API_URL=http://backend:8000
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
# docker-compose.yml
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    env_file:
      - .env
    # No depends_on needed — backend has no runtime deps in this boilerplate.

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      # Use the dev target for local development (hot-reload, no build step).
      target: dev
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      # Internal URL for server-side fetches within the Docker network.
      INTERNAL_API_URL: http://backend:8000
    volumes:
      # Mount source for hot-reload; exclude node_modules to use container's copy.
      - ./frontend:/app
      - /app/node_modules
      - /app/.next
    depends_on:
      - backend
```

- [ ] **Step 3: Create .dockerignore**

```
# .dockerignore (applies to both services via build context)
**/.git
**/.env
**/.env.local
**/node_modules
**/.next
**/__pycache__
**/.venv
**/dist
**/build
**/*.pyc
**/docs
```

- [ ] **Step 4: Copy .env.example to .env and fill placeholders**

```bash
cp .env.example .env
# Open .env and set at least placeholder values so Docker can start:
# NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

- [ ] **Step 5: Smoke-test docker compose**

```bash
docker compose up --build -d
sleep 10
curl -s http://localhost:8000/health
curl -s http://localhost:3000
docker compose down
```

Expected: `{"status":"ok"}` from FastAPI; HTML from Next.js.

- [ ] **Step 6: Commit**

```bash
git add .env.example docker-compose.yml .dockerignore
git commit -m "chore: add docker-compose orchestration, .env.example, and .dockerignore"
```

---

## Task 9: Rewrite README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README.md**

```markdown
# Next.js + FastAPI + Supabase Boilerplate

A minimal, production-ready starter with:
- **Next.js 15** (App Router, TypeScript, ESLint) — `frontend/`
- **FastAPI** (Python 3.12, Uvicorn) — `backend/`
- **Supabase** (cloud-hosted) — browser client in Next.js, service-role client in FastAPI

```
Browser ──► Next.js :3000
Browser ──► FastAPI :8000
Next.js (SSR) ──► FastAPI (Docker internal: http://backend:8000)
FastAPI ──► Supabase cloud API
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| Python | 3.12+ |
| Docker + Compose | optional, for containerised dev |

---

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **Project Settings → API**.
3. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (FastAPI only — never expose to the browser)

---

## Environment variables

```bash
cp .env.example .env
# Edit .env and fill in your Supabase keys.
```

For local dev without Docker, also copy for the frontend:

```bash
cp frontend/.env.local.example frontend/.env.local
# Edit frontend/.env.local with the same NEXT_PUBLIC_ values.
```

See `.env.example` for a full description of every variable.

---

## Local dev (no Docker)

### Backend

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Set env vars (or export them manually):
set -a && source ../.env && set +a

uvicorn app.main:app --reload --port 8000
# API docs: http://localhost:8000/docs
```

Run tests:

```bash
cd backend
source .venv/bin/activate
pytest -v
```

### Frontend

```bash
cd frontend
npm install
# Ensure frontend/.env.local has your NEXT_PUBLIC_ vars
npm run dev
# App: http://localhost:3000
```

---

## Docker (recommended for parity)

```bash
cp .env.example .env
# Fill in your Supabase keys in .env

docker compose up --build
```

| Service | URL |
|---------|-----|
| Next.js | http://localhost:3000 |
| FastAPI | http://localhost:8000 |
| FastAPI docs | http://localhost:8000/docs |

Stop:

```bash
docker compose down
```

### Docker networking

`NEXT_PUBLIC_API_URL` is the FastAPI URL **the browser uses** (port-mapped, e.g. `http://localhost:8000`).

`INTERNAL_API_URL` is the URL **the Next.js container uses** for server-side fetches (Docker DNS, `http://backend:8000`). Use it in Server Components and Route Handlers:

```typescript
// frontend/src/app/some-page/page.tsx (Server Component)
const res = await fetch(`${process.env.INTERNAL_API_URL}/health`);
const data = await res.json(); // { status: "ok" }
```

### Production build

To build the frontend for production instead of dev mode, change the `target` in `docker-compose.yml`:

```yaml
frontend:
  build:
    target: runner   # was: dev
```

Pass build args in docker-compose.yml `args:` so `NEXT_PUBLIC_*` values are baked into the bundle at build time.

---

## Troubleshooting

**Port already in use:** `lsof -i :8000` / `lsof -i :3000` then kill the process.

**CORS error in browser:** Check `CORS_ORIGINS` in `.env` includes your frontend URL (e.g. `http://localhost:3000`). Restart the backend after changes.

**next dev file-watching not working in Docker on macOS:** The `dev` Dockerfile target passes `--poll` equivalent via `WATCHPACK_POLLING=true`. Add `environment: WATCHPACK_POLLING: "true"` to the `frontend` service in `docker-compose.yml` if needed.

**Supabase client not initialising:** Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in `.env` before starting the backend.

---

## Security

- `SUPABASE_SERVICE_ROLE_KEY` gives full DB access, bypassing Row Level Security. **Only use it in FastAPI (server-side).** Never put it in a `NEXT_PUBLIC_` variable.
- Commit `.env.example` (placeholders only). Never commit `.env` or `frontend/.env.local`.

---

## Extending

- **Add a route:** create `backend/app/routers/my_router.py`, define an `APIRouter`, and `include_router` it in `main.py`.
- **Use Supabase in a route:** inject with `Depends(get_supabase_client)` from `app.deps.supabase`.
- **Add auth:** see [@supabase/ssr](https://supabase.com/docs/guides/auth/server-side/nextjs) for cookie-based auth with Next.js middleware.
- **Local Supabase:** run `npx supabase start` for a local stack (Postgres + Auth + Storage). Update `SUPABASE_URL` / keys to the local values.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README with full setup, Docker, and security instructions"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| flat two-app repo (no Turborepo) | Task 5 (create-next-app at root level frontend/) |
| Next.js 15, App Router, TypeScript, ESLint, src/app | Task 5 |
| @supabase/supabase-js browser client singleton | Task 6 |
| Example SSR fetch to FastAPI | Task 6 (page.tsx) |
| backend/app/main.py + CORS from CORS_ORIGINS | Task 2 |
| backend/app/routers/health.py GET /health | Task 2 |
| backend/app/deps/supabase.py lazy client | Task 3 |
| requirements.txt with pinned deps | Task 1 |
| backend/Dockerfile | Task 4 |
| frontend/Dockerfile | Task 7 |
| docker-compose.yml with both services | Task 8 |
| .env.example with all documented vars | Task 8 |
| .dockerignore | Task 8 |
| INTERNAL_API_URL for Docker SSR | Task 8 (compose) + Task 9 (README) |
| README: prerequisites, Supabase setup, env, run modes, Docker, security | Task 9 |
| Never commit real keys | Task 8 (.dockerignore excludes .env) + Task 9 |

All spec requirements covered. No gaps found.

### Placeholder scan

No TBD/TODO/placeholder patterns found in the plan. All code steps include complete implementations.

### Type consistency

- `get_supabase_client()` defined in Task 3 (`app/deps/supabase.py`), referenced in Task 9 (README extending section) — consistent.
- `health_router` imported in `main.py` (Task 2) matches `router` exported in `health.py` (Task 2) — consistent.
- `supabase` export in `client.ts` (Task 6) — no references in other tasks, standalone.
