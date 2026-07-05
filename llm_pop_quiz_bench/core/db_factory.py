"""Database factory for creating database connections with fallback support."""
from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote_plus, urlparse, urlunparse

from .db_interface import DatabaseInterface
from .sqlite_db import SQLiteDatabase
from .disk_db import DiskDatabase
from . import sqlite_store
from .logging_utils import rotate_log_if_needed

try:
    from pymongo import MongoClient
    from .mongo_db import MongoDatabase
    PYMONGO_AVAILABLE = True
except ImportError:
    PYMONGO_AVAILABLE = False
    MongoClient = None
    MongoDatabase = None


def _append_db_log(message: str) -> None:
    """Append a message to the database connection log."""
    from .runtime_data import get_runtime_paths
    
    try:
        runtime_paths = get_runtime_paths()
        log_path = runtime_paths.logs_dir / "database.log"
        timestamp = datetime.now(timezone.utc).isoformat()
        log_path.parent.mkdir(parents=True, exist_ok=True)
        rotate_log_if_needed(log_path)
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(f"[{timestamp}] {message}\n")
        # Echo to console only when explicitly requested. Every request opens a
        # connection, so unconditional printing floods stdout with one line per
        # request; the full history is always kept in database.log.
        if os.environ.get("LLM_POP_QUIZ_DB_VERBOSE"):
            print(f"[DB] {message}")
    except Exception as e:
        # Fail silently if logging fails - don't break the connection
        print(f"[DB] Warning: Failed to write to database log: {e}")
        print(f"[DB] {message}")


def _encode_mongo_uri_credentials(uri: str) -> str:
    """
    Encode username and password in a MongoDB URI according to RFC 3986.
    
    Handles both standard mongodb:// and mongodb+srv:// URIs.
    Correctly handles passwords containing '@' by finding the last '@' before the host.
    """
    # Pattern to match the scheme (mongodb:// or mongodb+srv://)
    scheme_pattern = r'^(mongodb(?:\+srv)?://)'
    scheme_match = re.match(scheme_pattern, uri)
    
    if not scheme_match:
        return uri
    
    scheme = scheme_match.group(1)
    rest = uri[len(scheme):]
    
    # Find the last '@' which separates credentials from host
    # This handles passwords containing '@'
    at_idx = rest.rfind('@')
    if at_idx == -1:
        # No credentials in URI
        return uri
    
    credentials = rest[:at_idx]
    host_and_rest = rest[at_idx + 1:]
    
    # Split credentials into username and password at the first ':'
    colon_idx = credentials.find(':')
    if colon_idx == -1:
        # Only username, no password
        encoded_username = quote_plus(credentials)
        return f"{scheme}{encoded_username}@{host_and_rest}"
    
    username = credentials[:colon_idx]
    password = credentials[colon_idx + 1:]
    
    # Encode username and password
    encoded_username = quote_plus(username)
    encoded_password = quote_plus(password)
    
    return f"{scheme}{encoded_username}:{encoded_password}@{host_and_rest}"


def _test_mongo_connection(connection_string: str) -> bool:
    """Test if MongoDB connection is valid."""
    if not PYMONGO_AVAILABLE:
        _append_db_log("MongoDB client (pymongo) not available")
        return False
    
    try:
        client = MongoClient(connection_string, serverSelectionTimeoutMS=5000)
        # Test the connection
        client.admin.command('ping')
        client.close()
        _append_db_log("MongoDB connection test successful")
        return True
    except Exception as e:
        _append_db_log(f"MongoDB connection test failed: {type(e).__name__}: {str(e)}")
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
    if mongo_uri:
        # Encode credentials in the URI to handle special characters
        mongo_uri = _encode_mongo_uri_credentials(mongo_uri)
        _append_db_log(f"MONGODB_URI configured, attempting connection...")
        if _test_mongo_connection(mongo_uri):
            db_name = os.environ.get("MONGODB_DB_NAME", "quizbench").strip()
            _append_db_log(f"Using MongoDB backend (database: {db_name})")
            client = MongoClient(mongo_uri)
            db = MongoDatabase(client, db_name)
            
            # Perform migration if SQLite DB exists
            if db_path.exists():
                _migrate_sqlite_to_new_db(db_path, db)
            
            return db
        else:
            _append_db_log("MongoDB connection failed, falling back to disk storage")
    else:
        _append_db_log("No MONGODB_URI configured, using disk storage")
    
    # Fall back to disk-based storage
    disk_path = db_path.parent / "disk_storage"
    _append_db_log(f"Using disk-based storage at: {disk_path}")
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
        # Marker exists, but check if target DB actually has data
        # This handles the case where migration happened to a different target
        existing_quizzes = new_db.fetch_quizzes()
        existing_runs = new_db.fetch_runs()
        if existing_quizzes or existing_runs:
            _append_db_log("Migration already completed (marker found and target has data), skipping")
            return
        else:
            _append_db_log("Migration marker found but target DB is empty, proceeding with migration")
    
    _append_db_log(f"Starting migration from SQLite database: {sqlite_path}")
    
    # Connect to SQLite
    sqlite_conn = sqlite_store.connect(sqlite_path)
    sqlite_db = SQLiteDatabase(sqlite_conn)
    
    try:
        # Migrate quizzes
        quizzes = sqlite_db.fetch_quizzes()
        _append_db_log(f"Migrating {len(quizzes)} quizzes...")
        for quiz in quizzes:
            quiz_record = sqlite_db.fetch_quiz_record(quiz["quiz_id"])
            if quiz_record:
                quiz_def = quiz_record["quiz"]
                quiz_json = quiz_record["quiz_json"]
                raw_payload = quiz_record["raw_payload"]
                new_db.upsert_quiz(quiz_def, quiz_json, raw_payload)
        
        # Migrate runs
        runs = sqlite_db.fetch_runs()
        _append_db_log(f"Migrating {len(runs)} runs...")
        for run in runs:
            new_db.insert_run(
                run["run_id"],
                run["quiz_id"],
                run["status"],
                run["models"],
                run["settings"],
            )
        
        # Migrate results
        total_results = 0
        for run in runs:
            results = sqlite_db.fetch_results(run["run_id"])
            if results:
                total_results += len(results)
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
        _append_db_log(f"Migrated {total_results} results")
        
        # Migrate assets
        total_assets = 0
        for run in runs:
            assets = sqlite_db.fetch_assets(run["run_id"])
            for asset in assets:
                total_assets += 1
                new_db.insert_asset(
                    asset["run_id"],
                    asset["asset_type"],
                    Path(asset["path"]),
                )
        _append_db_log(f"Migrated {total_assets} assets")
        
        # Create migration marker
        migration_marker.write_text("Migration completed")
        
        # Optionally, rename the old SQLite DB
        backup_path = sqlite_path.with_suffix(".sqlite3.backup")
        sqlite_path.rename(backup_path)
        _append_db_log(f"Migration completed successfully. SQLite backup saved to: {backup_path}")
        
    except Exception as e:
        _append_db_log(f"Migration failed: {type(e).__name__}: {str(e)}")
        raise
    finally:
        sqlite_db.close()
