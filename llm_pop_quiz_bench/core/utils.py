import json
import re
from typing import Any, Union


def parse_choice_json(text: str) -> Union[dict[str, Any], None]:
    """Parse the model response for choice JSON.

    Returns None when the text is missing or not valid JSON (e.g. the model
    replied with a plain-text refusal instead of the requested JSON). Callers
    should treat a None result as "no structured answer" and preserve the raw
    text as the model's explanation.
    """
    if not isinstance(text, str) or not text.strip():
        return None
    stripped = text.strip()
    # Many models wrap the JSON in a markdown code fence (```json ... ```).
    # Strip it before parsing so a perfectly good answer isn't treated as a refusal.
    if stripped.startswith("```"):
        stripped = re.sub(r"^```[a-zA-Z0-9]*\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped).strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        # attempt simple extraction
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start != -1 and end != -1:
            snippet = stripped[start : end + 1]
            try:
                return json.loads(snippet)
            except json.JSONDecodeError:
                return None
        return None


_CHOICE_QUOTED_RE = re.compile(r'"choice"\s*:\s*"([^"\\]{1,64})"', re.IGNORECASE)
_CHOICE_BARE_RE = re.compile(r'"choice"\s*:\s*([A-Za-z0-9]{1,64})', re.IGNORECASE)

# Cap the salvaged reason so a truncated reasoning model (which can emit a huge
# blob of "thinking" before the JSON) doesn't bloat the results row.
_SALVAGE_REASON_MAX = 2000


def salvage_choice(text: str) -> dict[str, Any] | None:
    """Best-effort recovery of a ``choice`` from a reply whose JSON couldn't be
    parsed by :func:`parse_choice_json` — e.g. unescaped quotes inside the
    ``reason`` string, or a reply truncated at the token cap.

    When a choice token can be located we keep the model's actual pick instead of
    discarding the whole answer; the (possibly malformed) raw text is preserved
    verbatim as the reason so nothing is lost. Returns ``None`` when no choice can
    be found — the caller should then treat the item as a genuine non-answer.
    """
    if not isinstance(text, str) or not text.strip():
        return None
    match = _CHOICE_QUOTED_RE.search(text) or _CHOICE_BARE_RE.search(text)
    if not match:
        return None
    choice = match.group(1).strip()
    if not choice:
        return None
    return {
        "choice": choice,
        "reason": text.strip()[:_SALVAGE_REASON_MAX],
        "additional_thoughts": "",
        "refused": False,
    }
