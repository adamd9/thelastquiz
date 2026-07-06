"""Benchmark service: golden-master loading, seeding, and DB aggregation.

The committed files in ``benchmarks/*.json`` are the source of truth. This module
loads them, seeds them into the run database so the existing runner can execute
them, and aggregates stored run outcomes into the public rankings payload.

Rankings are computed **live from the database of outcomes** (scored
deterministically by :mod:`core.dimensional`), so re-running a model or adding a
new one updates the public site with no manual editing.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .dimensional import get_dimensions, score_dimensional

BENCHMARKS_DIR = Path(__file__).resolve().parents[2] / "benchmarks"


def list_benchmark_files() -> list[Path]:
    return sorted(BENCHMARKS_DIR.glob("*.json"))


def load_benchmark_file(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def get_benchmark(benchmark_id: str) -> dict[str, Any] | None:
    """Load a benchmark definition (source of truth) by id."""
    for path in list_benchmark_files():
        data = load_benchmark_file(path)
        if data.get("id") == benchmark_id:
            return data
    return None


def benchmark_ids() -> set[str]:
    return {load_benchmark_file(p).get("id") for p in list_benchmark_files()}


def _benchmark_summary(bench: dict[str, Any]) -> dict[str, Any]:
    dims = get_dimensions(bench)
    return {
        "id": bench.get("id"),
        "title": bench.get("title"),
        "version": bench.get("version"),
        "license": bench.get("license"),
        "about": bench.get("about"),
        "reference": bench.get("source"),
        "question_count": len(bench.get("questions", [])),
        "kind": "bipolar" if any(d.get("poles") for d in dims) else "scalar",
        "dimensions": [
            {
                "id": d["id"],
                "name": d.get("name", d["id"]),
                "poles": d.get("poles"),
                "description": d.get("description"),
            }
            for d in dims
        ],
    }


def list_benchmarks() -> list[dict[str, Any]]:
    """Return lightweight summaries of every committed benchmark."""
    return [_benchmark_summary(load_benchmark_file(p)) for p in list_benchmark_files()]


def seed_benchmarks(db) -> list[str]:
    """Upsert every committed benchmark into the quizzes table.

    Idempotent; safe to call on startup or before an admin run. Returns the ids.
    """
    ids: list[str] = []
    for path in list_benchmark_files():
        bench = load_benchmark_file(path)
        quiz_json = json.dumps(bench, ensure_ascii=False, indent=2)
        db.upsert_quiz(bench, quiz_json)
        ids.append(bench["id"])
    return ids


def _type_from_profile(dims: list[dict[str, Any]], profile: dict[str, float]) -> str | None:
    letters: list[str] = []
    for dim in dims:
        poles = dim.get("poles")
        if not (isinstance(poles, dict) and poles.get("low") and poles.get("high")):
            return None
        letters.append(poles["high"] if profile.get(dim["id"], 0.0) >= 50.0 else poles["low"])
    return "".join(letters) if letters else None


def _completed_runs(db, benchmark_id: str) -> list[dict[str, Any]]:
    return [
        run
        for run in db.fetch_runs()
        if run.get("quiz_id") == benchmark_id and run.get("status") == "completed"
    ]


def aggregate_benchmark(db, benchmark_id: str) -> dict[str, Any] | None:
    """Aggregate a benchmark's completed runs into per-model profiles.

    Each model's shown profile comes from its LATEST completed run (a rerun
    supersedes the old one — no averaging).
    """
    bench = get_benchmark(benchmark_id)
    if not bench:
        return None
    dims = get_dimensions(bench)
    dim_ids = [d["id"] for d in dims]

    # Per model, collect each completed run's profile tagged with its timestamp.
    per_model_runs: dict[str, list[tuple[str, dict[str, float]]]] = {}
    latest: str | None = None

    for run in _completed_runs(db, benchmark_id):
        created = run.get("created_at") or ""
        if latest is None or created > latest:
            latest = created
        rows_by_model: dict[str, list[dict]] = {}
        for row in db.fetch_results(run["run_id"]):
            rows_by_model.setdefault(row["model_id"], []).append(row)
        for model_id, rows in rows_by_model.items():
            result = score_dimensional(bench, rows)
            if result.answered == 0:
                continue
            per_model_runs.setdefault(model_id, []).append((created, result.profile))

    models_out: dict[str, Any] = {}
    for model_id, runs in per_model_runs.items():
        runs.sort(key=lambda item: item[0])
        # Latest run wins for the displayed profile (no averaging across reruns).
        profile = {dim_id: round(runs[-1][1].get(dim_id, 0.0), 2) for dim_id in dim_ids}
        models_out[model_id] = {
            "profile": profile,
            "type_code": _type_from_profile(dims, profile),
            "runs": len(runs),
        }

    summary = _benchmark_summary(bench)
    summary["models"] = models_out
    summary["updated_at"] = latest
    return summary


def benchmark_coverage(db) -> list[dict[str, Any]]:
    """Admin view: each benchmark plus which models have results and run counts."""
    coverage = []
    for bench in list_benchmarks():
        agg = aggregate_benchmark(db, bench["id"])
        models = agg["models"] if agg else {}
        coverage.append(
            {
                **bench,
                "model_count": len(models),
                "models": sorted(models.keys()),
                "total_runs": sum(m["runs"] for m in models.values()),
                "updated_at": agg["updated_at"] if agg else None,
            }
        )
    return coverage


def _released_for(db) -> dict[str, str]:
    """Map ``model_id -> release date`` (ISO) from dates recorded with each run.

    Release dates are captured live from OpenRouter at run time and stored in the
    run's settings; here we only read those recorded values — there is no live
    lookup, so serving the rankings never depends on an external call.
    """
    released: dict[str, str] = {}
    for run in db.fetch_runs():
        recorded = (run.get("settings") or {}).get("model_released") or {}
        if isinstance(recorded, dict):
            for mid, date in recorded.items():
                if date:
                    released.setdefault(mid, date)
    return released


def build_rankings(db, models: list[str] | None = None) -> dict[str, Any]:
    """Public payload: per-benchmark radar data (Dark Triad, Big Five, Jungian type).

    Computed live from stored outcomes. ``models`` optionally restricts/orders the
    models shown (e.g. a curated top-10); by default every benchmarked model is
    included.
    """
    aggregates = [aggregate_benchmark(db, b["id"]) for b in list_benchmarks()]
    aggregates = [a for a in aggregates if a]

    present = sorted({model_id for a in aggregates for model_id in a["models"].keys()})
    model_list = [m for m in (models or present) if any(m in a["models"] for a in aggregates)]
    released_map = _released_for(db)

    benchmarks_out = []
    updated_candidates: list[str] = []
    for agg in aggregates:
        if agg.get("updated_at"):
            updated_candidates.append(agg["updated_at"])
        rows = []
        for model_id in model_list:
            entry = agg["models"].get(model_id)
            if entry:
                rows.append({"model_id": model_id, "released": released_map.get(model_id), **entry})
        benchmarks_out.append(
            {
                "id": agg["id"],
                "title": agg["title"],
                "version": agg["version"],
                "kind": agg["kind"],
                "about": agg.get("about"),
                "reference": agg.get("reference"),
                "question_count": agg.get("question_count"),
                "dimensions": agg["dimensions"],
                "models": rows,
                "updated_at": agg.get("updated_at"),
            }
        )

    return {
        "benchmarks": benchmarks_out,
        "models": model_list,
        "updated_at": max(updated_candidates) if updated_candidates else None,
    }
