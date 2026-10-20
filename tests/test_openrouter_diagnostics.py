import asyncio

import httpx
import pytest

from llm_pop_quiz_bench.adapters.openrouter_adapter import OpenRouterAdapter


def send_response(message, **choice_fields):
    async def run():
        adapter = OpenRouterAdapter("test/model", "TEST_UNUSED_API_KEY")
        await adapter.client.aclose()
        payload = {
            "id": "response-123",
            "choices": [{"message": message, "finish_reason": "stop", **choice_fields}],
        }
        async with httpx.AsyncClient(
            base_url="https://openrouter.ai/api/v1",
            transport=httpx.MockTransport(lambda request: httpx.Response(200, json=payload)),
        ) as client:
            adapter.client = client
            return await adapter.send([{"role": "user", "content": "Test"}])
    return asyncio.run(run())


def test_provider_refusal_is_preserved_without_reasoning_fallback():
    result = send_response(
        {"content": None, "reasoning": "REPORT_MY_ERROR", "refusal": "Policy restriction"},
        finish_reason="content_filter", native_finish_reason="refusal",
    )
    assert result["text"] == ""
    assert result["refusal"] == "Policy restriction"
    assert result["finish_reason"] == "content_filter"
    assert result["native_finish_reason"] == "refusal"
    assert result["response_id"] == "response-123"


@pytest.mark.parametrize(
    "message,text,source",
    [
        ({"content": "Final answer", "reasoning": "Private reasoning"}, "Final answer", "content"),
        (
            {"content": None, "reasoning": "Unfinished reasoning"},
            "Unfinished reasoning", "reasoning",
        ),
        ({"content": None}, "", "empty"),
    ],
)
def test_response_origin_is_explicit_and_existing_text_behavior_preserved(message, text, source):
    result = send_response(message)
    assert result["text"] == text
    assert result["text_source"] == source


def test_transport_error_keeps_provider_cause(monkeypatch):
    monkeypatch.setattr(
        "llm_pop_quiz_bench.adapters.openrouter_adapter.wait_exponential", lambda **kwargs: 0,
    )

    async def run():
        adapter = OpenRouterAdapter("missing/model", "TEST_UNUSED_API_KEY")
        await adapter.client.aclose()
        calls = []

        def unavailable(request):
            calls.append(request)
            return httpx.Response(404, json={"error": {"message": "No endpoints found"}})

        async with httpx.AsyncClient(
            base_url="https://openrouter.ai/api/v1",
            transport=httpx.MockTransport(unavailable),
        ) as client:
            adapter.client = client
            with pytest.raises(Exception, match="No endpoints found"):
                await adapter.send([{"role": "user", "content": "Test"}])
        assert len(calls) == 3
    asyncio.run(run())
