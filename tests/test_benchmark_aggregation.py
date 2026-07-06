import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from llm_pop_quiz_bench.core import benchmarks, dimensional
from llm_pop_quiz_bench.core.db_factory import connect


def _seed_run(db, bench, model_id, choice, run_id):
    normalized = dimensional.normalize_quiz(bench)
    db.upsert_quiz(bench, json.dumps(bench, ensure_ascii=False))
    db.insert_run(
        run_id=run_id,
        quiz_id=bench["id"],
        status="completed",
        models=[model_id],
        settings={"benchmark": True, "benchmark_id": bench["id"]},
    )
    rows = [
        {
            "question_id": q["id"],
            "choice": choice,
            "reason": "",
            "additional_thoughts": "",
            "refused": False,
        }
        for q in normalized["questions"]
    ]
    db.insert_results(run_id, bench["id"], model_id, rows)


def _seed_partial_run(db, bench, model_id, choice, run_id, answered):
    """Seed a run where only the first ``answered`` questions have a choice.

    The remaining questions are stored the way the runner records a technical
    failure: empty ``choice`` + ``refused=True`` (timeout / unparseable reply).
    """
    normalized = dimensional.normalize_quiz(bench)
    db.upsert_quiz(bench, json.dumps(bench, ensure_ascii=False))
    db.insert_run(
        run_id=run_id,
        quiz_id=bench["id"],
        status="completed",
        models=[model_id],
        settings={"benchmark": True, "benchmark_id": bench["id"]},
    )
    rows = []
    for index, q in enumerate(normalized["questions"]):
        if index < answered:
            rows.append(
                {
                    "question_id": q["id"],
                    "choice": choice,
                    "reason": "",
                    "additional_thoughts": "",
                    "refused": False,
                }
            )
        else:
            rows.append(
                {
                    "question_id": q["id"],
                    "choice": "",
                    "reason": "The model returned no answer.",
                    "additional_thoughts": "",
                    "refused": True,
                }
            )
    db.insert_results(run_id, bench["id"], model_id, rows)


def test_aggregate_midpoint_run_scores_fifty(tmp_path):
    conn = connect(tmp_path / "db.sqlite3")
    bench = benchmarks.get_benchmark("big_five_ipip50")
    _seed_run(conn, bench, "modelX", "C", "run1")

    agg = benchmarks.aggregate_benchmark(conn, "big_five_ipip50")
    assert set(agg["models"]) == {"modelX"}
    profile = agg["models"]["modelX"]["profile"]
    assert set(profile) == {"O", "C", "E", "A", "N"}
    assert all(value == 50.0 for value in profile.values())
    assert agg["models"]["modelX"]["runs"] == 1
    conn.close()


def test_aggregate_uses_latest_run_not_average(tmp_path):
    conn = connect(tmp_path / "db.sqlite3")
    bench = benchmarks.get_benchmark("big_five_ipip50")
    _seed_run(conn, bench, "modelX", "A", "old_run")   # extreme answers, first
    _seed_run(conn, bench, "modelX", "C", "new_run")    # midpoint, and latest

    agg = benchmarks.aggregate_benchmark(conn, "big_five_ipip50")
    profile = agg["models"]["modelX"]["profile"]
    # The latest run answered the exact midpoint, so every trait is 50; an
    # average with the earlier extreme run would not land on 50.
    assert all(value == 50.0 for value in profile.values()), profile
    assert agg["models"]["modelX"]["runs"] == 2
    conn.close()


def test_build_rankings_reports_all_benchmarks(tmp_path):
    conn = connect(tmp_path / "db.sqlite3")
    sd3 = benchmarks.get_benchmark("sd3_short_dark_triad")
    _seed_run(conn, sd3, "m", "C", "r1")
    _seed_run(conn, sd3, "m", "D", "r2")

    data = benchmarks.build_rankings(conn)
    ids = {b["id"] for b in data["benchmarks"]}
    assert {"big_five_ipip50", "mbti_oejts", "sd3_short_dark_triad"} <= ids

    sd3_view = next(b for b in data["benchmarks"] if b["id"] == "sd3_short_dark_triad")
    entry = next(r for r in sd3_view["models"] if r["model_id"] == "m")
    assert entry["runs"] == 2
    conn.close()


def test_seed_benchmarks_is_idempotent(tmp_path):
    conn = connect(tmp_path / "db.sqlite3")
    first = benchmarks.seed_benchmarks(conn)
    second = benchmarks.seed_benchmarks(conn)
    assert set(first) == set(second)
    assert "big_five_ipip50" in first
    conn.close()


def test_partial_run_is_excluded_from_rankings(tmp_path):
    conn = connect(tmp_path / "db.sqlite3")
    bench = benchmarks.get_benchmark("big_five_ipip50")
    # Model only answered 5 of the 50 questions; the rest are technical failures.
    _seed_partial_run(conn, bench, "flaky", "C", "partial", answered=5)

    agg = benchmarks.aggregate_benchmark(conn, "big_five_ipip50")
    # A partial run must not surface a (near-zero) profile in the rankings.
    assert "flaky" not in agg["models"]
    conn.close()


def test_partial_rerun_does_not_supersede_complete_run(tmp_path):
    conn = connect(tmp_path / "db.sqlite3")
    bench = benchmarks.get_benchmark("big_five_ipip50")
    _seed_run(conn, bench, "modelX", "C", "complete_run")  # full, midpoint
    # A later run that failed partway through should be ignored, not override
    # the earlier complete profile.
    _seed_partial_run(conn, bench, "modelX", "A", "partial_rerun", answered=3)

    agg = benchmarks.aggregate_benchmark(conn, "big_five_ipip50")
    entry = agg["models"]["modelX"]
    assert all(value == 50.0 for value in entry["profile"].values()), entry["profile"]
    # Only the complete run counts toward the run tally.
    assert entry["runs"] == 1
    conn.close()
