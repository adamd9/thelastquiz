from __future__ import annotations

import asyncio
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import json

from ..adapters.base import ChatAdapter
from .dimensional import normalize_quiz
from .prompt import PromptContext, render_prompt
from .types import QAResult
from .utils import parse_choice_json, salvage_choice
from .runtime_data import build_runtime_paths, get_runtime_paths
from .logging_utils import rotate_log_if_needed
from .db_factory import connect
from .openrouter import fetch_release_dates, fetch_reasoning_models


def _describe_exception(exc: BaseException) -> str:
    """A never-empty description of an exception. Some exceptions stringify to
    "" (e.g. TimeoutError / CancelledError carry no message), which previously
    left the admin console showing a bare ``Error:`` with nothing after it."""
    return str(exc).strip() or type(exc).__name__


def _extract_actual_error(exception: Exception) -> str:
    """Extract the actual error message from RetryError and other exception
    wrappers, always returning a non-empty, human-readable string."""
    # Handle RetryError from tenacity
    if hasattr(exception, 'last_attempt') and exception.last_attempt:
        if hasattr(exception.last_attempt, 'exception') and exception.last_attempt.exception():
            return _describe_exception(exception.last_attempt.exception())
    
    # Handle other wrapped exceptions
    if getattr(exception, '__cause__', None):
        return _describe_exception(exception.__cause__)
    
    if getattr(exception, '__context__', None):
        return _describe_exception(exception.__context__)
    
    # Fallback to the original exception
    return _describe_exception(exception)


def _summarize_failure_reasons(records: list[dict]) -> str:
    """Condense the per-question failure reasons for an incomplete model into a
    short, human-readable cause (e.g. an out-of-credit 402), so the admin console
    can show *why* a model produced 0/N instead of just the count."""
    from collections import Counter

    reasons = [
        (r.get("reason") or "").strip()
        for r in records
        if r.get("refused") or r.get("choice") in (None, "")
    ]
    reasons = [r for r in reasons if r]
    if not reasons:
        return ""
    counts = Counter(reasons)
    top, _ = counts.most_common(1)[0]
    top = top[:280]
    extra = len(counts) - 1
    if extra > 0:
        return f"{top} (+{extra} other reason{'s' if extra > 1 else ''})"
    return top


def _get_model_params(adapter, reasoning_models: set[str] | None = None) -> dict:
    """Get model parameters, with safe defaults so no request is unbounded.

    Many benchmarked models aren't listed in models.yaml, so their configured
    params are empty. Without a token cap a reasoning model will "think" at
    length about a simple 1-5 Likert item and can take minutes per question, so
    we always bound the response length and temperature.

    Reasoning models (per OpenRouter's ``supported_parameters``) get extra token
    headroom plus a capped thinking budget: a plain 512/2048 cap lets the
    chain-of-thought eat the whole allowance and truncates the JSON answer
    (finish_reason=length), which previously failed the model outright. The
    budget keeps them fast while leaving room to actually answer.
    """
    params = dict(getattr(adapter, "default_params", None) or {})
    params.setdefault("temperature", 0.2)
    model_key = getattr(adapter, "model", None) or getattr(adapter, "id", "")
    is_reasoning = bool(reasoning_models) and (
        model_key in reasoning_models or getattr(adapter, "id", "") in reasoning_models
    )
    if "max_tokens" not in params:
        params["max_tokens"] = 3000 if is_reasoning else 2048
    if is_reasoning:
        # Bound the thinking so a 1-5 item still returns within the per-question
        # timeout, while leaving the rest of max_tokens for the JSON answer.
        params.setdefault("reasoning", {"max_tokens": 1500})
    return params



def _append_log(path: Path, message: str) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    line = f"[{timestamp}] {message}"
    path.parent.mkdir(parents=True, exist_ok=True)
    rotate_log_if_needed(path)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(f"{line}\n")
    print(line)


def _touch_liveness(path: Path) -> None:
    """Bump the run log's mtime without writing a line.

    The stale-run watchdog treats the log's last-modified time as a liveness
    signal. Successful questions emit no log line, so a model slowly working
    through many questions would otherwise look "stuck" and be failed by
    mistake — especially when several runs are launched at once.
    """
    try:
        os.utime(path, None)
    except OSError:
        pass


# A single Likert / multiple-choice answer should come back in seconds. A request
# that runs past this cap is stuck or the provider is degraded rather than
# "thinking", so we abandon it and retry on a fresh connection instead of waiting
# longer. Worst case per question is QUESTION_ATTEMPTS * QUESTION_TIMEOUT_S, which
# stays well under the stale-run watchdog window.
QUESTION_TIMEOUT_S = 40
QUESTION_ATTEMPTS = 3  # 1 initial attempt + 2 retries
QUESTION_RETRY_BACKOFF_S = 1.5


async def _send_with_retries(adapter, messages, params, log_path: Path, idx: int) -> dict:
    """Send one question, retrying only on timeout. A wait past QUESTION_TIMEOUT_S
    means the request is stuck or the provider is degraded rather than slow, so we
    abandon it and try again on a fresh connection instead of waiting longer. The
    final timeout propagates once every attempt is exhausted; non-timeout errors
    are not retried (a retry wouldn't clear a real fault like an auth/credit error)."""
    for attempt in range(1, QUESTION_ATTEMPTS + 1):
        try:
            return await asyncio.wait_for(
                adapter.send(messages, params=params), timeout=QUESTION_TIMEOUT_S
            )
        except TimeoutError:
            if attempt >= QUESTION_ATTEMPTS:
                raise
            _append_log(
                log_path,
                f"Question {idx} for {adapter.id} timed out after {QUESTION_TIMEOUT_S}s "
                f"(attempt {attempt}/{QUESTION_ATTEMPTS}) \u2014 retrying on a fresh request.",
            )
            await asyncio.sleep(QUESTION_RETRY_BACKOFF_S)


async def run_quiz(
    quiz_path: Path, adapters: list[ChatAdapter], run_id: str, runtime_dir: Path | None = None
) -> None:
    if quiz_path.suffix.lower() in {".yaml", ".yml"}:
        raise ValueError("Legacy YAML quizzes are no longer supported. Use a JSON quiz file.")
    quiz_json = quiz_path.read_text(encoding="utf-8")
    quiz = json.loads(quiz_json)

    # Expand Likert (statement) items into concrete scale-point options so the
    # text runner can administer dimensional benchmarks unchanged.
    questions = normalize_quiz(quiz)["questions"]

    successful_adapters = []
    failed_adapters = []

    runtime_paths = get_runtime_paths() if runtime_dir is None else build_runtime_paths(runtime_dir)

    log_path = runtime_paths.logs_dir / f"{run_id}.log"
    db = connect(runtime_paths.db_path)
    db.upsert_quiz(quiz, quiz_json)
    model_ids = [adapter.id for adapter in adapters]
    # Record each model's release date (live from OpenRouter's index) with the
    # run, so the rankings can plot scores over time without a later lookup.
    try:
        released = fetch_release_dates(model_ids)
    except Exception:
        released = {}
    # Which of these models "think" before answering (OpenRouter metadata), so
    # the per-question params can give them a reasoning budget + token headroom
    # instead of truncating their JSON answer. Best-effort: empty on failure.
    try:
        reasoning_models = fetch_reasoning_models()
    except Exception:
        reasoning_models = set()
    # Merge into any settings the caller already stored on the run (e.g. the
    # API records ``public``/``benchmark_id``/``rep`` at queue time). Re-inserting
    # with only ``model_released`` here would clobber those and, for example,
    # drop the ``public`` flag that keeps app runs out of the official rankings.
    existing_run = db.fetch_run(run_id)
    run_settings = dict((existing_run or {}).get("settings") or {})
    run_settings["model_released"] = released
    db.insert_run(run_id=run_id,
        quiz_id=quiz["id"],
        status="running",
        models=model_ids,
        settings=run_settings,
    )
    _append_log(log_path, f"Run {run_id} started for quiz {quiz['id']}.")
    
    # Models run concurrently — each still answers its own questions in order
    # (one in-flight request per model), which keeps us gentle on rate limits
    # while cutting wall-clock time roughly by the number of models. The
    # semaphore caps how many run at once for larger custom selections.
    sem = asyncio.Semaphore(6)

    # Live progress for the admin console: bumped as each model finishes so an
    # in-flight run reports "X/N models" instead of an opaque "running".
    progress = {"done": 0}

    async def run_one_model(adapter):
        async with sem:
            try:
                _append_log(log_path, f"Testing model: {adapter.id}")
                model_records: list[dict] = []
                recovered = 0
                for idx, q in enumerate(questions, start=1):
                    try:
                        ctx = PromptContext(
                            quiz_title=quiz["title"],
                            q_num=idx,
                            q_total=len(questions),
                            question_text=q["text"],
                            options=[opt["text"] for opt in q["options"]],
                        )
                        prompt = render_prompt(ctx)
                        messages = [{"role": "user", "content": prompt}]
                        params = _get_model_params(adapter, reasoning_models)
                        start = time.perf_counter()
                        resp = await _send_with_retries(adapter, messages, params, log_path, idx)
                        latency_ms = int((time.perf_counter() - start) * 1000)
                        raw_text = resp.get("text") if isinstance(resp, dict) else None
                        finish_reason = resp.get("finish_reason") if isinstance(resp, dict) else None
                        data = parse_choice_json(raw_text)
                        if not data:
                            # Strict JSON failed. Before giving up, try to salvage
                            # the model's actual pick: a valid choice with a
                            # malformed/truncated *reason* (e.g. unescaped quotes)
                            # is still a real answer — we keep the choice and dump
                            # the raw text as the reason rather than discarding it.
                            data = salvage_choice(raw_text)
                            if data:
                                recovered += 1
                                _append_log(
                                    log_path,
                                    f"Question {idx} for {adapter.id}: recovered "
                                    f"choice '{data['choice']}' from unparseable "
                                    f"JSON (kept raw text as reason).",
                                )
                        if not data:
                            # No choice to recover. Say *why* so it's debuggable:
                            # a length cutoff (token cap too low), a truly empty
                            # reply, or an actual plain-text refusal we keep verbatim.
                            refusal_text = (raw_text or "").strip()
                            if finish_reason == "length":
                                reason = (
                                    "Answer cut off before it finished (finish_reason=length) — "
                                    "the reply hit the token cap. Raise max_tokens for this model."
                                )
                            elif not refusal_text:
                                reason = (
                                    "The model returned an empty response"
                                    + (f" (finish_reason={finish_reason})" if finish_reason else "")
                                    + "."
                                )
                            else:
                                reason = refusal_text
                            data = {
                                "choice": "",
                                "reason": reason,
                                "additional_thoughts": "",
                                "refused": True,
                            }
                        model_records.append(QAResult(
                            question_id=q["id"],
                            choice=data.get("choice", ""),
                            reason=data.get("reason", ""),
                            additional_thoughts=data.get("additional_thoughts", ""),
                            refused=data.get("refused", False),
                            latency_ms=latency_ms,
                            tokens_in=resp.get("tokens_in"),
                            tokens_out=resp.get("tokens_out"),
                        ).__dict__)
                    except Exception as e:
                        if isinstance(e, (asyncio.TimeoutError, TimeoutError)):
                            actual_error = (
                                f"No response after {QUESTION_ATTEMPTS} attempts "
                                f"({QUESTION_TIMEOUT_S}s each) \u2014 the request kept timing out"
                            )
                        else:
                            actual_error = _extract_actual_error(e)
                        _append_log(
                            log_path,
                            f"Question {idx} failed for {adapter.id}: {actual_error[:280]}",
                        )
                        model_records.append(QAResult(
                            question_id=q["id"],
                            choice="",
                            reason=f"Error: {actual_error[:280]}",
                            additional_thoughts="",
                            refused=True,
                            latency_ms=0,
                            tokens_in=0,
                            tokens_out=0,
                        ).__dict__)
                    finally:
                        # Keep the run's liveness fresh so the stale-run watchdog
                        # (which reads log mtime) never fails an active run.
                        _touch_liveness(log_path)
                db.insert_results(run_id, quiz["id"], adapter.id, model_records)
                # A model is either fully in or fully out: a run is only valid
                # for a model if it produced a real answer to EVERY question.
                # Timeouts, unparseable replies and out-of-credit errors leave
                # items with an empty choice (refused=True); such a model failed
                # to produce a full result and must be surfaced as failed rather
                # than quietly "completed" — its partial data is excluded from
                # the rankings.
                answered = sum(
                    1
                    for r in model_records
                    if not r.get("refused") and (r.get("choice") not in (None, ""))
                )
                total = len(questions)
                if answered < total:
                    missing = total - answered
                    cause = _summarize_failure_reasons(model_records)
                    detail = f" — {cause}" if cause else ""
                    _append_log(
                        log_path,
                        f"Model {adapter.id} produced an incomplete result: "
                        f"answered {answered}/{total} ({missing} missing). "
                        f"Marking as failed.{(' Cause: ' + cause) if cause else ''}",
                    )
                    return (
                        adapter,
                        f"Incomplete result: answered {answered}/{total} questions{detail}",
                        None,
                    )
                if recovered:
                    # Every question has a real choice, but some had to be
                    # recovered from malformed/truncated JSON — the model is
                    # complete and counts for scoring, but flag it so the run
                    # shows it finished "with errors" (raw text kept as reason).
                    warning = (
                        f"Completed with errors: recovered {recovered} of {total} "
                        f"answer{'s' if recovered != 1 else ''} from malformed JSON "
                        f"(raw response kept as the explanation)."
                    )
                    _append_log(log_path, f"Model {adapter.id} {warning}")
                    return (adapter, None, warning)
                _append_log(log_path, f"Model {adapter.id} completed successfully")
                return (adapter, None, None)
            except Exception as e:
                actual_error = _extract_actual_error(e)
                _append_log(log_path, f"Model {adapter.id} failed completely: {actual_error}")
                return (adapter, actual_error, None)
            finally:
                # Best-effort live progress: bump the finished-model count so the
                # admin can see how far along a run is. A settings-write hiccup
                # must never stall or fail the run.
                progress["done"] += 1
                try:
                    rec = db.fetch_run(run_id)
                    s = dict((rec or {}).get("settings") or {})
                    s["models_done"] = progress["done"]
                    s["models_total"] = len(adapters)
                    db.update_run_settings(run_id, s)
                except Exception:
                    pass

    results = await asyncio.gather(*(run_one_model(a) for a in adapters))
    # Warnings map a successful model -> a "completed with errors" note (e.g.
    # answers recovered from malformed JSON), so the summary can flag it.
    warnings: dict[str, str] = {}
    for adapter, error, warning in results:
        if error is None:
            successful_adapters.append(adapter)
            if warning:
                warnings[adapter.id] = warning
        else:
            failed_adapters.append((adapter.id, error))

    # Print summary of model results
    _append_log(log_path, "=" * 60)
    _append_log(log_path, "BENCHMARK SUMMARY")
    _append_log(log_path, "=" * 60)
    
    if successful_adapters:
        _append_log(log_path, f"Successful models ({len(successful_adapters)}):")
        for adapter in successful_adapters:
            suffix = f" (with errors: {warnings[adapter.id]})" if adapter.id in warnings else ""
            _append_log(log_path, f" - {adapter.id}{suffix}")
    
    if failed_adapters:
        _append_log(log_path, f"Failed models ({len(failed_adapters)}):")
        for model_id, error in failed_adapters:
            _append_log(log_path, f" - {model_id}: {error[:80]}...")
    
    if not successful_adapters:
        _append_log(log_path, "WARNING: No models completed successfully!")
        _append_log(log_path, "Check your API keys and model access permissions.")
    else:
        _append_log(log_path, f"Results saved for {len(successful_adapters)} working model(s)")
    
    _append_log(log_path, "=" * 60)
    _append_log(log_path, "Run complete. Waiting on reports if enabled.")

    # Persist a per-model status summary onto the run so the admin console can
    # show which models produced results and *why* the rest did not, without
    # anyone having to open the raw log file.
    model_status = [
        {
            "model": adapter.id,
            "status": "completed_with_errors" if adapter.id in warnings else "completed",
            "error": warnings.get(adapter.id),
        }
        for adapter in successful_adapters
    ]
    model_status += [
        {"model": model_id, "status": "failed", "error": error}
        for model_id, error in failed_adapters
    ]
    # Persisting the summary must never block the run from being marked done —
    # a hiccup here previously left runs stuck showing "running" forever.
    try:
        run_record = db.fetch_run(run_id)
        settings = dict((run_record or {}).get("settings") or {})
        settings["model_status"] = model_status
        settings["models_total"] = len(adapters)
        settings["models_done"] = len(adapters)
        settings["models_completed"] = len(successful_adapters)
        settings["models_failed"] = len(failed_adapters)
        db.update_run_settings(run_id, settings)
    except Exception as exc:
        _append_log(log_path, f"Warning: could not persist model-status summary: {exc}")

    db.update_run_status(run_id, "completed")
    db.close()


def run_sync(*args, **kwargs) -> None:
    asyncio.run(run_quiz(*args, **kwargs))
