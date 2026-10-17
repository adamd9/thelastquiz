import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient


def _client(monkeypatch, tmp_path):
    monkeypatch.setenv("LLM_POP_QUIZ_ENV", "mock")
    monkeypatch.setenv("LLM_POP_QUIZ_RUNTIME_DIR", str(tmp_path))
    from llm_pop_quiz_bench.api.app import app

    return TestClient(app)


def test_public_pages_and_rankings(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    rankings = client.get("/rankings")
    assert rankings.status_code == 200
    # The rankings page is client-rendered, so assert on stable shell markers
    # rather than a heading that now lives in JS.
    assert "AI Personality Benchmark" in rankings.text
    assert "rankings.js" in rankings.text

    assert client.get("/admin").status_code == 200

    data = client.get("/api/rankings").json()
    ids = {b["id"] for b in data["benchmarks"]}
    assert {"big_five_ipip50", "mbti_oejts", "sd3_short_dark_triad"} <= ids


def test_deception_page_keeps_timeline_separate_from_table(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    page = client.get("/ai-deception-rankings")
    assert page.status_code == 200
    assert "Deception over time" in page.text
    assert '<div class="dt-breakout">' in page.text
    assert 'id="dtime"' in page.text
    assert 'id="dboard-overall"' in page.text

    script = client.get("/static/deception.js")
    assert script.status_code == 200
    assert "function renderTimeline(host, models)" in script.text
    assert "if (timeEl) renderTimeline(timeEl, models);" in script.text


def test_homepage_uses_shared_deception_summary():
    web = pathlib.Path(__file__).resolve().parents[1] / "web"
    page = (web / "home.html").read_text()
    full_page = (web / "ai-deception-rankings.html").read_text()

    assert 'id="dscale-overall"' in page
    assert 'id="dboard-overall"' in page
    assert 'id="home-deception-group"' in page
    assert "Humanity's Last Exam lineup" in page
    for asset in ("/static/deception.js?v=9", "/static/deception-summary.css?v=1"):
        assert asset in page
        assert asset in full_page
    for detail_id in ("dtime", "dexps", "ddims", "dfilter"):
        assert f'id="{detail_id}"' not in page
        assert f'id="{detail_id}"' in full_page
    assert "HUMAN_IDX" not in page
    assert 'fetch("/rankings.json")' not in page
    assert 'href="/ai-deception-rankings"' in page
    assert 'href="/rankings#dark-triad"' in page


def test_admin_requires_token_when_configured(monkeypatch, tmp_path):
    monkeypatch.setenv("LLM_POP_QUIZ_ADMIN_TOKEN", "secret")
    client = _client(monkeypatch, tmp_path)

    assert client.get("/api/admin/benchmarks").status_code == 403
    ok = client.get("/api/admin/benchmarks", headers={"X-Admin-Token": "secret"})
    assert ok.status_code == 200
    assert len(ok.json()["benchmarks"]) == 3
