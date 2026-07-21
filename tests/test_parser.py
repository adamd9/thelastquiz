import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from llm_pop_quiz_bench.core import utils


def test_parse_strict_json_ok():
    txt = '{"choice":"B","reason":"Because it fits."}'
    data = utils.parse_choice_json(txt)
    assert data["choice"] == "B"


def test_parse_with_extra_text():
    txt = 'Sure! Here you go:\n{"choice":"A","reason":"Why not."}\nThanks!'
    data = utils.parse_choice_json(txt)
    assert data["choice"] == "A"


def test_parse_malformed_json_returns_none():
    txt = "No JSON here"
    assert utils.parse_choice_json(txt) is None


def test_salvage_recovers_choice_from_unescaped_quotes():
    # Real failure mode: a valid choice but the reason has unescaped inner
    # quotes, so strict JSON parsing fails.
    txt = '{"choice":"E","reason":"The phrase "Very accurate." implies precision"}'
    assert utils.parse_choice_json(txt) is None
    salvaged = utils.salvage_choice(txt)
    assert salvaged["choice"] == "E"
    assert salvaged["refused"] is False
    assert salvaged["reason"]  # raw text kept as the explanation


def test_salvage_recovers_choice_from_truncated_reply():
    # A reply cut off mid-reason (token cap) still has the choice up front.
    txt = '{"choice": "A", "reason": "I strongly agree because I am designed to'
    salvaged = utils.salvage_choice(txt)
    assert salvaged["choice"] == "A"
    assert salvaged["refused"] is False


def test_salvage_returns_none_without_a_choice():
    # A reasoning model cut off before emitting any choice — nothing to recover.
    assert utils.salvage_choice("Okay, let me think about this question.") is None
    assert utils.salvage_choice("") is None
