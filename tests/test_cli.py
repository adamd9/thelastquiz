import sys
from pathlib import Path

import json

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from llm_pop_quiz_bench.cli.main import quiz_run
from llm_pop_quiz_bench.core.db_factory import connect


def test_cli_mock_results_dir(tmp_path, monkeypatch):
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

    runtime_dir = tmp_path / "runtime-data"
    monkeypatch.setenv("LLM_POP_QUIZ_RUNTIME_DIR", str(runtime_dir))
    monkeypatch.setenv("LLM_POP_QUIZ_ENV", "mock")
    monkeypatch.chdir(tmp_path)

    quiz_run(quiz_path, models="openai/gpt-4o")

    db_path = runtime_dir / "db" / "quizbench.sqlite3"
    # Note: The database might be disk-based storage now, not SQLite
    # So we just check for the presence of runtime directory

    db = connect(db_path)
    runs = db.fetch_runs()
    assert len(runs) > 0, "Expected a run recorded in database"
    run_id = runs[0]["run_id"]
    rows = db.fetch_results(run_id)
    db.close()

    assert rows, "Expected results rows in database"
