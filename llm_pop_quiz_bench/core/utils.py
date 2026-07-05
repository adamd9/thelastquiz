import json
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
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        # attempt simple extraction
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            snippet = text[start : end + 1]
            try:
                return json.loads(snippet)
            except json.JSONDecodeError:
                return None
        return None
