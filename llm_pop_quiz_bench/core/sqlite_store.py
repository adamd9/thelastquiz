from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    _init_db(conn)
    return conn


def _init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS runs (
            run_id TEXT PRIMARY KEY,
            quiz_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            status TEXT NOT NULL,
            models_json TEXT NOT NULL,
            settings_json TEXT NOT NULL,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS quizzes (
            quiz_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            source_json TEXT NOT NULL,
            quiz_json TEXT NOT NULL,
            quiz_yaml TEXT,
            raw_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT NOT NULL,
            quiz_id TEXT NOT NULL,
            model_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            choice TEXT NOT NULL,
            reason TEXT NOT NULL,
            additional_thoughts TEXT NOT NULL,
            refused INTEGER NOT NULL,
            latency_ms INTEGER,
            tokens_in INTEGER,
            tokens_out INTEGER
        );

        CREATE TABLE IF NOT EXISTS assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT NOT NULL,
            asset_type TEXT NOT NULL,
            path TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            ip TEXT,
            event TEXT NOT NULL,
            run_id TEXT,
            quiz_id TEXT,
            models_json TEXT NOT NULL DEFAULT '[]',
            cost_usd REAL,
            detail_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE INDEX IF NOT EXISTS idx_audit_ip_time
            ON audit_log (ip, created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_event_time
            ON audit_log (event, created_at);

        CREATE TABLE IF NOT EXISTS run_outcomes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT NOT NULL,
            quiz_id TEXT NOT NULL,
            model_id TEXT NOT NULL,
            outcome TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_run_outcomes_run
            ON run_outcomes (run_id);
        """
    )
    _ensure_column(conn, "quizzes", "raw_json", "TEXT NOT NULL DEFAULT '{}'", "{}")
    _ensure_column(conn, "quizzes", "quiz_json", "TEXT")
    _ensure_column(conn, "runs", "updated_at", "TEXT")
    timestamp = datetime.now(timezone.utc).isoformat()
    _ensure_column(
        conn,
        "quizzes",
        "created_at",
        f"TEXT NOT NULL DEFAULT '{timestamp}'",
        timestamp,
    )
    conn.commit()


def _ensure_column(
    conn: sqlite3.Connection,
    table: str,
    column: str,
    definition: str,
    default_value: str | None = None,
) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column in columns:
        return
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    if default_value is not None:
        conn.execute(f"UPDATE {table} SET {column} = ? WHERE {column} IS NULL", (default_value,))
    conn.commit()


def upsert_quiz(
    conn: sqlite3.Connection,
    quiz_def: dict,
    quiz_json: str,
    raw_payload: dict | None = None,
) -> None:
    quiz_id = quiz_def["id"]
    title = quiz_def.get("title", "")
    source_json = json.dumps(quiz_def.get("source", {}), ensure_ascii=False)
    raw_json = json.dumps(raw_payload or {}, ensure_ascii=False)
    created_at = datetime.now(timezone.utc).isoformat()
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(quizzes)")}
    if "quiz_yaml" in columns:
        conn.execute(
            """
            INSERT INTO quizzes (quiz_id, title, source_json, quiz_json, quiz_yaml, raw_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(quiz_id) DO UPDATE SET
                title=excluded.title,
                source_json=excluded.source_json,
                quiz_json=excluded.quiz_json,
                quiz_yaml=excluded.quiz_yaml,
                raw_json=excluded.raw_json
            """,
            (quiz_id, title, source_json, quiz_json, quiz_json, raw_json, created_at),
        )
    else:
        conn.execute(
            """
            INSERT INTO quizzes (quiz_id, title, source_json, quiz_json, raw_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(quiz_id) DO UPDATE SET
                title=excluded.title,
                source_json=excluded.source_json,
                quiz_json=excluded.quiz_json,
                raw_json=excluded.raw_json
            """,
            (quiz_id, title, source_json, quiz_json, raw_json, created_at),
        )
    conn.commit()


def insert_run(
    conn: sqlite3.Connection,
    run_id: str,
    quiz_id: str,
    status: str,
    models: list[str],
    settings: dict | None = None,
) -> None:
    created_at = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT OR REPLACE INTO runs
        (run_id, quiz_id, created_at, status, models_json, settings_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            run_id,
            quiz_id,
            created_at,
            status,
            json.dumps(models, ensure_ascii=False),
            json.dumps(settings or {}, ensure_ascii=False),
            created_at,
        ),
    )
    conn.commit()


def update_run_status(conn: sqlite3.Connection, run_id: str, status: str) -> None:
    updated_at = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE runs SET status=?, updated_at=? WHERE run_id=?",
        (status, updated_at, run_id),
    )
    conn.commit()


def update_run_settings(conn: sqlite3.Connection, run_id: str, settings: dict) -> None:
    updated_at = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE runs SET settings=?, updated_at=? WHERE run_id=?",
        (json.dumps(settings or {}, ensure_ascii=False), updated_at, run_id),
    )
    conn.commit()


def mark_stale_runs_failed(
    conn: sqlite3.Connection,
    statuses: Iterable[str] = ("queued", "running", "reporting"),
    new_status: str = "failed",
) -> list[str]:
    status_list = list(statuses)
    if not status_list:
        return []
    placeholders = ", ".join(["?"] * len(status_list))
    rows = conn.execute(
        f"SELECT run_id FROM runs WHERE status IN ({placeholders})",
        status_list,
    ).fetchall()
    run_ids = [row["run_id"] for row in rows]
    if run_ids:
        conn.execute(
            f"UPDATE runs SET status = ? WHERE status IN ({placeholders})",
            (new_status, *status_list),
        )
        conn.commit()
    return run_ids


def insert_results(
    conn: sqlite3.Connection,
    run_id: str,
    quiz_id: str,
    model_id: str,
    rows: Iterable[dict],
) -> None:
    payload = []
    for row in rows:
        payload.append(
            (
                run_id,
                quiz_id,
                model_id,
                row.get("question_id", ""),
                row.get("choice", ""),
                row.get("reason", ""),
                row.get("additional_thoughts", ""),
                1 if row.get("refused") else 0,
                row.get("latency_ms"),
                row.get("tokens_in"),
                row.get("tokens_out"),
            )
        )
    if payload:
        conn.executemany(
            """
            INSERT INTO results
            (run_id, quiz_id, model_id, question_id, choice, reason, additional_thoughts, refused, latency_ms, tokens_in, tokens_out)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            payload,
        )
        conn.commit()


def insert_asset(conn: sqlite3.Connection, run_id: str, asset_type: str, path: Path) -> None:
    created_at = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO assets (run_id, asset_type, path, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (run_id, asset_type, str(path), created_at),
    )
    conn.commit()


def fetch_results(conn: sqlite3.Connection, run_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT run_id, quiz_id, model_id, question_id, choice, reason, additional_thoughts,
               refused, latency_ms, tokens_in, tokens_out
        FROM results
        WHERE run_id = ?
        """,
        (run_id,),
    ).fetchall()
    return [dict(row) for row in rows]

def fetch_runs(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT r.run_id, r.quiz_id, r.created_at, r.status, r.models_json, r.settings_json,
               r.updated_at, q.title AS quiz_title
        FROM runs r
        LEFT JOIN quizzes q ON q.quiz_id = r.quiz_id
        ORDER BY r.created_at DESC
        """
    ).fetchall()
    items = []
    for row in rows:
        item = dict(row)
        item["models"] = json.loads(item.pop("models_json"))
        item["settings"] = json.loads(item.pop("settings_json"))
        items.append(item)
    return items


def fetch_run(conn: sqlite3.Connection, run_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT r.run_id, r.quiz_id, r.created_at, r.status, r.models_json, r.settings_json,
               r.updated_at, q.title AS quiz_title
        FROM runs r
        LEFT JOIN quizzes q ON q.quiz_id = r.quiz_id
        WHERE r.run_id = ?
        """,
        (run_id,),
    ).fetchone()
    if not row:
        return None
    item = dict(row)
    item["models"] = json.loads(item.pop("models_json"))
    item["settings"] = json.loads(item.pop("settings_json"))
    return item


def fetch_assets(conn: sqlite3.Connection, run_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT run_id, asset_type, path, created_at
        FROM assets
        WHERE run_id = ?
        ORDER BY created_at DESC
        """,
        (run_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def delete_assets_for_run(conn: sqlite3.Connection, run_id: str) -> None:
    conn.execute("DELETE FROM assets WHERE run_id = ?", (run_id,))
    conn.commit()


def _raise_legacy_yaml(quiz_id: str) -> None:
    raise ValueError(
        f"Quiz {quiz_id} is stored in legacy YAML format. Re-import the quiz to convert it to JSON."
    )


def fetch_quiz_json(conn: sqlite3.Connection, quiz_id: str) -> str | None:
    row = conn.execute(
        "SELECT quiz_json, quiz_yaml FROM quizzes WHERE quiz_id = ?",
        (quiz_id,),
    ).fetchone()
    if not row:
        return None
    if row["quiz_json"]:
        return row["quiz_json"]
    if row["quiz_yaml"]:
        _raise_legacy_yaml(quiz_id)
    return None


def fetch_quizzes(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT quiz_id, title, source_json, raw_json, created_at
        FROM quizzes
        ORDER BY created_at DESC, quiz_id DESC
        """
    ).fetchall()
    items = []
    for row in rows:
        item = dict(row)
        item["source"] = json.loads(item.pop("source_json"))
        raw_payload = json.loads(item.pop("raw_json")) if row["raw_json"] else {}
        item["raw_available"] = bool(raw_payload)
        items.append(item)
    return items


def fetch_quiz_def(conn: sqlite3.Connection, quiz_id: str) -> dict | None:
    row = conn.execute(
        "SELECT quiz_json, quiz_yaml FROM quizzes WHERE quiz_id = ?",
        (quiz_id,),
    ).fetchone()
    if not row:
        return None
    if row["quiz_json"]:
        return json.loads(row["quiz_json"])
    if row["quiz_yaml"]:
        _raise_legacy_yaml(quiz_id)
    return None


def fetch_quiz_record(conn: sqlite3.Connection, quiz_id: str) -> dict | None:
    row = conn.execute(
        "SELECT quiz_json, quiz_yaml, raw_json FROM quizzes WHERE quiz_id = ?",
        (quiz_id,),
    ).fetchone()
    if not row:
        return None
    if not row["quiz_json"] and row["quiz_yaml"]:
        _raise_legacy_yaml(quiz_id)
    raw_payload = json.loads(row["raw_json"]) if row["raw_json"] else {}
    return {
        "quiz": json.loads(row["quiz_json"]) if row["quiz_json"] else {},
        "quiz_json": row["quiz_json"],
        "raw_payload": raw_payload,
    }


def delete_quiz(conn: sqlite3.Connection, quiz_id: str) -> list[str]:
    run_rows = conn.execute(
        "SELECT run_id FROM runs WHERE quiz_id = ?",
        (quiz_id,),
    ).fetchall()
    run_ids = [row["run_id"] for row in run_rows]

    if run_ids:
        conn.executemany("DELETE FROM results WHERE run_id = ?", ((rid,) for rid in run_ids))
        conn.executemany("DELETE FROM assets WHERE run_id = ?", ((rid,) for rid in run_ids))
        conn.executemany("DELETE FROM runs WHERE run_id = ?", ((rid,) for rid in run_ids))

    conn.execute("DELETE FROM quizzes WHERE quiz_id = ?", (quiz_id,))
    conn.commit()
    return run_ids


def insert_audit(
    conn: sqlite3.Connection,
    *,
    event: str,
    ip: str | None = None,
    run_id: str | None = None,
    quiz_id: str | None = None,
    models: list[str] | None = None,
    cost_usd: float | None = None,
    detail: dict | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO audit_log
        (created_at, ip, event, run_id, quiz_id, models_json, cost_usd, detail_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            datetime.now(timezone.utc).isoformat(),
            ip,
            event,
            run_id,
            quiz_id,
            json.dumps(models or [], ensure_ascii=False),
            cost_usd,
            json.dumps(detail or {}, ensure_ascii=False),
        ),
    )
    conn.commit()


def count_events_for_ip_since(
    conn: sqlite3.Connection,
    ip: str,
    event: str,
    since_iso: str,
) -> int:
    row = conn.execute(
        """
        SELECT COUNT(*) AS n
        FROM audit_log
        WHERE ip = ? AND event = ? AND created_at >= ?
        """,
        (ip, event, since_iso),
    ).fetchone()
    return int(row["n"] or 0)


def sum_cost_for_ip_since(conn: sqlite3.Connection, ip: str, since_iso: str) -> float:
    row = conn.execute(
        """
        SELECT COALESCE(SUM(cost_usd), 0) AS total
        FROM audit_log
        WHERE ip = ? AND cost_usd IS NOT NULL AND created_at >= ?
        """,
        (ip, since_iso),
    ).fetchone()
    return float(row["total"] or 0.0)


def fetch_ip_for_run(conn: sqlite3.Connection, run_id: str) -> str | None:
    row = conn.execute(
        """
        SELECT ip FROM audit_log
        WHERE run_id = ? AND ip IS NOT NULL
        ORDER BY id ASC
        LIMIT 1
        """,
        (run_id,),
    ).fetchone()
    return row["ip"] if row else None


def replace_run_outcomes(
    conn: sqlite3.Connection,
    run_id: str,
    quiz_id: str,
    outcomes: Iterable[dict],
) -> None:
    conn.execute("DELETE FROM run_outcomes WHERE run_id = ?", (run_id,))
    created_at = datetime.now(timezone.utc).isoformat()
    payload = [
        (
            run_id,
            quiz_id,
            str(outcome.get("model_id", "")),
            str(outcome.get("outcome", "")),
            created_at,
        )
        for outcome in outcomes
        if outcome.get("model_id")
    ]
    if payload:
        conn.executemany(
            """
            INSERT INTO run_outcomes (run_id, quiz_id, model_id, outcome, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            payload,
        )
    conn.commit()


def fetch_run_outcomes(conn: sqlite3.Connection, run_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT model_id, outcome
        FROM run_outcomes
        WHERE run_id = ?
        ORDER BY id ASC
        """,
        (run_id,),
    ).fetchall()
    return [dict(row) for row in rows]
