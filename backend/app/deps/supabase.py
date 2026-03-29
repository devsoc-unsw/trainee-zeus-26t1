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
