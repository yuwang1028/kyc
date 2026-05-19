"""
KYC case tools for the agent loop: Gemini function declarations + server-side execution.

The agent loop does not change when adding tools: extend TOOL_DECLARATIONS, implement a handler,
and register it in KYC_TOOL_HANDLERS (same idea as s02_tool_use.py's TOOL_HANDLERS map).

Case-scoped tools use `case_id` / `Case` from the route-bound context. The `todo` tool uses
`AgentToolContext.todo_manager` (per-run state; see agent_todo.py / s03_todo_write).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from google.genai import types
from sqlmodel import Session, select

from app.models import Case, Document, Organization, RiskAssessment, ScreeningResult
from app.services.agent_todo import TodoManager


@dataclass
class AgentToolContext:
    session: Session
    case_id: UUID
    case: Case
    todo_manager: TodoManager


# (ctx, model_args) -> JSON-serializable dict for Gemini function_response
KycToolHandler = Callable[[AgentToolContext, dict[str, Any]], dict[str, Any]]


def _empty_params_schema() -> dict[str, Any]:
    return {"type": "object", "properties": {}, "additionalProperties": False}


def _todo_params_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "text": {"type": "string"},
                        "status": {
                            "type": "string",
                            "enum": ["pending", "in_progress", "completed"],
                        },
                    },
                    "required": ["id", "text", "status"],
                },
            }
        },
        "required": ["items"],
    }


def _get_case_snapshot(ctx: AgentToolContext, _args: dict[str, Any]) -> dict[str, Any]:
    case = ctx.case
    session = ctx.session
    org = session.get(Organization, case.organization_id) if case.organization_id else None
    return {
        "case": {
            "id": str(case.id),
            "status": case.status,
            "case_type": case.case_type,
            "customer_type": case.customer_type,
            "jurisdiction": case.jurisdiction,
            "risk_level": case.risk_level,
            "risk_score": case.risk_score,
            "policy_pack_version": case.policy_pack_version,
        },
        "organization": (
            {"legal_name": org.legal_name, "registration_number": org.registration_number}
            if org
            else None
        ),
    }


def _list_case_documents(ctx: AgentToolContext, _args: dict[str, Any]) -> dict[str, Any]:
    docs = ctx.session.exec(select(Document).where(Document.case_id == ctx.case_id)).all()
    return {
        "documents": [
            {
                "document_type": d.document_type,
                "file_name": d.file_name,
                "processing_status": d.processing_status,
            }
            for d in docs
        ],
        "count": len(docs),
    }


def _list_screening_results(ctx: AgentToolContext, _args: dict[str, Any]) -> dict[str, Any]:
    rows = ctx.session.exec(
        select(ScreeningResult).where(ScreeningResult.case_id == ctx.case_id)
    ).all()
    return {
        "screening": [
            {
                "screening_type": s.screening_type,
                "query_name": s.query_name,
                "matched_name": s.matched_name,
                "disposition": s.disposition,
                "match_score": s.match_score,
            }
            for s in rows
        ],
        "count": len(rows),
    }


def _get_latest_risk_assessment(ctx: AgentToolContext, _args: dict[str, Any]) -> dict[str, Any]:
    row = ctx.session.exec(
        select(RiskAssessment)
        .where(RiskAssessment.case_id == ctx.case_id)
        .order_by(RiskAssessment.created_at.desc())
    ).first()
    if not row:
        return {"risk_assessment": None}
    return {
        "risk_assessment": {
            "total_score": row.total_score,
            "risk_level": row.risk_level,
            "triggered_rules": row.triggered_rules,
            "edd_required": row.edd_required,
            "engine_version": row.engine_version,
        }
    }


def _todo_write(ctx: AgentToolContext, args: dict[str, Any]) -> dict[str, Any]:
    raw_items = args.get("items")
    if not isinstance(raw_items, list):
        return {"error": "invalid_args", "message": "items must be an array"}
    try:
        rendered = ctx.todo_manager.update(raw_items)
    except ValueError as e:
        return {"error": "todo_validation", "message": str(e)}
    return {"rendered": rendered, "items": ctx.todo_manager.snapshot()}


# -- Dispatch map: { tool_name: handler } --
KYC_TOOL_HANDLERS: dict[str, KycToolHandler] = {
    "get_case_snapshot": _get_case_snapshot,
    "list_case_documents": _list_case_documents,
    "list_screening_results": _list_screening_results,
    "get_latest_risk_assessment": _get_latest_risk_assessment,
    "todo": _todo_write,
}

_TOOL_DECLARATIONS: list[types.FunctionDeclaration] = [
    types.FunctionDeclaration(
        name="get_case_snapshot",
        description=(
            "Return case status, type, jurisdiction, risk fields, and organization legal name "
            "for the active KYC case."
        ),
        parameters_json_schema=_empty_params_schema(),
    ),
    types.FunctionDeclaration(
        name="list_case_documents",
        description="List documents on the case: document_type, file_name, processing_status.",
        parameters_json_schema=_empty_params_schema(),
    ),
    types.FunctionDeclaration(
        name="list_screening_results",
        description=(
            "List screening hits: screening_type, query_name, matched_name, disposition, match_score."
        ),
        parameters_json_schema=_empty_params_schema(),
    ),
    types.FunctionDeclaration(
        name="get_latest_risk_assessment",
        description=(
            "Return the most recent risk assessment: score, level, triggered_rules, edd_required."
        ),
        parameters_json_schema=_empty_params_schema(),
    ),
    types.FunctionDeclaration(
        name="todo",
        description=(
            "Update your task list for this session. Use for multi-step goals: set one item "
            "in_progress before working on it, completed when done. Mark pending for not started."
        ),
        parameters_json_schema=_todo_params_schema(),
    ),
]


def kyc_case_toolset() -> types.Tool:
    """Function declarations exposed to the model (must match keys in KYC_TOOL_HANDLERS)."""
    names_decl = {d.name for d in _TOOL_DECLARATIONS}
    names_handlers = set(KYC_TOOL_HANDLERS.keys())
    if names_decl != names_handlers:
        missing = names_handlers - names_decl
        extra = names_decl - names_handlers
        raise RuntimeError(
            f"Tool registry mismatch: declarations vs handlers. missing_in_decl={missing!r} "
            f"extra_in_decl={extra!r}"
        )
    return types.Tool(function_declarations=_TOOL_DECLARATIONS)


def execute_kyc_tool(
    ctx: AgentToolContext,
    tool_name: str,
    args: dict[str, Any],
) -> dict[str, Any]:
    """Run one tool via KYC_TOOL_HANDLERS; returns a dict for Gemini function_response."""
    handler = KYC_TOOL_HANDLERS.get(tool_name)
    if handler is None:
        return {"error": "unknown_tool", "tool_name": tool_name}
    return handler(ctx, args)
