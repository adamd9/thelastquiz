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
