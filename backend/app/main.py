# Canonical OpenAPI 3 spec (YAML): ../openapi.yaml
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI

# Load repo-root .env for local `uvicorn` (Docker Compose uses env_file instead).
_load_root = Path(__file__).resolve().parents[2]
load_dotenv(_load_root / ".env")
load_dotenv(_load_root / "backend" / ".env", override=False)
from fastapi.middleware.cors import CORSMiddleware

from app.routers.game_ws import router as game_ws_router
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
app.include_router(game_ws_router)
