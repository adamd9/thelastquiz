"""Structural + scoring sanity tests for the committed golden-master benchmarks.

These guard the benchmark JSON files against typos, mis-keyed dimensions, and
scoring regressions. They do NOT call any model \u2014 they validate the instruments
themselves against the deterministic scorer.
"""

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from llm_pop_quiz_bench.core import dimensional

BENCHMARKS_DIR = pathlib.Path(__file__).resolve().parents[1] / "benchmarks"
BENCHMARK_FILES = sorted(BENCHMARKS_DIR.glob("*.json"))


def _load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_benchmark_files_exist():
    ids = {_load(p)["id"] for p in BENCHMARK_FILES}
    assert {"big_five_ipip50", "mbti_oejts", "sd3_short_dark_triad"} <= ids


def test_benchmarks_are_well_formed_dimensional_quizzes():
    for path in BENCHMARK_FILES:
        quiz = _load(path)
        assert dimensional.is_dimensional(quiz), f"{path.name} is not dimensional"
        dim_ids = {d["id"] for d in dimensional.get_dimensions(quiz)}
        assert dim_ids, f"{path.name} declares no dimensions"

        seen_ids = set()
        for question in quiz["questions"]:
            qid = question["id"]
            assert qid not in seen_ids, f"{path.name} duplicate question id {qid}"
            seen_ids.add(qid)
            if question.get("type") == "likert":
                assert question.get("dimension") in dim_ids, (
                    f"{path.name} item {qid} maps to unknown dimension "
                    f"{question.get('dimension')}"
                )
                assert isinstance(question.get("reverse", False), bool)


def test_midpoint_answers_score_every_dimension_at_fifty():
    # Answering the middle scale point ("C") to every Likert item must yield a
    # perfectly neutral 50/100 on every dimension, regardless of reverse-keying.
    for path in BENCHMARK_FILES:
        quiz = _load(path)
        normalized = dimensional.normalize_quiz(quiz)
        responses = [{"question_id": q["id"], "choice": "C"} for q in normalized["questions"]]
        result = dimensional.score_dimensional(quiz, responses)
        assert result.answered == len(normalized["questions"])
        for dim_id, score in result.scores.items():
            assert score.normalized == 50.0, (
                f"{path.name} dimension {dim_id} expected 50.0, got {score.normalized}"
            )


def test_big_five_extreme_profile_is_directionally_correct():
    quiz = _load(BENCHMARKS_DIR / "big_five_ipip50.json")
    normalized = dimensional.normalize_quiz(quiz)
    # Answer to MAXIMISE every trait: agree ("E") with positively-keyed items,
    # disagree ("A") with reverse-keyed items.
    responses = []
    for q in normalized["questions"]:
        responses.append({"question_id": q["id"], "choice": "A" if q.get("reverse") else "E"})
    result = dimensional.score_dimensional(quiz, responses)
    for dim_id, score in result.scores.items():
        assert score.normalized == 100.0, f"{dim_id} should be maxed, got {score.normalized}"


def test_oejts_produces_four_letter_type_code():
    quiz = _load(BENCHMARKS_DIR / "mbti_oejts.json")
    normalized = dimensional.normalize_quiz(quiz)
    responses = [{"question_id": q["id"], "choice": "C"} for q in normalized["questions"]]
    result = dimensional.score_dimensional(quiz, responses)
    assert result.type_code is not None
    assert len(result.type_code) == 4
    assert result.type_code[0] in "EI"
    assert result.type_code[1] in "SN"
    assert result.type_code[2] in "TF"
    assert result.type_code[3] in "JP"


def test_sd3_reverse_keys_present():
    quiz = _load(BENCHMARKS_DIR / "sd3_short_dark_triad.json")
    reverse_ids = {q["id"] for q in quiz["questions"] if q.get("reverse")}
    assert reverse_ids == {"N2", "N6", "N8", "P2", "P7"}
