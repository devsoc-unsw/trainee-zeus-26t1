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
from supabase._sync.client import SupabaseException


def _credentials_configured(url: str, key: str) -> bool:
    """Reject .env.example placeholders and keys that are not JWT-shaped."""
    url = url.strip()
    key = key.strip()
    if not url or not key:
        return False
    low = url.lower()
    if "your-project" in low or "placeholder" in low:
        return False
    if key.startswith("your-") or "placeholder" in key.lower():
        return False
    if not low.startswith("https://") or ".supabase.co" not in low:
        return False
    parts = key.split(".")
    return len(parts) >= 3 and all(len(p) >= 4 for p in parts[:3])


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL") or ""
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not url.strip():
        raise ValueError("SUPABASE_URL environment variable is not set")
    if not key.strip():
        raise ValueError("SUPABASE_SERVICE_ROLE_KEY environment variable is not set")
    if not _credentials_configured(url, key):
        raise ValueError(
            "Supabase credentials are placeholders or malformed; set SUPABASE_URL "
            "and SUPABASE_SERVICE_ROLE_KEY in .env (Project Settings → API)"
        )
    try:
        return create_client(url.strip(), key.strip())
    except SupabaseException as e:
        raise ValueError(
            "Invalid SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; use the service_role "
            "JWT from Supabase Project Settings → API"
        ) from e
