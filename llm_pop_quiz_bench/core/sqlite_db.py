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
