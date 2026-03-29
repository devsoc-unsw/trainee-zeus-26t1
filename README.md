# Next.js + FastAPI + Supabase Boilerplate

A minimal starter with:
- **Next.js 16** (App Router, JavaScript) — `frontend/`
- **FastAPI** (Python 3.12, Uvicorn) — `backend/`
- **Supabase** (cloud-hosted) — browser client in Next.js, service-role client in FastAPI

```
Browser ──► Next.js  :3000
Browser ──► FastAPI  :8000
Next.js (SSR) ──► FastAPI (Docker internal: http://backend:8000)
FastAPI ──► Supabase cloud API
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| Python | 3.12+ |
| Docker + Compose | optional |

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
# Fill in your Supabase keys in .env
```

For local dev without Docker, also copy the frontend env file:

```bash
cp frontend/.env.local.example frontend/.env.local
# Fill in the NEXT_PUBLIC_* values
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

# Load env vars from root .env
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
# Ensure frontend/.env.local has your NEXT_PUBLIC_* vars
npm run dev
# App: http://localhost:3000
```

---

## Docker

```bash
cp .env.example .env
# Fill in your Supabase keys

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

```js
// frontend/src/app/some-page/page.js  (Server Component)
export default async function Page() {
  const res = await fetch(`${process.env.INTERNAL_API_URL}/health`);
  const data = await res.json(); // { status: "ok" }
  return <div>{data.status}</div>;
}
```

### Production build

To build the frontend for production instead of dev mode, change the `target` in `docker-compose.yml`:

```yaml
frontend:
  build:
    target: runner   # was: dev
```

`NEXT_PUBLIC_*` values are baked into the bundle at build time via the `args:` block in `docker-compose.yml`.

---

## Adding a FastAPI route

1. Create `backend/app/routers/my_router.py`:

```python
from fastapi import APIRouter

router = APIRouter(prefix="/api/v1")

@router.get("/example")
def example():
    return {"hello": "world"}
```

2. Register it in `backend/app/main.py`:

```python
from app.routers.my_router import router as my_router
app.include_router(my_router)
```

3. Use the Supabase client with `Depends`:

```python
from fastapi import Depends
from supabase import Client
from app.deps.supabase import get_supabase_client

@router.get("/items")
def get_items(sb: Client = Depends(get_supabase_client)):
    return sb.table("items").select("*").execute().data
```

---

## Troubleshooting

**Port already in use:** `lsof -i :8000` or `lsof -i :3000`, then kill the process.

**CORS error in browser:** Check `CORS_ORIGINS` in `.env` includes your frontend origin (e.g. `http://localhost:3000`). Restart the backend after changes.

**File watching not working in Docker on macOS:** The frontend `dev` Dockerfile target sets `WATCHPACK_POLLING=true`. If changes still aren't picked up, add `CHOKIDAR_USEPOLLING=true` to the `environment:` block in `docker-compose.yml`.

**Supabase client fails to initialise:** Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in `.env` before starting the backend.

---

## Security

- `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. **Use it only in FastAPI (server-side).** Never put it in a `NEXT_PUBLIC_` variable.
- Commit `.env.example` (placeholders only). Never commit `.env` or `frontend/.env.local`.

---

## Optional: local Supabase

Run a full local Supabase stack (Postgres, Auth, Storage) with:

```bash
npx supabase start
```

Update `SUPABASE_URL` and the key variables to the local values printed by that command.
