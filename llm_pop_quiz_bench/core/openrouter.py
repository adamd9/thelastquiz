from __future__ import annotations

import os
from typing import Any

import httpx

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_PREFIX = "openrouter:"


def strip_prefix(model_id: str) -> str:
    if model_id.startswith(OPENROUTER_PREFIX):
        return model_id[len(OPENROUTER_PREFIX) :]
    return model_id


def fetch_user_models(api_key: str | None = None) -> list[dict[str, Any]]:
    key = api_key or os.environ.get("OPENROUTER_API_KEY")
    if not key:
        return []
    headers = {"Authorization": f"Bearer {key}"}
    with httpx.Client(base_url=OPENROUTER_BASE_URL, timeout=30) as client:
        resp = client.get("/models/user", headers=headers)
        resp.raise_for_status()
        data = resp.json()
    models = data.get("data")
    if isinstance(models, list):
        return models
    return []


def normalize_models(raw_models: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for entry in raw_models:
        model_id = entry.get("id")
        if not model_id:
            continue
        clean_id = strip_prefix(model_id)
        normalized.append(
            {
                "id": clean_id,
                "model": clean_id,
                "name": entry.get("name") or clean_id,
                "description": entry.get("description") or "",
                "context_length": entry.get("context_length"),
                "pricing": entry.get("pricing"),
            }
        )
    return normalized


_release_cache: dict[str, str] | None = None


def _load_release_dates(api_key: str | None = None) -> dict[str, str]:
    """Fetch ``{model_id: 'YYYY-MM-DD'}`` from OpenRouter's public model index.

    Each model object carries a ``created`` unix timestamp; we surface it as the
    model's release date. Raises on transport errors (callers guard).
    """
    from datetime import datetime, timezone

    headers = {}
    key = api_key or os.environ.get("OPENROUTER_API_KEY")
    if key:
        headers["Authorization"] = f"Bearer {key}"
    with httpx.Client(base_url=OPENROUTER_BASE_URL, timeout=20) as client:
        resp = client.get("/models", headers=headers)
        resp.raise_for_status()
        data = resp.json()
    models = data.get("data") if isinstance(data, dict) else None
    out: dict[str, str] = {}
    if isinstance(models, list):
        for entry in models:
            mid = entry.get("id")
            created = entry.get("created")
            if not mid or not created:
                continue
            try:
                out[mid] = datetime.fromtimestamp(int(created), tz=timezone.utc).strftime("%Y-%m-%d")
            except (ValueError, OSError, OverflowError):
                continue
    return out


def fetch_release_dates(model_ids: list[str] | None = None, *, force: bool = False) -> dict[str, str]:
    """Model release dates (ISO ``YYYY-MM-DD``) from the OpenRouter index, cached.

    Best-effort: returns ``{}`` (or a partial map) if OpenRouter is unreachable,
    and only caches a successful, non-empty fetch so failures are retried.
    """
    global _release_cache
    if _release_cache is None or force:
        try:
            loaded = _load_release_dates()
        except Exception:
            loaded = {}
        if not loaded:
            return {}
        _release_cache = loaded
    if model_ids is None:
        return dict(_release_cache)
    return {m: _release_cache[m] for m in model_ids if m in _release_cache}
