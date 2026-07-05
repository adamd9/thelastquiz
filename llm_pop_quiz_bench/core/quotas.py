"""Lightweight, opt-in usage quotas.

All limits default to "unlimited" so behaviour is unchanged unless an operator
sets the relevant environment variable. This is intentionally a thin framework:
enough to protect against runaway cost (e.g. blocking known-expensive models or
capping per-visitor usage) without a full accounts/billing system.

Environment variables:
- LLM_POP_QUIZ_MAX_RUNS_PER_DAY        int, per-IP runs in a rolling 24h window (0 = unlimited)
- LLM_POP_QUIZ_MAX_COST_PER_DAY        float USD, per-IP spend in a rolling 24h window (0 = unlimited)
- LLM_POP_QUIZ_BLOCKED_MODELS          comma-separated model ids that may never run
- LLM_POP_QUIZ_MAX_MODEL_PRICE_PER_M   float USD per 1M completion tokens; models above this are blocked (0 = unlimited)
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .db_interface import DatabaseInterface


@dataclass(frozen=True)
class QuotaConfig:
    max_runs_per_day: int = 0
    max_cost_per_day: float = 0.0
    blocked_models: frozenset[str] = field(default_factory=frozenset)
    max_model_price_per_m: float = 0.0

    @property
    def enabled(self) -> bool:
        return bool(
            self.max_runs_per_day
            or self.max_cost_per_day
            or self.blocked_models
            or self.max_model_price_per_m
        )


@dataclass(frozen=True)
class QuotaDecision:
    allowed: bool
    reason: str | None = None


def _parse_int(value: str | None) -> int:
    try:
        return max(0, int(float(value)))  # tolerate "5.0"
    except (TypeError, ValueError):
        return 0


def _parse_float(value: str | None) -> float:
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        return 0.0


def load_quota_config() -> QuotaConfig:
    blocked_raw = os.environ.get("LLM_POP_QUIZ_BLOCKED_MODELS", "")
    blocked = frozenset(
        item.strip() for item in blocked_raw.split(",") if item.strip()
    )
    return QuotaConfig(
        max_runs_per_day=_parse_int(os.environ.get("LLM_POP_QUIZ_MAX_RUNS_PER_DAY")),
        max_cost_per_day=_parse_float(os.environ.get("LLM_POP_QUIZ_MAX_COST_PER_DAY")),
        blocked_models=blocked,
        max_model_price_per_m=_parse_float(
            os.environ.get("LLM_POP_QUIZ_MAX_MODEL_PRICE_PER_M")
        ),
    )


def _completion_price_per_million(
    model_id: str,
    pricing_map: dict[str, dict[str, float | None]],
) -> float | None:
    pricing = pricing_map.get(model_id)
    if not pricing:
        return None
    completion = pricing.get("completion")
    if completion is None:
        return None
    return float(completion) * 1_000_000


def check_request_quota(
    db: "DatabaseInterface",
    ip: str | None,
    model_ids: list[str],
    pricing_map: dict[str, dict[str, float | None]] | None,
    config: QuotaConfig | None = None,
) -> QuotaDecision:
    """Return whether a run request is allowed under the configured quotas."""
    config = config or load_quota_config()
    if not config.enabled:
        return QuotaDecision(allowed=True)

    # 1) Hard model blocklist.
    if config.blocked_models:
        blocked_hit = [m for m in model_ids if m in config.blocked_models]
        if blocked_hit:
            return QuotaDecision(
                allowed=False,
                reason=(
                    "These models are not available right now: "
                    + ", ".join(blocked_hit)
                ),
            )

    # 2) Price ceiling (needs pricing data; skip silently if unavailable).
    if config.max_model_price_per_m and pricing_map:
        too_pricey = []
        for model_id in model_ids:
            price = _completion_price_per_million(model_id, pricing_map)
            if price is not None and price > config.max_model_price_per_m:
                too_pricey.append(f"{model_id} (${price:.2f}/1M)")
        if too_pricey:
            return QuotaDecision(
                allowed=False,
                reason=(
                    "These models exceed the current price limit of "
                    f"${config.max_model_price_per_m:.2f}/1M tokens: "
                    + ", ".join(too_pricey)
                ),
            )

    # Per-visitor limits only apply when we can identify the visitor.
    if ip:
        window_start = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

        if config.max_runs_per_day:
            runs = db.count_events_for_ip_since(ip, "run_created", window_start)
            if runs >= config.max_runs_per_day:
                return QuotaDecision(
                    allowed=False,
                    reason=(
                        "Daily run limit reached "
                        f"({config.max_runs_per_day} runs / 24h). Please try again later."
                    ),
                )

        if config.max_cost_per_day:
            spend = db.sum_cost_for_ip_since(ip, window_start)
            if spend >= config.max_cost_per_day:
                return QuotaDecision(
                    allowed=False,
                    reason=(
                        "Daily usage limit reached "
                        f"(${config.max_cost_per_day:.2f} / 24h). Please try again later."
                    ),
                )

    return QuotaDecision(allowed=True)
