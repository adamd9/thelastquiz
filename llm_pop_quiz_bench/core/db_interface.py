"""Abstract database interface for quiz storage."""
from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Iterable


class DatabaseInterface(ABC):
    """Abstract interface for database operations."""

    @abstractmethod
    def close(self) -> None:
        """Close database connection."""
        pass

    @abstractmethod
    def upsert_quiz(
        self,
        quiz_def: dict,
        quiz_json: str,
        raw_payload: dict | None = None,
    ) -> None:
        """Insert or update a quiz."""
        pass

    @abstractmethod
    def insert_run(
        self,
        run_id: str,
        quiz_id: str,
        status: str,
        models: list[str],
        settings: dict | None = None,
    ) -> None:
        """Insert a new run."""
        pass

    @abstractmethod
    def update_run_status(self, run_id: str, status: str) -> None:
        """Update the status of a run."""
        pass

    @abstractmethod
    def update_run_settings(self, run_id: str, settings: dict) -> None:
        """Replace the settings blob of a run."""
        pass

    @abstractmethod
    def mark_stale_runs_failed(
        self,
        statuses: Iterable[str] = ("queued", "running", "reporting"),
        new_status: str = "failed",
    ) -> list[str]:
        """Mark stale runs as failed and return their IDs."""
        pass

    @abstractmethod
    def insert_results(
        self,
        run_id: str,
        quiz_id: str,
        model_id: str,
        rows: Iterable[dict],
    ) -> None:
        """Insert result rows for a run."""
        pass

    @abstractmethod
    def insert_asset(self, run_id: str, asset_type: str, path: Path) -> None:
        """Insert an asset record."""
        pass

    @abstractmethod
    def fetch_results(self, run_id: str) -> list[dict]:
        """Fetch all results for a run."""
        pass

    @abstractmethod
    def fetch_runs(self) -> list[dict]:
        """Fetch all runs."""
        pass

    @abstractmethod
    def fetch_run(self, run_id: str) -> dict | None:
        """Fetch a specific run by ID."""
        pass

    @abstractmethod
    def fetch_assets(self, run_id: str) -> list[dict]:
        """Fetch all assets for a run."""
        pass

    @abstractmethod
    def delete_assets_for_run(self, run_id: str) -> None:
        """Delete all assets for a run."""
        pass

    @abstractmethod
    def fetch_quiz_json(self, quiz_id: str) -> str | None:
        """Fetch quiz JSON by ID."""
        pass

    @abstractmethod
    def fetch_quizzes(self) -> list[dict]:
        """Fetch all quizzes."""
        pass

    @abstractmethod
    def fetch_quiz_def(self, quiz_id: str) -> dict | None:
        """Fetch quiz definition by ID."""
        pass

    @abstractmethod
    def fetch_quiz_record(self, quiz_id: str) -> dict | None:
        """Fetch full quiz record including raw payload."""
        pass

    @abstractmethod
    def delete_quiz(self, quiz_id: str) -> list[str]:
        """Delete a quiz and return IDs of deleted runs."""
        pass

    @abstractmethod
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
        pass

    @abstractmethod
    def count_events_for_ip_since(self, ip: str, event: str, since_iso: str) -> int:
        """Count audit events for an IP since a timestamp."""
        pass

    @abstractmethod
    def sum_cost_for_ip_since(self, ip: str, since_iso: str) -> float:
        """Sum recorded cost for an IP since a timestamp."""
        pass

    @abstractmethod
    def fetch_ip_for_run(self, run_id: str) -> str | None:
        """Return the earliest recorded IP associated with a run."""
        pass

    @abstractmethod
    def replace_run_outcomes(
        self,
        run_id: str,
        quiz_id: str,
        outcomes: Iterable[dict],
    ) -> None:
        """Replace stored per-model outcomes for a run."""
        pass

    @abstractmethod
    def fetch_run_outcomes(self, run_id: str) -> list[dict]:
        """Fetch stored per-model outcomes for a run."""
        pass
