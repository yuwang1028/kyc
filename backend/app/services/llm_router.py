"""
Lite-tier LLM router: maps free-form user/system description to a registered task_kind.

Downstream callers should use the returned `task_kind` with `LLMGateway.generate` / `/llm/complete`.
Falls back to keyword heuristics when Vertex is off or the model errors.
"""

from __future__ import annotations

import logging
from typing import Any

from app.config import settings
from app.services.llm_gateway import get_llm_gateway
from app.services.llm_tasks import TASK_TO_TIER, tier_for_task

logger = logging.getLogger(__name__)

ROUTER_TASK_KIND = "llm_task_router"


def routable_task_kinds() -> list[str]:
    """All task kinds the router may emit (excludes the router itself)."""
    return sorted(k for k in TASK_TO_TIER if k != ROUTER_TASK_KIND)


def _validate_task_kind(value: str | None) -> str | None:
    if not value or not isinstance(value, str):
        return None
    key = value.strip()
    if key == ROUTER_TASK_KIND or key not in TASK_TO_TIER:
        return None
    return key


def _route_with_rules(description: str) -> dict[str, Any]:
    text = description.lower()

    def hit(*words: str) -> bool:
        return any(w in text for w in words)

    if hit("adverse", "negative news", "media hit"):
        task = "long_adverse_media_brief"
    elif hit("compliance memo", "regulatory memo", "external memo", "formal compliance"):
        task = "high_risk_compliance_memo"
    elif hit("ubo", "beneficial owner", "equity holder", "shareholder", "ownership chart", "control person"):
        task = "ownership_structure_explain"
    elif hit("sanction", "pep", "watchlist", "screening hit", "screening match", "sanctions list"):
        task = "screening_hit_synthesis"
    elif hit("cross-check", "cross check", "inconsistent", "contradiction", "multi doc", "multiple documents"):
        task = "multi_document_cross_check"
    elif hit("disambiguat", "disambiguation", "false positive", "mis-hit"):
        task = "screening_disambiguation"
    elif hit("edd", "risk narrative", "risk explanation", "complex risk"):
        task = "complex_risk_narrative"
    elif hit("ocr", "normalize field", "field normalization"):
        task = "ocr_field_normalization"
    elif hit("missing doc", "missing document", "follow-up docs", "incomplete file pack"):
        task = "missing_docs_detection"
    elif hit("intake", "completeness", "required fields check", "onboarding checklist"):
        task = "intake_completeness_check"
    elif hit("reviewer note", "analyst note", "draft note"):
        task = "reviewer_notes_draft"
    elif hit("form", "merge fields", "consolidate fields"):
        task = "form_consolidation"
    elif hit("tool routing", "orchestration", "which tool next", "which endpoint next"):
        task = "agent_tool_routing"
    else:
        task = "simple_case_summary"

    tier = tier_for_task(task)
    return {
        "task_kind": task,
        "resolved_tier": tier.value,
        "confidence": 0.55,
        "rationale": "Keyword router fallback (Vertex unavailable or invalid LLM output).",
        "source": "rules",
    }


def route_description(
    description: str,
    *,
    extra_context: str | None = None,
) -> dict[str, Any]:
    """
    Returns:
      task_kind, resolved_tier, confidence, rationale, source ('llm'|'rules'),
      and optional model_id / latency_ms when source is llm.
    """
    desc = (description or "").strip()
    if not desc:
        out = _route_with_rules("")
        out["rationale"] = "Empty description; defaulted."
        return out

    gw = get_llm_gateway()
    if not gw.enabled or not settings.vertex_model_lite:
        return _route_with_rules(desc)

    allowed = routable_task_kinds()
    allowed_block = "\n".join(f"- {k}" for k in allowed)
    system = (
        "You route KYC/AML workloads to exactly one downstream task_kind. "
        "The downstream task controls model cost (lite/flash/pro). "
        "Output JSON only with keys: task_kind (string), confidence (number 0-1), rationale (string). "
        "task_kind MUST be one of the allowed values, verbatim."
    )
    user = f"Allowed task_kind values:\n{allowed_block}\n\n"
    if extra_context:
        user += f"Additional context:\n{extra_context}\n\n"
    user += f"User/system description:\n---\n{desc}\n---\n\nPick the single best task_kind."

    try:
        parsed, raw = gw.generate_json(
            task_kind=ROUTER_TASK_KIND,
            user_prompt=user,
            system_instruction=system,
            temperature=0.1,
            max_output_tokens=512,
        )
    except Exception as e:
        logger.warning("LLM router failed, using rules: %s", e)
        return _route_with_rules(desc)

    task = _validate_task_kind(parsed.get("task_kind"))
    if not task:
        logger.warning("LLM router returned invalid task_kind: %s", parsed.get("task_kind"))
        return _route_with_rules(desc)

    conf = parsed.get("confidence")
    try:
        confidence = float(conf) if conf is not None else 0.75
    except (TypeError, ValueError):
        confidence = 0.75
    confidence = max(0.0, min(1.0, confidence))

    rationale = parsed.get("rationale")
    if not isinstance(rationale, str):
        rationale = "Selected by LLM task router."

    tier = tier_for_task(task)
    return {
        "task_kind": task,
        "resolved_tier": tier.value,
        "confidence": confidence,
        "rationale": rationale.strip(),
        "source": "llm",
        "model_id": raw.model_id,
        "latency_ms": round(raw.latency_ms, 2),
    }
