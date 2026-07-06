import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import json

from llm_pop_quiz_bench.adapters.mock_adapter import MockAdapter
from llm_pop_quiz_bench.core.runner import run_quiz
from llm_pop_quiz_bench.core.db_factory import connect


async def _run(tmp_path: Path):
    quiz = {
        "id": "mock-quiz",
        "title": "Mock Quiz",
        "source": {"publication": "X", "url": "https://x"},
        "questions": [
            {
                "id": "Q1",
                "text": "Pick one:",
                "options": [
                    {"id": "A", "text": "A"},
                    {"id": "B", "text": "B"},
                    {"id": "C", "text": "C"},
                ],
            }
        ],
    }
    quiz_path = tmp_path / "quiz.json"
    quiz_path.write_text(json.dumps(quiz, ensure_ascii=False), encoding="utf-8")
    run_id = "test-run"
    runtime_dir = tmp_path / "runtime-data"
    await run_quiz(quiz_path, [MockAdapter()], run_id, runtime_dir)

    # Check that results are stored in database
    db_path = runtime_dir / "db" / "quizbench.sqlite3"
    # Note: The database might be disk-based storage now, not SQLite

    db = connect(db_path)
    rows = db.fetch_results(run_id)
    db.close()

    assert rows, "Expected at least one result row"
    assert rows[0]["run_id"] == run_id
    assert "mock" in rows[0]["model_id"]


def test_runner_mocked(tmp_path):
    asyncio.run(_run(tmp_path))


class _FailingAdapter:
    """Adapter that errors on every question (e.g. out of API credits)."""

    def __init__(self, model: str = "broke") -> None:
        self.id = f"mock:{model}"

    async def send(self, messages, params=None):
        raise RuntimeError("402 Insufficient credits")


async def _run_incomplete(tmp_path: Path):
    quiz = {
        "id": "mock-quiz",
        "title": "Mock Quiz",
        "source": {"publication": "X", "url": "https://x"},
        "questions": [
            {
                "id": "Q1",
                "text": "Pick one:",
                "options": [
                    {"id": "A", "text": "A"},
                    {"id": "B", "text": "B"},
                ],
            },
            {
                "id": "Q2",
                "text": "Pick again:",
                "options": [
                    {"id": "A", "text": "A"},
                    {"id": "B", "text": "B"},
                ],
            },
        ],
    }
    quiz_path = tmp_path / "quiz.json"
    quiz_path.write_text(json.dumps(quiz, ensure_ascii=False), encoding="utf-8")
    run_id = "incomplete-run"
    runtime_dir = tmp_path / "runtime-data"
    await run_quiz(quiz_path, [_FailingAdapter()], run_id, runtime_dir)
    return (runtime_dir / "logs" / f"{run_id}.log").read_text(encoding="utf-8")


def test_runner_marks_incomplete_model_as_failed(tmp_path):
    log = asyncio.run(_run_incomplete(tmp_path))
    # A model that couldn't answer every question must be surfaced as failed,
    # not "completed successfully".
    assert "produced an incomplete result: answered 0/2" in log
    assert "Failed models (1)" in log
    assert "Model mock:broke completed successfully" not in log
