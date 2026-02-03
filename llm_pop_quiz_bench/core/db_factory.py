"""Database factory for creating database connections with fallback support."""
from __future__ import annotations

import os
from pathlib import Path

from .db_interface import DatabaseInterface
from .sqlite_db import SQLiteDatabase
from .disk_db import DiskDatabase
from . import sqlite_store

try:
    from pymongo import MongoClient
    from .mongo_db import MongoDatabase
    PYMONGO_AVAILABLE = True
except ImportError:
    PYMONGO_AVAILABLE = False
    MongoClient = None
    MongoDatabase = None


def _test_mongo_connection(connection_string: str) -> bool:
    """Test if MongoDB connection is valid."""
    if not PYMONGO_AVAILABLE:
        return False
    
    try:
        client = MongoClient(connection_string, serverSelectionTimeoutMS=5000)
        # Test the connection
        client.admin.command('ping')
        client.close()
        return True
    except Exception:
        return False


def connect(db_path: Path) -> DatabaseInterface:
    """
    Create a database connection with the following priority:
    1. MongoDB if MONGODB_URI is set and connection is valid
    2. Disk-based JSONL storage if no MongoDB connection
    3. Migrate from SQLite to the chosen storage if SQLite DB exists
    
    Args:
        db_path: Path to the SQLite database (used for migration)
    
    Returns:
        DatabaseInterface instance
    """
    mongo_uri = os.environ.get("MONGODB_URI", "").strip()
    
    # Try MongoDB first if URI is provided
    if mongo_uri and _test_mongo_connection(mongo_uri):
        db_name = os.environ.get("MONGODB_DB_NAME", "quizbench").strip()
        client = MongoClient(mongo_uri)
        db = MongoDatabase(client, db_name)
        
        # Perform migration if SQLite DB exists
        if db_path.exists():
            _migrate_sqlite_to_new_db(db_path, db)
        
        return db
    
    # Fall back to disk-based storage
    disk_path = db_path.parent / "disk_storage"
    db = DiskDatabase(disk_path)
    
    # Perform migration if SQLite DB exists
    if db_path.exists():
        _migrate_sqlite_to_new_db(db_path, db)
    
    return db


def _migrate_sqlite_to_new_db(sqlite_path: Path, new_db: DatabaseInterface) -> None:
    """
    Migrate data from SQLite to the new database.
    
    Args:
        sqlite_path: Path to the SQLite database
        new_db: Target database interface
    """
    # Check if migration marker exists
    migration_marker = sqlite_path.parent / ".migrated"
    if migration_marker.exists():
        return
    
    # Connect to SQLite
    sqlite_conn = sqlite_store.connect(sqlite_path)
    sqlite_db = SQLiteDatabase(sqlite_conn)
    
    try:
        # Migrate quizzes
        quizzes = sqlite_db.fetch_quizzes()
        for quiz in quizzes:
            quiz_record = sqlite_db.fetch_quiz_record(quiz["quiz_id"])
            if quiz_record:
                quiz_def = quiz_record["quiz"]
                quiz_json = quiz_record["quiz_json"]
                raw_payload = quiz_record["raw_payload"]
                new_db.upsert_quiz(quiz_def, quiz_json, raw_payload)
        
        # Migrate runs
        runs = sqlite_db.fetch_runs()
        for run in runs:
            new_db.insert_run(
                run["run_id"],
                run["quiz_id"],
                run["status"],
                run["models"],
                run["settings"],
            )
        
        # Migrate results
        for run in runs:
            results = sqlite_db.fetch_results(run["run_id"])
            if results:
                # Group results by model_id
                by_model = {}
                for result in results:
                    model_id = result["model_id"]
                    if model_id not in by_model:
                        by_model[model_id] = []
                    by_model[model_id].append(result)
                
                # Insert results by model
                for model_id, model_results in by_model.items():
                    new_db.insert_results(
                        run["run_id"],
                        run["quiz_id"],
                        model_id,
                        model_results,
                    )
        
        # Migrate assets
        for run in runs:
            assets = sqlite_db.fetch_assets(run["run_id"])
            for asset in assets:
                new_db.insert_asset(
                    asset["run_id"],
                    asset["asset_type"],
                    Path(asset["path"]),
                )
        
        # Create migration marker
        migration_marker.write_text("Migration completed")
        
        # Optionally, rename the old SQLite DB
        backup_path = sqlite_path.with_suffix(".sqlite3.backup")
        sqlite_path.rename(backup_path)
        
    finally:
        sqlite_db.close()
