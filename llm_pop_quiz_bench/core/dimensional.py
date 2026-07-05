"""Multi-dimensional (subscale) scoring for personality benchmarks.

This module adds a deterministic scoring path for quizzes whose answers map onto
several independent named *dimensions* rather than a single aggregate outcome.
It powers the personality-benchmark tests:

- **Likert dimensional** (e.g. Big Five / IPIP-50, MBTI / OEJTS): each statement
  item is rated on a shared agreement scale and contributes to exactly one
  dimension. Items may be reverse-keyed.
- **Categorical dimensional** (e.g. Kokology-style): each answer option carries
  explicit ``contributions`` to one or more dimensions.

A quiz opts in with a top-level ``scoring`` block::

    scoring:
      type: dimensional
      scale: {min: 1, max: 5, labels: [Strongly disagree, ..., Strongly agree]}
      dimensions:
        - {id: O, name: Openness}
        - {id: EI, name: "Extraversion \u2013 Introversion", poles: {low: I, high: E}}

Likert questions are authored compactly and expanded into concrete options by
:func:`normalize_quiz` so the existing text runner can administer them unchanged::

    {id: Q1, type: likert, text: "I am the life of the party.", dimension: E}
    {id: Q2, type: likert, text: "I keep in the background.", dimension: E, reverse: true}
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Default 5-point agreement scale used by Likert items when the quiz does not
# specify its own scale.
DEFAULT_LIKERT_SCALE: dict[str, Any] = {
    "min": 1,
    "max": 5,
    "labels": [
        "Strongly disagree",
        "Disagree",
        "Neutral",
        "Agree",
        "Strongly agree",
    ],
}

_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def is_dimensional(quiz_def: dict[str, Any]) -> bool:
    """Return True if the quiz uses multi-dimensional (subscale) scoring."""
    if not isinstance(quiz_def, dict):
        return False
    scoring = quiz_def.get("scoring")
    if isinstance(scoring, dict) and scoring.get("type") == "dimensional":
        return True
    return bool(quiz_def.get("dimensions"))


def get_dimensions(quiz_def: dict[str, Any]) -> list[dict[str, Any]]:
    """Return the ordered list of dimension definitions for the quiz."""
    scoring = quiz_def.get("scoring") or {}
    dims = scoring.get("dimensions") or quiz_def.get("dimensions") or []
    return [d for d in dims if isinstance(d, dict) and d.get("id")]


def get_scale(quiz_def: dict[str, Any]) -> dict[str, Any]:
    """Return the Likert scale for the quiz, falling back to the default."""
    scoring = quiz_def.get("scoring") or {}
    scale = scoring.get("scale")
    if not isinstance(scale, dict):
        return dict(DEFAULT_LIKERT_SCALE)
    labels = scale.get("labels") or DEFAULT_LIKERT_SCALE["labels"]
    minimum = scale.get("min", 1)
    maximum = scale.get("max", len(labels))
    return {"min": minimum, "max": maximum, "labels": list(labels)}


def normalize_quiz(quiz_def: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of ``quiz_def`` with Likert items expanded to options.

    Likert questions are authored without explicit options; this expands each
    into concrete scale-point options (``A`` = lowest .. highest) so the text
    runner can present them like any other multiple-choice question. Existing
    choice questions pass through untouched. The operation is idempotent and
    never mutates the input.
    """
    scale = get_scale(quiz_def)
    labels: list[str] = scale["labels"]
    minimum: int = scale["min"]

    normalized_questions: list[dict[str, Any]] = []
    for question in quiz_def.get("questions", []) or []:
        if question.get("type") == "likert" and not question.get("options"):
            options = [
                {"id": _LETTERS[i], "text": label, "value": minimum + i}
                for i, label in enumerate(labels)
            ]
            normalized_questions.append({**question, "options": options})
        else:
            normalized_questions.append(question)

    return {**quiz_def, "questions": normalized_questions}


def _option_contributions(option: dict[str, Any]) -> dict[str, float]:
    """Extract this option's dimension contributions.

    Supports three authoring shapes:
    - ``contributions: {DimA: 2, DimB: -1}``
    - ``dimension: X`` with optional ``weight`` (defaults to 1.0)
    - legacy ``tags`` are ignored here (handled by the classic tag scorer).
    """
    contributions = option.get("contributions")
    if isinstance(contributions, dict):
        result: dict[str, float] = {}
        for key, value in contributions.items():
            try:
                result[str(key)] = float(value)
            except (TypeError, ValueError):
                continue
        return result

    dimension = option.get("dimension")
    if dimension:
        weight = option.get("weight", 1.0)
        try:
            return {str(dimension): float(weight)}
        except (TypeError, ValueError):
            return {str(dimension): 1.0}

    return {}


@dataclass
class DimensionScore:
    """Score for a single dimension."""

    id: str
    name: str
    raw: float
    normalized: float  # 0..100, comparable across dimensions/models
    answered: int = 0
    pole: str | None = None  # chosen pole letter for bipolar dimensions


@dataclass
class DimensionalResult:
    """Full multi-dimensional scoring result for one respondent (model)."""

    scores: dict[str, DimensionScore] = field(default_factory=dict)
    type_code: str | None = None  # e.g. "INTJ" for bipolar (MBTI-style) quizzes
    answered: int = 0
    total_questions: int = 0

    @property
    def profile(self) -> dict[str, float]:
        """Map of dimension id -> normalized 0..100 score (radar-ready)."""
        return {dim_id: s.normalized for dim_id, s in self.scores.items()}


def _bounds_for_question(
    question: dict[str, Any],
    scale: dict[str, Any],
) -> dict[str, tuple[float, float]]:
    """Return per-dimension (min, max) possible contribution for one question."""
    bounds: dict[str, tuple[float, float]] = {}
    if question.get("type") == "likert":
        dimension = question.get("dimension")
        if dimension:
            bounds[str(dimension)] = (float(scale["min"]), float(scale["max"]))
        return bounds

    # Choice question: a dimension gets 0 if an option without it is chosen, so
    # the achievable range spans 0 and the extreme option contributions.
    per_dim: dict[str, list[float]] = {}
    for option in question.get("options", []) or []:
        for dim, weight in _option_contributions(option).items():
            per_dim.setdefault(dim, []).append(weight)
    for dim, weights in per_dim.items():
        bounds[dim] = (min(0.0, *weights), max(0.0, *weights))
    return bounds


def score_dimensional(
    quiz_def: dict[str, Any],
    responses: list[dict[str, Any]],
) -> DimensionalResult:
    """Score a set of model responses against a dimensional quiz.

    ``responses`` is a list of dicts with at least ``question_id`` and
    ``choice`` (the chosen option id, e.g. ``"A"``). Unanswered/refused items
    are simply skipped. Scores are normalized to 0..100 per dimension using the
    theoretical min/max achievable for the items actually present, so different
    dimensions and models are directly comparable on a radar chart.
    """
    normalized_quiz = normalize_quiz(quiz_def)
    scale = get_scale(quiz_def)
    minimum, maximum = float(scale["min"]), float(scale["max"])
    dimensions = get_dimensions(quiz_def)
    dim_ids = [d["id"] for d in dimensions]
    dim_names = {d["id"]: d.get("name", d["id"]) for d in dimensions}
    dim_poles = {d["id"]: d.get("poles") for d in dimensions}

    raw: dict[str, float] = {dim_id: 0.0 for dim_id in dim_ids}
    answered: dict[str, int] = {dim_id: 0 for dim_id in dim_ids}
    min_total: dict[str, float] = {dim_id: 0.0 for dim_id in dim_ids}
    max_total: dict[str, float] = {dim_id: 0.0 for dim_id in dim_ids}

    responses_by_qid = {
        str(r.get("question_id")): r for r in responses if r.get("question_id") is not None
    }

    total_answered = 0
    for question in normalized_quiz.get("questions", []) or []:
        qid = str(question.get("id"))

        # Accumulate achievable bounds for every question (answered or not),
        # so normalization reflects the full instrument.
        for dim, (low, high) in _bounds_for_question(question, scale).items():
            if dim in min_total:
                min_total[dim] += low
                max_total[dim] += high

        response = responses_by_qid.get(qid)
        if not response:
            continue
        if response.get("refused"):
            continue
        choice = response.get("choice")
        if choice in (None, ""):
            continue
        option = next(
            (o for o in question.get("options", []) or [] if str(o.get("id")) == str(choice)),
            None,
        )
        if option is None:
            continue

        total_answered += 1
        if question.get("type") == "likert":
            dimension = question.get("dimension")
            if dimension not in raw:
                continue
            value = option.get("value")
            if value is None:
                continue
            value = float(value)
            if question.get("reverse"):
                value = minimum + maximum - value
            raw[dimension] += value
            answered[dimension] += 1
        else:
            for dim, weight in _option_contributions(option).items():
                if dim in raw:
                    raw[dim] += weight
                    answered[dim] += 1

    scores: dict[str, DimensionScore] = {}
    type_letters: list[str] = []
    for dim in dimensions:
        dim_id = dim["id"]
        span = max_total[dim_id] - min_total[dim_id]
        if span > 0:
            normalized = (raw[dim_id] - min_total[dim_id]) / span * 100.0
        else:
            normalized = 0.0
        normalized = max(0.0, min(100.0, normalized))

        pole = None
        poles = dim_poles.get(dim_id)
        if isinstance(poles, dict) and poles.get("low") and poles.get("high"):
            pole = poles["high"] if normalized >= 50.0 else poles["low"]
            type_letters.append(pole)

        scores[dim_id] = DimensionScore(
            id=dim_id,
            name=dim_names[dim_id],
            raw=round(raw[dim_id], 4),
            normalized=round(normalized, 2),
            answered=answered[dim_id],
            pole=pole,
        )

    total_questions = len(normalized_quiz.get("questions", []) or [])
    type_code = "".join(type_letters) if len(type_letters) == len(dimensions) and type_letters else None

    return DimensionalResult(
        scores=scores,
        type_code=type_code,
        answered=total_answered,
        total_questions=total_questions,
    )
