import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from llm_pop_quiz_bench.core import dimensional


def _resp(question_id, choice, refused=False):
    return {"question_id": question_id, "choice": choice, "refused": refused}


def test_normalize_expands_likert_into_scale_options():
    quiz = {
        "scoring": {"type": "dimensional", "dimensions": [{"id": "E", "name": "Extraversion"}]},
        "questions": [{"id": "Q1", "type": "likert", "text": "I am outgoing.", "dimension": "E"}],
    }
    normalized = dimensional.normalize_quiz(quiz)
    options = normalized["questions"][0]["options"]
    assert [o["id"] for o in options] == ["A", "B", "C", "D", "E"]
    assert [o["value"] for o in options] == [1, 2, 3, 4, 5]
    # Original quiz is not mutated.
    assert "options" not in quiz["questions"][0]


def test_likert_scoring_with_reverse_key():
    quiz = {
        "scoring": {"type": "dimensional", "dimensions": [{"id": "E", "name": "Extraversion"}]},
        "questions": [
            {"id": "Q1", "type": "likert", "text": "Life of the party.", "dimension": "E"},
            {"id": "Q2", "type": "likert", "text": "Keep in the background.", "dimension": "E", "reverse": True},
        ],
    }
    # Strongly agree with the positive item (E=5) and strongly disagree with the
    # reverse item (A=1 -> reversed to 5) => maximally extraverted.
    result = dimensional.score_dimensional(quiz, [_resp("Q1", "E"), _resp("Q2", "A")])
    assert result.scores["E"].raw == 10
    assert result.scores["E"].normalized == 100.0
    assert result.scores["E"].answered == 2

    # Neutral on both => midpoint.
    mid = dimensional.score_dimensional(quiz, [_resp("Q1", "C"), _resp("Q2", "C")])
    assert mid.scores["E"].normalized == 50.0


def test_bipolar_dimensions_produce_pole_letters_and_type_code():
    quiz = {
        "scoring": {
            "type": "dimensional",
            "dimensions": [
                {"id": "EI", "name": "E-I", "poles": {"low": "I", "high": "E"}},
                {"id": "SN", "name": "S-N", "poles": {"low": "S", "high": "N"}},
            ],
        },
        "questions": [
            {"id": "Q1", "type": "likert", "text": "Energised by people.", "dimension": "EI"},
            {"id": "Q2", "type": "likert", "text": "Prefer concrete facts.", "dimension": "SN"},
        ],
    }
    result = dimensional.score_dimensional(quiz, [_resp("Q1", "E"), _resp("Q2", "A")])
    assert result.scores["EI"].pole == "E"
    assert result.scores["SN"].pole == "S"
    assert result.type_code == "ES"


def test_categorical_contributions_path():
    quiz = {
        "scoring": {
            "type": "dimensional",
            "dimensions": [{"id": "love", "name": "Love"}, {"id": "work", "name": "Work"}],
        },
        "questions": [
            {
                "id": "Q1",
                "type": "choice",
                "text": "Pick one.",
                "options": [
                    {"id": "A", "text": "Romance", "contributions": {"love": 2}},
                    {"id": "B", "text": "Career", "contributions": {"work": 2}},
                ],
            }
        ],
    }
    result = dimensional.score_dimensional(quiz, [_resp("Q1", "A")])
    assert result.scores["love"].normalized == 100.0
    assert result.scores["work"].normalized == 0.0


def test_refused_and_missing_answers_are_skipped():
    quiz = {
        "scoring": {"type": "dimensional", "dimensions": [{"id": "N", "name": "Neuroticism"}]},
        "questions": [
            {"id": "Q1", "type": "likert", "text": "I worry a lot.", "dimension": "N"},
            {"id": "Q2", "type": "likert", "text": "I stay calm.", "dimension": "N", "reverse": True},
        ],
    }
    result = dimensional.score_dimensional(quiz, [_resp("Q1", "", refused=True)])
    assert result.answered == 0
    assert result.scores["N"].answered == 0
    # No contributions -> raw 0 clamps to the floor of the 0-100 range.
    assert result.scores["N"].normalized == 0.0


def test_is_dimensional_detection():
    assert dimensional.is_dimensional({"scoring": {"type": "dimensional"}}) is True
    assert dimensional.is_dimensional({"dimensions": [{"id": "X"}]}) is True
    assert dimensional.is_dimensional({"outcomes": [{"mostly": "A"}]}) is False
