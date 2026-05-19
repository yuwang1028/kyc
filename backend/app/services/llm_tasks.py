"""
Maps logical task kinds to model tiers for cost/latency control.

Tier policy (align with Vertex pricing / capability):
- lite:  cheapest path — intake, missing docs, light summarization, routing hints
- flash: stronger reasoning — screening synthesis, ownership explanation, cross-doc checks
- pro:    rare / high-stakes — long memos, complex UBO, heavy adverse-media narratives
"""

from enum import Enum


class ModelTier(str, Enum):
    LITE = "lite"
    FLASH = "flash"
    PRO = "pro"


# First column = default tier for that task (override via gateway if needed)
TASK_TO_TIER: dict[str, ModelTier] = {
    # Tier 1 — Lite (router itself always uses Lite in the gateway)
    "llm_task_router": ModelTier.LITE,
    # Tier 1 — Lite
    "intake_completeness_check": ModelTier.LITE,
    "missing_docs_detection": ModelTier.LITE,
    "ocr_field_normalization": ModelTier.LITE,
    "document_pdf_ocr": ModelTier.FLASH,
    "simple_case_summary": ModelTier.LITE,
    "reviewer_notes_draft": ModelTier.LITE,
    "agent_tool_routing": ModelTier.LITE,
    "form_consolidation": ModelTier.LITE,
    # Tier 2 — Flash (multi-step tool use)
    "kyc_agent_loop": ModelTier.FLASH,
    # Tier 2 — Flash
    "screening_hit_synthesis": ModelTier.FLASH,
    "screening_disambiguation": ModelTier.FLASH,
    "ownership_structure_explain": ModelTier.FLASH,
    "multi_document_cross_check": ModelTier.FLASH,
    "complex_risk_narrative": ModelTier.FLASH,
    # Tier 3 — Pro
    "high_risk_compliance_memo": ModelTier.PRO,
    "complex_ubo_analysis": ModelTier.PRO,
    "long_adverse_media_brief": ModelTier.PRO,
}


def tier_for_task(task_kind: str) -> ModelTier:
    return TASK_TO_TIER.get(task_kind, ModelTier.LITE)
