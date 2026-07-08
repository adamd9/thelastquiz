"""SQLite database implementation using the DatabaseInterface."""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterable

from . import sqlite_store
from .db_interface import DatabaseInterface


class SQLiteDatabase(DatabaseInterface):
    """SQLite implementation of the database interface."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def close(self) -> None:
        """Close database connection."""
        self.conn.close()

    def upsert_quiz(
        self,
        quiz_def: dict,
        quiz_json: str,
        raw_payload: dict | None = None,
    ) -> None:
        """Insert or update a quiz."""
        sqlite_store.upsert_quiz(self.conn, quiz_def, quiz_json, raw_payload)

    def insert_run(
        self,
        run_id: str,
        quiz_id: str,
        status: str,
        models: list[str],
        settings: dict | None = None,
    ) -> None:
        """Insert a new run."""
        sqlite_store.insert_run(self.conn, run_id, quiz_id, status, models, settings)

    def update_run_status(self, run_id: str, status: str) -> None:
        """Update the status of a run."""
        sqlite_store.update_run_status(self.conn, run_id, status)

    def update_run_settings(self, run_id: str, settings: dict) -> None:
        """Replace the settings blob of a run."""
        sqlite_store.update_run_settings(self.conn, run_id, settings)

    def mark_stale_runs_failed(
        self,
        statuses: Iterable[str] = ("queued", "running", "reporting"),
        new_status: str = "failed",
    ) -> list[str]:
        """Mark stale runs as failed and return their IDs."""
        return sqlite_store.mark_stale_runs_failed(self.conn, statuses, new_status)

    def insert_results(
        self,
        run_id: str,
        quiz_id: str,
        model_id: str,
        rows: Iterable[dict],
    ) -> None:
        """Insert result rows for a run."""
        sqlite_store.insert_results(self.conn, run_id, quiz_id, model_id, rows)

    def insert_asset(self, run_id: str, asset_type: str, path: Path) -> None:
        """Insert an asset record."""
        sqlite_store.insert_asset(self.conn, run_id, asset_type, path)

    def fetch_results(self, run_id: str) -> list[dict]:
        """Fetch all results for a run."""
        return sqlite_store.fetch_results(self.conn, run_id)

    def fetch_runs(self) -> list[dict]:
        """Fetch all runs."""
        return sqlite_store.fetch_runs(self.conn)

    def fetch_run(self, run_id: str) -> dict | None:
        """Fetch a specific run by ID."""
        return sqlite_store.fetch_run(self.conn, run_id)

    def fetch_assets(self, run_id: str) -> list[dict]:
        """Fetch all assets for a run."""
        return sqlite_store.fetch_assets(self.conn, run_id)

    def delete_assets_for_run(self, run_id: str) -> None:
        """Delete all assets for a run."""
        sqlite_store.delete_assets_for_run(self.conn, run_id)

    def fetch_quiz_json(self, quiz_id: str) -> str | None:
        """Fetch quiz JSON by ID."""
        return sqlite_store.fetch_quiz_json(self.conn, quiz_id)

    def fetch_quizzes(self) -> list[dict]:
        """Fetch all quizzes."""
        return sqlite_store.fetch_quizzes(self.conn)

    def fetch_quiz_def(self, quiz_id: str) -> dict | None:
        """Fetch quiz definition by ID."""
        return sqlite_store.fetch_quiz_def(self.conn, quiz_id)

    def fetch_quiz_record(self, quiz_id: str) -> dict | None:
        """Fetch full quiz record including raw payload."""
        return sqlite_store.fetch_quiz_record(self.conn, quiz_id)

    def delete_quiz(self, quiz_id: str) -> list[str]:
        """Delete a quiz and return IDs of deleted runs."""
        return sqlite_store.delete_quiz(self.conn, quiz_id)

    def insert_audit(
        self,
        *,
        event: str,
        ip: str | None = None,
        run_id: str | None = None,
        quiz_id: str | None = None,
        models: list[str] | None = None,
        cost_usd: float | None = None,
        detail: dict | None = None,
    ) -> None:
        """Append an audit-log entry."""
        sqlite_store.insert_audit(
            self.conn,
            event=event,
            ip=ip,
            run_id=run_id,
            quiz_id=quiz_id,
            models=models,
            cost_usd=cost_usd,
            detail=detail,
        )

    def count_events_for_ip_since(self, ip: str, event: str, since_iso: str) -> int:
        """Count audit events for an IP since a timestamp."""
        return sqlite_store.count_events_for_ip_since(self.conn, ip, event, since_iso)

    def sum_cost_for_ip_since(self, ip: str, since_iso: str) -> float:
        """Sum recorded cost for an IP since a timestamp."""
        return sqlite_store.sum_cost_for_ip_since(self.conn, ip, since_iso)

    def fetch_ip_for_run(self, run_id: str) -> str | None:
        """Return the earliest recorded IP associated with a run."""
        return sqlite_store.fetch_ip_for_run(self.conn, run_id)

    def fetch_audit(self, since_iso: str | None = None) -> list[dict]:
        """Fetch audit-log entries (optionally only those at/after since_iso)."""
        return sqlite_store.fetch_audit(self.conn, since_iso)

    def replace_run_outcomes(
        self,
        run_id: str,
        quiz_id: str,
        outcomes: Iterable[dict],
    ) -> None:
        """Replace stored per-model outcomes for a run."""
        sqlite_store.replace_run_outcomes(self.conn, run_id, quiz_id, outcomes)

    def fetch_run_outcomes(self, run_id: str) -> list[dict]:
        """Fetch stored per-model outcomes for a run."""
        return sqlite_store.fetch_run_outcomes(self.conn, run_id)
