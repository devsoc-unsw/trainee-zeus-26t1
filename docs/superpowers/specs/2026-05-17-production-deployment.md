# Production Deployment — Design

**Date:** 2026-05-17
**Status:** Approved, ready for implementation
**Branch:** `deploy` (or done directly on `main`)
**Scope:** Get the Code Telephone backend + frontend live on the internet. Frontend on Vercel; backend on Fly.io (WebSocket-friendly); Supabase already cloud-hosted.

## Goal

A public URL the user can hand to friends to play. Backend keeps WebSocket connections alive; frontend serves the Next.js app; Supabase persists lobby data.

## Why Fly.io for the backend (not Vercel)

Vercel's serverless model terminates idle functions; a WebSocket hub needs to keep state in memory across long-lived connections. Fly.io runs a real container with a long-running process, which is what FastAPI/Uvicorn needs. Railway and Render are equivalent options if Fly is unavailable in the user's region. The rest of this spec assumes Fly.

Vercel is fine (and ideal) for the frontend — Next.js 16 App Router + SSR works out of the box.

## Architecture

```
Browser ──HTTPS──► Vercel  (Next.js, static + SSR)
   │                  │
   │                  └─ NEXT_PUBLIC_API_URL=https://zeus-backend.fly.dev
   │
   └──WSS──► Fly.io (FastAPI + Uvicorn, WebSocket)
                  │
                  └─ Supabase (cloud, already provisioned)
```

The browser talks to both directly. The Next.js Docker container doesn't need to reach the backend at runtime (no SSR fetches into FastAPI in this app), so `INTERNAL_API_URL` is unused in production.

## Tasks

### 1. Backend on Fly.io

- Install Fly CLI: `curl -L https://fly.io/install.sh | sh` (WSL-compatible).
- Sign in: `flyctl auth login`.
- Initialize the app from the repo root:
  ```bash
  cd /mnt/d/Documents/trainee-zeus-26t1
  flyctl launch --no-deploy --copy-config --name zeus-backend --dockerfile backend/Dockerfile
  ```
- Choose a region (closest to the user). Decline the prompt to add Postgres / Redis (using Supabase).
- This generates `fly.toml` at the repo root. Edit it to:
  - Set the internal port to 8000 (matches `backend/Dockerfile`'s `EXPOSE 8000`).
  - Enable HTTPS by default.
  - Pin to a single VM with `auto_stop_machines = false` so WebSocket connections aren't dropped by autoscaling.

  Example `fly.toml`:
  ```toml
  app = "zeus-backend"
  primary_region = "syd"      # or your chosen region

  [build]
    dockerfile = "backend/Dockerfile"

  [http_service]
    internal_port = 8000
    force_https = true
    auto_stop_machines = false
    auto_start_machines = true
    min_machines_running = 1

  [[vm]]
    cpu_kind = "shared"
    cpus = 1
    memory_mb = 512
  ```

- Set secrets:
  ```bash
  flyctl secrets set \
    SUPABASE_URL=https://YOUR.supabase.co \
    SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY \
    CORS_ORIGINS=https://YOUR-FRONTEND.vercel.app \
    GEMINI_API_KEY=YOUR_GEMINI_KEY   # optional, only if Branch 3 landed
  ```

- Deploy:
  ```bash
  flyctl deploy
  ```

- Verify: `curl https://zeus-backend.fly.dev/health` returns `{"status":"ok"}`.

### 2. Frontend on Vercel

- Push the branch with all merged work to GitHub.
- Connect the repo to Vercel via the web UI. Set the root directory to `frontend/`.
- Build settings:
  - Framework Preset: **Next.js** (auto-detected).
  - Build Command: leave default (`npm run build`).
  - Output Directory: leave default (`.next`).
- Environment variables (Vercel dashboard → Settings → Environment Variables):
  - `NEXT_PUBLIC_API_URL=https://zeus-backend.fly.dev`
  - `NEXT_PUBLIC_SUPABASE_URL=https://YOUR.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY`
- Trigger a deploy. Vercel will give a `https://<project>.vercel.app` URL.

### 3. Update CORS on the backend

After Vercel hands you the final URL:
```bash
flyctl secrets set CORS_ORIGINS=https://YOUR-VERCEL.vercel.app
```
The backend reads `CORS_ORIGINS` at startup; setting a new secret restarts the VM. Verify with browser devtools that requests from the Vercel origin succeed without CORS errors.

### 4. Sanity-check end-to-end

Open the Vercel URL in three tabs. Create a room → join twice → start → walk through phases → reveal. Watch the WebSocket frames in devtools to confirm `wss://zeus-backend.fly.dev/ws/game` is connected.

## Scope

**In:**
- `fly.toml` at repo root (or backend/, your choice — Fly accepts either).
- Vercel project configured.
- Production env vars set on both platforms.
- CORS updated to allow the Vercel origin.

**Out (deferred):**
- Custom domain (use the `*.vercel.app` and `*.fly.dev` defaults for tonight).
- Horizontal scaling (one Fly machine is enough until you have >100 concurrent players).
- Sticky sessions / session affinity (one machine = no load balancer needed).
- Observability (Fly's built-in logs are fine for v1; LogTail / Sentry later).
- Backup / disaster recovery for Supabase data.

## Acceptance

- `curl https://zeus-backend.fly.dev/health` returns 200 OK.
- Vercel URL loads the home wizard.
- Creating a room from the Vercel URL connects WebSocket to Fly.io (verify in devtools Network → WS panel).
- A 3-player game runs end-to-end through reveal without errors.
- Refreshing mid-game loses local state (expected — reconnect is out of scope), but the backend room persists.

## Risk / known gaps

- **Single VM = single point of failure.** If the Fly machine crashes mid-game, in-memory game state is lost. Players can rejoin by recreating the room. Acceptable for v1 demo.
- **Cold start latency on first request.** With `min_machines_running = 1`, this is mitigated. If cost matters, drop to 0 and accept ~5s cold-start on the first connect.
- **Free-tier Gemini quota.** If many games run, the daily quota exhausts and the reveal silently degrades to "Score pending". Acceptable — not a crash.
- **No CDN for the FastAPI `/docs` page.** Not user-facing; ignore.
