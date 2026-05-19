"""
LLM enrichment for PRD workflow agents (Vertex Gemini via LLMGateway).

Hybrid design:
- Rule engine produces deterministic gates (missing docs, scores, hit lists).
- LLM adds reasoning, narratives, and reviewer-facing text.
- When Vertex is unavailable, agents fall back to rules-only (fast path).
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from app.services.llm_gateway import get_llm_gateway

logger = logging.getLogger(__name__)

_SNAPSHOT_MAX_CHARS = 14_000
_last_llm_failure: str | None = None


def get_last_llm_failure() -> str | None:
    return _last_llm_failure


def workflow_llm_agents_enabled() -> bool:
    if os.getenv("WORKFLOW_USE_LLM_AGENTS", "true").strip().lower() in ("0", "false", "no"):
        return False
    gw = get_llm_gateway()
    if not gw.enabled:
        return False
    try:
        gw.resolve_model_id("intake_completeness_check")
        return True
    except RuntimeError:
        return False


def model_name_from_output(output: dict[str, Any]) -> str:
    if output.get("llm_used") and output.get("llm_model"):
        return str(output["llm_model"])
    if output.get("llm_error"):
        return "rules-mvp (llm-failed)"
    return "rules-mvp"


def _compact_json(data: Any) -> str:
    text = json.dumps(data, default=str, ensure_ascii=False)
    if len(text) <= _SNAPSHOT_MAX_CHARS:
        return text
    return text[:_SNAPSHOT_MAX_CHARS] + "\n... [truncated]"


def enrich_with_llm(
    task_kind: str,
    *,
    system_instruction: str,
    snapshot: dict[str, Any],
    baseline: dict[str, Any],
    preserve_keys: list[str],
    user_notes: str = "",
) -> dict[str, Any]:
    """Call Gemini; merge JSON result onto baseline without overwriting preserved keys."""
    merged: dict[str, Any] = {**baseline, "llm_used": False, "source": "rules"}
    if not workflow_llm_agents_enabled():
        return merged

    gw = get_llm_gateway()
    extra = f"\n{user_notes}\n" if user_notes else ""
    user_prompt = (
        "You are a KYC onboarding agent. Analyze the case data and rule baseline below.\n"
        f"{extra}"
        "Return ONE JSON object only.\n\n"
        f"CASE_SNAPSHOT:\n{_compact_json(snapshot)}\n\n"
        f"RULE_BASELINE:\n{_compact_json(baseline)}\n\n"
        f"Do not change these keys from RULE_BASELINE (copy exactly): {preserve_keys}"
    )

    try:
        parsed, raw = gw.generate_json(
            task_kind=task_kind,
            system_instruction=system_instruction,
            user_prompt=user_prompt,
            temperature=0.15,
            max_output_tokens=4096,
        )
        if not isinstance(parsed, dict):
            raise ValueError("llm_response_not_object")

        out = {**baseline, **parsed}
        for key in preserve_keys:
            if key in baseline:
                out[key] = baseline[key]
        out["llm_used"] = True
        out["source"] = "llm+rules"
        out["llm_model"] = raw.model_id
        out["llm_latency_ms"] = round(raw.latency_ms, 1)
        out["llm_task"] = task_kind
        global _last_llm_failure
        _last_llm_failure = None
        return out
    except Exception as exc:
        global _last_llm_failure
        _last_llm_failure = str(exc)
        logger.warning("LLM agent %s failed, using rules only: %s", task_kind, exc)
        merged["llm_error"] = str(exc)
        return merged
