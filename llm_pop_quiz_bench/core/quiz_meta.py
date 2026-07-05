from __future__ import annotations

from typing import Any


def _collect_outcome_rule_types(outcome: dict[str, Any]) -> set[str]:
    rule_types: set[str] = set()
    condition = outcome.get("condition") if isinstance(outcome.get("condition"), dict) else {}

    if "mostly" in outcome or "mostly" in condition:
        rule_types.add("mostly")
    if "mostlyTag" in outcome or "mostlyTag" in condition:
        rule_types.add("mostlyTag")
    if "scoreRange" in outcome or "scoreRange" in condition:
        rule_types.add("scoreRange")

    return rule_types


def _infer_quiz_type(outcomes: list[dict[str, Any]], has_tags: bool, has_scores: bool) -> str:
    for outcome in outcomes:
        condition = outcome.get("condition") if isinstance(outcome.get("condition"), dict) else {}
        if condition.get("mostlyTag") or outcome.get("mostlyTag"):
            return "Tag-based"
        if condition.get("scoreRange") or outcome.get("scoreRange"):
            return "Score-based"
        if condition.get("mostly") or outcome.get("mostly"):
            return "Mostly letter"

    if has_tags:
        return "Tag-based"
    if has_scores:
        return "Score-based"
    return "Mostly letter"


def _affinity_dimensions(quiz_type: str, outcomes: list[dict[str, Any]]) -> int:
    """Count distinct outcome 'dimensions' that choices can map onto.

    Only meaningful for quizzes where answers accumulate toward a small set of
    named outcomes (mostly-letter / tag-based). Quizzes without such a mapping
    (e.g. a per-item "Fuck, Marry, Kill") return 0 and get no affinity visual.
    """
    keys: set[str] = set()
    for outcome in outcomes:
        condition = outcome.get("condition") if isinstance(outcome.get("condition"), dict) else {}
        if quiz_type == "Mostly letter":
            value = condition.get("mostly") or outcome.get("mostly")
        elif quiz_type == "Tag-based":
            value = condition.get("mostlyTag") or outcome.get("mostlyTag")
        else:
            value = None
        if value not in (None, "", []):
            keys.add(str(value).strip().lower())
    return len(keys)


def _classify_hero_visual(quiz_type: str, dimensions: int) -> str:
    """Pick the appropriate results 'hero' visual for this quiz, at parse time.

    - radar: 3+ affinity dimensions (triangle/quad/… spider chart)
    - bars:  exactly 2 dimensions (a radar would be degenerate)
    - none:  everything else (score-based, or no outcome mapping like FMK)
    """
    if quiz_type in ("Mostly letter", "Tag-based"):
        if dimensions >= 3:
            return "radar"
        if dimensions == 2:
            return "bars"
    return "none"


def build_quiz_meta(quiz_def: dict[str, Any]) -> dict[str, Any]:
    questions = quiz_def.get("questions") or []
    outcomes = quiz_def.get("outcomes") or []

    has_tags = False
    has_scores = False
    choice_ids: set[str] = set()
    anonymous_choices = 0

    for question in questions:
        options = question.get("options") or question.get("choices") or []
        for option in options:
            option_id = option.get("id")
            if option_id:
                choice_ids.add(str(option_id))
            else:
                anonymous_choices += 1
            tags = option.get("tags") or []
            if tags:
                has_tags = True
            if isinstance(option.get("score"), (int, float)):
                has_scores = True

    rule_types: set[str] = set()
    for outcome in outcomes:
        rule_types.update(_collect_outcome_rule_types(outcome))

    quiz_type = _infer_quiz_type(outcomes, has_tags, has_scores)
    choice_count = len(choice_ids) + anonymous_choices
    affinity_dimensions = _affinity_dimensions(quiz_type, outcomes)
    hero_visual = _classify_hero_visual(quiz_type, affinity_dimensions)

    return {
        "quiz_type": quiz_type,
        "has_outcomes": bool(outcomes),
        "outcome_count": len(outcomes),
        "outcome_rule_types": sorted(rule_types),
        "choice_count": choice_count,
        "has_tags": has_tags,
        "has_scores": has_scores,
        "affinity_dimensions": affinity_dimensions,
        "hero_visual": hero_visual,
    }
