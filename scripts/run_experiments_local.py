#!/usr/bin/env python3
"""Validate experiment drafts locally before deploying an immutable revision.

No provider calls unless --run is supplied. Examples:
  .venv/bin/python scripts/run_experiments_local.py --experiments shutdown_pressure_v4
  .venv/bin/python scripts/run_experiments_local.py --definition /path/to/draft.json
  .venv/bin/python scripts/run_experiments_local.py --run --models openai/gpt-4o

Each condition gets one response. Use --conditions BASE DL_CL for a narrow check.
Use --db-dir PATH to retain local attempts, otherwise the scratch DB is cleaned up.
Local runs never update production coverage or publication.
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from llm_pop_quiz_bench.core import experiments  # noqa: E402
from llm_pop_quiz_bench.core import sqlite_store  # noqa: E402
from llm_pop_quiz_bench.core.sqlite_db import SQLiteDatabase  # noqa: E402
from llm_pop_quiz_bench.core.model_config import model_config_loader  # noqa: E402

DEFAULT_MODELS = ["openai/gpt-4o", "deepseek/deepseek-v3.2"]


def run(definitions, models, conditions, temp, db_dir, *, timeout=None, max_tokens=None):
    adapters = model_config_loader.create_adapters(models, use_mocks=False)
    missing = set(models) - {a.id for a in adapters}
    if missing or not adapters:
        raise ValueError(f"Unavailable models: {', '.join(sorted(missing or set(models)))}")
    if timeout is not None:
        for adapter in adapters:
            adapter.request_timeout_s = timeout
    path = db_dir / "db" / "quizbench.sqlite3"
    path.parent.mkdir(parents=True, exist_ok=True)
    db = SQLiteDatabase(sqlite_store.connect(path))
    issues = []
    try:
        for definition in definitions:
            exp = json.loads(json.dumps(definition))
            if conditions:
                exp["conditions"] = [c for c in exp["conditions"] if c["id"] in conditions]
                selected = {c["id"] for c in exp["conditions"]}
                exp["contrasts"] = [
                    c for c in exp.get("contrasts", [])
                    if c["minuend"] in selected and c["subtrahend"] in selected
                ]
            # Draft edits and subsets have distinct local-only identities.
            exp["id"] = f"local-{definition['id']}-{experiments.definition_hash(exp)[:12]}"
            db.upsert_quiz(exp, json.dumps(exp))
            run_id = uuid.uuid4().hex
            db.insert_run(
                run_id=run_id, quiz_id=exp["id"], status="queued",
                models=[a.id for a in adapters], settings={"local_validation": True},
            )
            overrides = {}
            if temp is not None:
                overrides["temperature"] = temp
            if max_tokens is not None:
                overrides["max_tokens"] = max_tokens
            experiments.run_experiment_sync(
                exp, adapters, run_id=run_id, database=db,
                params=overrides or None,
                request_timeout_s=timeout,
            )
            recorded = db.fetch_run(run_id)
            print(f"\n{definition['id']} v{definition['version']} — {run_id}")
            print(f"Source definition hash: {experiments.definition_hash(definition)}")
            for row in db.fetch_results(run_id):
                print(f"{row['model_id']} / {row['question_id']}: "
                      f"{row['choice'] or 'INVALID'} — {row.get('reason') or '(no reason)'}")
            failures = [s for s in recorded["settings"]["model_status"] if s["status"] != "completed"]
            if failures:
                issues.append(f"{definition['id']} provider failures: {json.dumps(failures)}")
            invalids = [
                s for s in recorded["settings"]["model_status"] if s.get("invalid")
            ]
            if invalids:
                issues.append(f"{definition['id']} invalid responses: {json.dumps(invalids)}")
        if issues:
            raise RuntimeError("\n".join(issues))
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--definition", type=Path)
    source.add_argument("--experiments", nargs="+")
    parser.add_argument("--models", nargs="+", default=DEFAULT_MODELS)
    parser.add_argument("--conditions", nargs="+")
    parser.add_argument("--temp", type=float)
    parser.add_argument("--run", action="store_true", help="Make paid real-provider calls")
    parser.add_argument("--timeout", type=float, help="Local request timeout in seconds (transport and experiment)")
    parser.add_argument("--max-tokens", type=int, help="Local output allowance override; recorded with the run")
    parser.add_argument("--db-dir", type=Path)
    args = parser.parse_args()
    if args.timeout is not None and args.timeout <= 0:
        parser.error("--timeout must be positive")
    if args.max_tokens is not None and args.max_tokens <= 0:
        parser.error("--max-tokens must be positive")
    try:
        if args.definition:
            definitions = [experiments.load_experiment_file(args.definition)]
        else:
            ids = args.experiments or experiments.latest_experiment_ids()
            definitions = []
            for eid in ids:
                exp = experiments.get_experiment(eid)
                if not exp:
                    raise ValueError(f"Unknown experiment: {eid}")
                definitions.append(exp)
        for exp in definitions:
            ids = {c["id"] for c in exp["conditions"]}
            if args.conditions and not set(args.conditions) <= ids:
                raise ValueError(f"{exp['id']}: unknown conditions: {set(args.conditions) - ids}")
            print(f"\n{exp['id']} v{exp['version']} hash={experiments.definition_hash(exp)}")
            for condition in exp["conditions"]:
                if args.conditions and condition["id"] not in args.conditions:
                    continue
                print(f"\n--- {condition['id']}: {condition['label']} ---")
                for message in experiments.build_condition_messages(exp, condition):
                    print(f"[{message['role']}]\n{message['content']}")
        if not args.run:
            print("\nPROMPT PREVIEW ONLY — no provider calls. Add --run after reviewing the wording.")
            return 0
        if args.db_dir:
            run(definitions, args.models, args.conditions, args.temp, args.db_dir,
                timeout=args.timeout, max_tokens=args.max_tokens)
        else:
            with tempfile.TemporaryDirectory(prefix="tlq-local-experiments-") as directory:
                run(definitions, args.models, args.conditions, args.temp, Path(directory),
                    timeout=args.timeout, max_tokens=args.max_tokens)
        return 0
    except (ValueError, RuntimeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
