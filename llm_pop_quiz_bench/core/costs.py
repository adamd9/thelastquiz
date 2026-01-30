from __future__ import annotations

from typing import Any

from .openrouter import fetch_user_models, normalize_models


def _parse_price(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def fetch_openrouter_pricing_map() -> dict[str, dict[str, float | None]]:
    try:
        raw_models = fetch_user_models()
    except Exception:
        return {}
    pricing_map: dict[str, dict[str, float | None]] = {}
    for entry in normalize_models(raw_models):
        pricing = entry.get("pricing") or {}
        prompt = _parse_price(pricing.get("prompt"))
        completion = _parse_price(pricing.get("completion"))
        if prompt is None and completion is None:
            continue
        pricing_map[entry["id"]] = {"prompt": prompt, "completion": completion}
    return pricing_map


def estimate_run_cost(
    rows: list[dict[str, Any]],
    pricing_map: dict[str, dict[str, float | None]],
) -> dict[str, Any]:
    model_tokens: dict[str, dict[str, int]] = {}
    for row in rows:
        model_id = row.get("model_id") or ""
        if not model_id:
            continue
        tokens_in = row.get("tokens_in") or 0
        tokens_out = row.get("tokens_out") or 0
        bucket = model_tokens.setdefault(
            model_id, {"prompt_tokens": 0, "completion_tokens": 0}
        )
        bucket["prompt_tokens"] += int(tokens_in or 0)
        bucket["completion_tokens"] += int(tokens_out or 0)

    per_model: dict[str, dict[str, Any]] = {}
    total: float | None = 0.0
    missing_models: set[str] = set()
    priced_models = 0

    for model_id, tokens in model_tokens.items():
        pricing = pricing_map.get(model_id)
        prompt_price = pricing.get("prompt") if pricing else None
        completion_price = pricing.get("completion") if pricing else None
        cost = None
        if pricing is None or (prompt_price is None and completion_price is None):
            missing_models.add(model_id)
        else:
            if prompt_price is None:
                prompt_price = 0.0
                missing_models.add(model_id)
            if completion_price is None:
                completion_price = 0.0
                missing_models.add(model_id)
            cost = tokens["prompt_tokens"] * prompt_price + tokens["completion_tokens"] * completion_price
            total += cost
            priced_models += 1
        per_model[model_id] = {
            "prompt_tokens": tokens["prompt_tokens"],
            "completion_tokens": tokens["completion_tokens"],
            "prompt_price": prompt_price,
            "completion_price": completion_price,
            "cost": cost,
        }

    if priced_models == 0 and model_tokens:
        total = None

    return {
        "currency": "USD",
        "total": total,
        "model_count": len(model_tokens),
        "priced_model_count": priced_models,
        "pricing_complete": len(missing_models) == 0,
        "missing_pricing": sorted(missing_models),
        "per_model": per_model,
        "pricing_source": "openrouter",
    }
