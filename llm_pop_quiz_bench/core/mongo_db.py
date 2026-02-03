"""MongoDB database implementation using the DatabaseInterface."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

try:
    from pymongo import MongoClient
    from pymongo.collection import Collection
    from pymongo.database import Database
    PYMONGO_AVAILABLE = True
except ImportError:
    PYMONGO_AVAILABLE = False
    MongoClient = None
    Collection = None
    Database = None

from .db_interface import DatabaseInterface


class MongoDatabase(DatabaseInterface):
    """MongoDB implementation of the database interface."""

    def __init__(self, client: "MongoClient", db_name: str = "quizbench"):
        if not PYMONGO_AVAILABLE:
            raise ImportError("pymongo is required for MongoDB support")
        self.client = client
        self.db: Database = client[db_name]
        self.quizzes: Collection = self.db["quizzes"]
        self.runs: Collection = self.db["runs"]
        self.results: Collection = self.db["results"]
        self.assets: Collection = self.db["assets"]
        
        # Create indexes for better performance
        self._ensure_indexes()

    def _ensure_indexes(self) -> None:
        """Create indexes for collections."""
        self.quizzes.create_index("quiz_id", unique=True)
        self.runs.create_index("run_id", unique=True)
        self.runs.create_index("quiz_id")
        self.runs.create_index("created_at")
        self.results.create_index([("run_id", 1), ("model_id", 1)])
        self.assets.create_index("run_id")

    def close(self) -> None:
        """Close database connection."""
        if self.client:
            self.client.close()

    def upsert_quiz(
        self,
        quiz_def: dict,
        quiz_json: str,
        raw_payload: dict | None = None,
    ) -> None:
        """Insert or update a quiz."""
        quiz_id = quiz_def["id"]
        title = quiz_def.get("title", "")
        source = quiz_def.get("source", {})
        created_at = datetime.now(timezone.utc).isoformat()
        
        doc = {
            "quiz_id": quiz_id,
            "title": title,
            "source": source,
            "quiz_json": quiz_json,
            "raw_payload": raw_payload or {},
            "created_at": created_at,
        }
        
        self.quizzes.update_one(
            {"quiz_id": quiz_id},
            {"$set": doc},
            upsert=True,
        )

    def insert_run(
        self,
        run_id: str,
        quiz_id: str,
        status: str,
        models: list[str],
        settings: dict | None = None,
    ) -> None:
        """Insert a new run."""
        created_at = datetime.now(timezone.utc).isoformat()
        doc = {
            "run_id": run_id,
            "quiz_id": quiz_id,
            "created_at": created_at,
            "status": status,
            "models": models,
            "settings": settings or {},
        }
        self.runs.update_one(
            {"run_id": run_id},
            {"$set": doc},
            upsert=True,
        )

    def update_run_status(self, run_id: str, status: str) -> None:
        """Update the status of a run."""
        self.runs.update_one(
            {"run_id": run_id},
            {"$set": {"status": status}},
        )

    def mark_stale_runs_failed(
        self,
        statuses: Iterable[str] = ("queued", "running", "reporting"),
        new_status: str = "failed",
    ) -> list[str]:
        """Mark stale runs as failed and return their IDs."""
        status_list = list(statuses)
        if not status_list:
            return []
        
        cursor = self.runs.find({"status": {"$in": status_list}}, {"run_id": 1})
        run_ids = [doc["run_id"] for doc in cursor]
        
        if run_ids:
            self.runs.update_many(
                {"status": {"$in": status_list}},
                {"$set": {"status": new_status}},
            )
        
        return run_ids

    def insert_results(
        self,
        run_id: str,
        quiz_id: str,
        model_id: str,
        rows: Iterable[dict],
    ) -> None:
        """Insert result rows for a run."""
        docs = []
        for row in rows:
            doc = {
                "run_id": run_id,
                "quiz_id": quiz_id,
                "model_id": model_id,
                "question_id": row.get("question_id", ""),
                "choice": row.get("choice", ""),
                "reason": row.get("reason", ""),
                "additional_thoughts": row.get("additional_thoughts", ""),
                "refused": bool(row.get("refused")),
                "latency_ms": row.get("latency_ms"),
                "tokens_in": row.get("tokens_in"),
                "tokens_out": row.get("tokens_out"),
            }
            docs.append(doc)
        
        if docs:
            self.results.insert_many(docs)

    def insert_asset(self, run_id: str, asset_type: str, path: Path) -> None:
        """Insert an asset record."""
        created_at = datetime.now(timezone.utc).isoformat()
        doc = {
            "run_id": run_id,
            "asset_type": asset_type,
            "path": str(path),
            "created_at": created_at,
        }
        self.assets.insert_one(doc)

    def fetch_results(self, run_id: str) -> list[dict]:
        """Fetch all results for a run."""
        cursor = self.results.find(
            {"run_id": run_id},
            {"_id": 0}  # Exclude MongoDB's internal _id field
        )
        return [
            {
                "run_id": doc["run_id"],
                "quiz_id": doc["quiz_id"],
                "model_id": doc["model_id"],
                "question_id": doc["question_id"],
                "choice": doc["choice"],
                "reason": doc["reason"],
                "additional_thoughts": doc["additional_thoughts"],
                "refused": 1 if doc.get("refused") else 0,
                "latency_ms": doc.get("latency_ms"),
                "tokens_in": doc.get("tokens_in"),
                "tokens_out": doc.get("tokens_out"),
            }
            for doc in cursor
        ]

    def fetch_runs(self) -> list[dict]:
        """Fetch all runs."""
        cursor = self.runs.find({}, {"_id": 0}).sort("created_at", -1)
        return list(cursor)

    def fetch_run(self, run_id: str) -> dict | None:
        """Fetch a specific run by ID."""
        doc = self.runs.find_one({"run_id": run_id}, {"_id": 0})
        return doc

    def fetch_assets(self, run_id: str) -> list[dict]:
        """Fetch all assets for a run."""
        cursor = self.assets.find(
            {"run_id": run_id},
            {"_id": 0}
        ).sort("created_at", -1)
        return list(cursor)

    def delete_assets_for_run(self, run_id: str) -> None:
        """Delete all assets for a run."""
        self.assets.delete_many({"run_id": run_id})

    def fetch_quiz_json(self, quiz_id: str) -> str | None:
        """Fetch quiz JSON by ID."""
        doc = self.quizzes.find_one({"quiz_id": quiz_id}, {"quiz_json": 1, "_id": 0})
        return doc.get("quiz_json") if doc else None

    def fetch_quizzes(self) -> list[dict]:
        """Fetch all quizzes."""
        cursor = self.quizzes.find(
            {},
            {
                "quiz_id": 1,
                "title": 1,
                "source": 1,
                "created_at": 1,
                "raw_payload": 1,
                "_id": 0,
            }
        ).sort("created_at", -1)
        
        items = []
        for doc in cursor:
            item = {
                "quiz_id": doc.get("quiz_id"),
                "title": doc.get("title"),
                "source": doc.get("source", {}),
                "created_at": doc.get("created_at"),
                "raw_available": bool(doc.get("raw_payload")),
            }
            items.append(item)
        return items

    def fetch_quiz_def(self, quiz_id: str) -> dict | None:
        """Fetch quiz definition by ID."""
        doc = self.quizzes.find_one({"quiz_id": quiz_id}, {"quiz_json": 1, "_id": 0})
        if not doc or not doc.get("quiz_json"):
            return None
        return json.loads(doc["quiz_json"])

    def fetch_quiz_record(self, quiz_id: str) -> dict | None:
        """Fetch full quiz record including raw payload."""
        doc = self.quizzes.find_one(
            {"quiz_id": quiz_id},
            {"quiz_json": 1, "raw_payload": 1, "_id": 0}
        )
        if not doc:
            return None
        
        quiz_json = doc.get("quiz_json", "")
        raw_payload = doc.get("raw_payload", {})
        
        return {
            "quiz": json.loads(quiz_json) if quiz_json else {},
            "quiz_json": quiz_json,
            "raw_payload": raw_payload,
        }

    def delete_quiz(self, quiz_id: str) -> list[str]:
        """Delete a quiz and return IDs of deleted runs."""
        # Find all runs for this quiz
        cursor = self.runs.find({"quiz_id": quiz_id}, {"run_id": 1, "_id": 0})
        run_ids = [doc["run_id"] for doc in cursor]
        
        # Delete related data
        if run_ids:
            self.results.delete_many({"run_id": {"$in": run_ids}})
            self.assets.delete_many({"run_id": {"$in": run_ids}})
            self.runs.delete_many({"run_id": {"$in": run_ids}})
        
        # Delete the quiz itself
        self.quizzes.delete_one({"quiz_id": quiz_id})
        
        return run_ids
