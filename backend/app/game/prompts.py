from __future__ import annotations

import logging
import random
from functools import lru_cache

logger = logging.getLogger(__name__)

_FALLBACK_PROMPTS = [
    "Write a function that draws a graph using PyTorch.",
    "Write any function that runs in O(n log n) time.",
    "Write a function that multiplies two numbers in O(n log n).",
    "Add two numbers in MIPSY.",
    "Design an API rate limiter for a distributed system.",
]


def fetch_random_prompt_text() -> str:
    try:
        from app.deps.supabase import get_supabase_client

        sb = get_supabase_client()
        res = sb.table("prompts").select("text").limit(80).execute()
        rows = res.data or []
        if not rows:
            return random.choice(_FALLBACK_PROMPTS)
        return str(random.choice(rows)["text"])
    except Exception as e:  # noqa: BLE001 — degrade without Supabase
        logger.debug("prompt fetch fallback: %s", e)
        return random.choice(_FALLBACK_PROMPTS)


@lru_cache(maxsize=1)
def get_prompt_fetcher():
    return fetch_random_prompt_text
