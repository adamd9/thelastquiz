"""Concurrency regression tests for the disk-backed database.

Runs execute in background threads and each connect() builds a fresh
DiskDatabase over the same directory, so load-modify-save mutations must be
serialized. Without the shared lock these tests lose updates / rows.
"""
from __future__ import annotations

import threading

from llm_pop_quiz_bench.core.db_factory import connect


def test_concurrent_status_updates_are_not_lost(tmp_path):
    db_path = tmp_path / "db.sqlite3"
    db = connect(db_path)
    n = 25
    for i in range(n):
        db.insert_run(run_id=f"run{i}", quiz_id="q", status="running", models=["m"])
    db.close()

    def worker(i: int) -> None:
        d = connect(db_path)
        d.update_run_status(f"run{i}", "completed")
        d.close()

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    db = connect(db_path)
    runs = {r["run_id"]: r["status"] for r in db.fetch_runs()}
    db.close()

    assert len(runs) == n
    for i in range(n):
        assert runs[f"run{i}"] == "completed", f"run{i} lost its update"


def test_concurrent_result_inserts_are_all_recorded(tmp_path):
    db_path = tmp_path / "db.sqlite3"
    db = connect(db_path)
    db.insert_run(run_id="r", quiz_id="q", status="running", models=["m"])
    db.close()

    def worker(model: str) -> None:
        d = connect(db_path)
        d.insert_results(
            "r", "q", model,
            [{"question_id": f"{model}-{j}", "choice": "A"} for j in range(10)],
        )
        d.close()

    models = [f"m{i}" for i in range(8)]
    threads = [threading.Thread(target=worker, args=(m,)) for m in models]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    db = connect(db_path)
    results = db.fetch_results("r")
    db.close()

    assert len(results) == len(models) * 10
