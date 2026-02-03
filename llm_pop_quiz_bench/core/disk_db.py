"""Disk-based JSONL storage implementation using the DatabaseInterface."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from .db_interface import DatabaseInterface
from .store import read_jsonl, write_jsonl, append_jsonl


class DiskDatabase(DatabaseInterface):
    """Disk-based JSONL implementation of the database interface."""

    def __init__(self, base_path: Path):
        self.base_path = base_path
        self.base_path.mkdir(parents=True, exist_ok=True)
        
        self.quizzes_path = base_path / "quizzes.jsonl"
        self.runs_path = base_path / "runs.jsonl"
        self.results_path = base_path / "results.jsonl"
        self.assets_path = base_path / "assets.jsonl"

    def close(self) -> None:
        """Close database connection (no-op for disk-based storage)."""
        pass

    def _load_quizzes(self) -> dict[str, dict]:
        """Load all quizzes into memory."""
        records = read_jsonl(self.quizzes_path)
        return {r["quiz_id"]: r for r in records}

    def _save_quizzes(self, quizzes: dict[str, dict]) -> None:
        """Save all quizzes to disk."""
        write_jsonl(self.quizzes_path, quizzes.values())

    def _load_runs(self) -> dict[str, dict]:
        """Load all runs into memory."""
        records = read_jsonl(self.runs_path)
        return {r["run_id"]: r for r in records}

    def _save_runs(self, runs: dict[str, dict]) -> None:
        """Save all runs to disk."""
        write_jsonl(self.runs_path, runs.values())

    def upsert_quiz(
        self,
        quiz_def: dict,
        quiz_json: str,
        raw_payload: dict | None = None,
    ) -> None:
        """Insert or update a quiz."""
        quizzes = self._load_quizzes()
        quiz_id = quiz_def["id"]
        title = quiz_def.get("title", "")
        source = quiz_def.get("source", {})
        created_at = datetime.now(timezone.utc).isoformat()
        
        quizzes[quiz_id] = {
            "quiz_id": quiz_id,
            "title": title,
            "source": source,
            "quiz_json": quiz_json,
            "raw_payload": raw_payload or {},
            "created_at": created_at,
        }
        self._save_quizzes(quizzes)

    def insert_run(
        self,
        run_id: str,
        quiz_id: str,
        status: str,
        models: list[str],
        settings: dict | None = None,
    ) -> None:
        """Insert a new run."""
        runs = self._load_runs()
        created_at = datetime.now(timezone.utc).isoformat()
        
        runs[run_id] = {
            "run_id": run_id,
            "quiz_id": quiz_id,
            "created_at": created_at,
            "status": status,
            "models": models,
            "settings": settings or {},
        }
        self._save_runs(runs)

    def update_run_status(self, run_id: str, status: str) -> None:
        """Update the status of a run."""
        runs = self._load_runs()
        if run_id in runs:
            runs[run_id]["status"] = status
            self._save_runs(runs)

    def mark_stale_runs_failed(
        self,
        statuses: Iterable[str] = ("queued", "running", "reporting"),
        new_status: str = "failed",
    ) -> list[str]:
        """Mark stale runs as failed and return their IDs."""
        status_list = list(statuses)
        if not status_list:
            return []
        
        runs = self._load_runs()
        run_ids = []
        
        for run_id, run in runs.items():
            if run["status"] in status_list:
                run["status"] = new_status
                run_ids.append(run_id)
        
        if run_ids:
            self._save_runs(runs)
        
        return run_ids

    def insert_results(
        self,
        run_id: str,
        quiz_id: str,
        model_id: str,
        rows: Iterable[dict],
    ) -> None:
        """Insert result rows for a run."""
        for row in rows:
            doc = {
                "run_id": run_id,
                "quiz_id": quiz_id,
                "model_id": model_id,
                "question_id": row.get("question_id", ""),
                "choice": row.get("choice", ""),
                "reason": row.get("reason", ""),
                "additional_thoughts": row.get("additional_thoughts", ""),
                "refused": 1 if row.get("refused") else 0,
                "latency_ms": row.get("latency_ms"),
                "tokens_in": row.get("tokens_in"),
                "tokens_out": row.get("tokens_out"),
            }
            append_jsonl(self.results_path, doc)

    def insert_asset(self, run_id: str, asset_type: str, path: Path) -> None:
        """Insert an asset record."""
        created_at = datetime.now(timezone.utc).isoformat()
        doc = {
            "run_id": run_id,
            "asset_type": asset_type,
            "path": str(path),
            "created_at": created_at,
        }
        append_jsonl(self.assets_path, doc)

    def fetch_results(self, run_id: str) -> list[dict]:
        """Fetch all results for a run."""
        records = read_jsonl(self.results_path)
        return [r for r in records if r.get("run_id") == run_id]

    def fetch_runs(self) -> list[dict]:
        """Fetch all runs."""
        records = read_jsonl(self.runs_path)
        # Sort by created_at descending
        return sorted(records, key=lambda x: x.get("created_at", ""), reverse=True)

    def fetch_run(self, run_id: str) -> dict | None:
        """Fetch a specific run by ID."""
        runs = self._load_runs()
        return runs.get(run_id)

    def fetch_assets(self, run_id: str) -> list[dict]:
        """Fetch all assets for a run."""
        records = read_jsonl(self.assets_path)
        assets = [r for r in records if r.get("run_id") == run_id]
        # Sort by created_at descending
        return sorted(assets, key=lambda x: x.get("created_at", ""), reverse=True)

    def delete_assets_for_run(self, run_id: str) -> None:
        """Delete all assets for a run."""
        records = read_jsonl(self.assets_path)
        filtered = [r for r in records if r.get("run_id") != run_id]
        write_jsonl(self.assets_path, filtered)

    def fetch_quiz_json(self, quiz_id: str) -> str | None:
        """Fetch quiz JSON by ID."""
        quizzes = self._load_quizzes()
        quiz = quizzes.get(quiz_id)
        return quiz.get("quiz_json") if quiz else None

    def fetch_quizzes(self) -> list[dict]:
        """Fetch all quizzes."""
        quizzes = self._load_quizzes()
        items = []
        for quiz in quizzes.values():
            item = {
                "quiz_id": quiz.get("quiz_id"),
                "title": quiz.get("title"),
                "source": quiz.get("source", {}),
                "created_at": quiz.get("created_at"),
                "raw_available": bool(quiz.get("raw_payload")),
            }
            items.append(item)
        # Sort by created_at descending
        return sorted(items, key=lambda x: x.get("created_at", ""), reverse=True)

    def fetch_quiz_def(self, quiz_id: str) -> dict | None:
        """Fetch quiz definition by ID."""
        quizzes = self._load_quizzes()
        quiz = quizzes.get(quiz_id)
        if not quiz or not quiz.get("quiz_json"):
            return None
        return json.loads(quiz["quiz_json"])

    def fetch_quiz_record(self, quiz_id: str) -> dict | None:
        """Fetch full quiz record including raw payload."""
        quizzes = self._load_quizzes()
        quiz = quizzes.get(quiz_id)
        if not quiz:
            return None
        
        quiz_json = quiz.get("quiz_json", "")
        raw_payload = quiz.get("raw_payload", {})
        
        return {
            "quiz": json.loads(quiz_json) if quiz_json else {},
            "quiz_json": quiz_json,
            "raw_payload": raw_payload,
        }

    def delete_quiz(self, quiz_id: str) -> list[str]:
        """Delete a quiz and return IDs of deleted runs."""
        # Find all runs for this quiz
        runs = self._load_runs()
        run_ids = [run_id for run_id, run in runs.items() if run.get("quiz_id") == quiz_id]
        
        # Delete runs
        for run_id in run_ids:
            del runs[run_id]
        self._save_runs(runs)
        
        # Delete results
        if run_ids:
            results = read_jsonl(self.results_path)
            filtered_results = [r for r in results if r.get("run_id") not in run_ids]
            write_jsonl(self.results_path, filtered_results)
            
            # Delete assets
            assets = read_jsonl(self.assets_path)
            filtered_assets = [a for a in assets if a.get("run_id") not in run_ids]
            write_jsonl(self.assets_path, filtered_assets)
        
        # Delete the quiz itself
        quizzes = self._load_quizzes()
        if quiz_id in quizzes:
            del quizzes[quiz_id]
            self._save_quizzes(quizzes)
        
        return run_ids
