"""
PRD onboarding workflow orchestrator (Phases 1–6).

    Intake → Verification → Screening → Ownership → Risk → Review (summary)

Stubs in `workflow_stubs.py`. Agents in `agents.py` use rules + Vertex Gemini when configured.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlmodel import Session, select

from app.models import (
    AgentRun,
    Case,
    CaseParty,
    Document,
    Organization,
    OwnershipStructure,
    Party,
    ReviewCycle,
    RiskAssessment,
    ScreeningResult,
    Task,
    VerificationResult,
)
from app.services.agents import (
    run_decision_support_agent,
    run_intake_agent,
    run_ownership_agent,
    run_risk_agent,
    run_screening_agent,
    run_verification_agent,
)
from app.services.audit import log_event
from app.services.risk_engine import evaluate_risk
from app.services.serialize import dump_model, json_safe
from app.services.agent_llm import model_name_from_output
from app.services.workflow_stubs import (
    ensure_ownership_structure,
    process_case_documents,
    stub_business_verification,
    stub_screening_batch,
)


@dataclass
class WorkflowPhaseResult:
    phase: str
    status: str  # completed | skipped | blocked
    case_status: str
    output: dict[str, Any] = field(default_factory=dict)
    message: str = ""


def _agent_run(
    session: Session,
    case_id: UUID,
    agent_name: str,
    input_payload: dict,
    output_payload: dict,
) -> AgentRun:
    started = datetime.utcnow()
    run = AgentRun(
        case_id=case_id,
        agent_name=agent_name,
        input_payload=json_safe(input_payload),
        output_payload=json_safe(output_payload),
        status="completed",
        model_name=model_name_from_output(output_payload),
        started_at=started,
        finished_at=datetime.utcnow(),
    )
    session.add(run)
    return run


def run_onboarding_workflow(
    session: Session,
    case_id: UUID,
    *,
    stop_on_incomplete_intake: bool = True,
) -> dict[str, Any]:
    """
    Execute the MVP new-business onboarding pipeline for one case.
    Returns phase trace + final case status (may stop early if intake incomplete).
    """
    case = session.get(Case, case_id)
    if not case:
        raise ValueError("case_not_found")

    org = session.get(Organization, case.organization_id) if case.organization_id else None
    if not org:
        raise ValueError("organization_not_found")

    phases: list[WorkflowPhaseResult] = []
    docs = list(session.exec(select(Document).where(Document.case_id == case_id)).all())

    # ----- Phase 1: Intake -----
    case.status = "intake_review"
    case.updated_at = datetime.utcnow()
    intake_snapshot = {
        "organization": dump_model(org),
        "documents": [dump_model(d) for d in docs],
        "policy_pack_version": case.policy_pack_version,
    }
    intake_out = run_intake_agent(intake_snapshot)
    _agent_run(session, case_id, "intake_agent", intake_snapshot, intake_out)
    log_event(
        session,
        actor_type="workflow",
        actor_id="onboarding_workflow",
        event_type="workflow_phase_completed",
        event_payload=json_safe({"phase": "intake", "output": intake_out}),
        case_id=case_id,
    )

    missing = intake_out.get("missing_fields") or intake_out.get("missing_docs")
    phases.append(
        WorkflowPhaseResult(
            phase="intake",
            status="completed",
            case_status=case.status,
            output=intake_out,
        )
    )

    if stop_on_incomplete_intake and (intake_out.get("missing_fields") or intake_out.get("missing_docs")):
        case.status = "awaiting_documents"
        case.updated_at = datetime.utcnow()
        session.add(
            Task(
                case_id=case_id,
                task_type="request_missing_documents",
                status="open",
                payload={
                    "missing_fields": intake_out.get("missing_fields"),
                    "missing_docs": intake_out.get("missing_docs"),
                },
            )
        )
        phases.append(
            WorkflowPhaseResult(
                phase="verification",
                status="skipped",
                case_status=case.status,
                message="Blocked: intake incomplete",
            )
        )
        session.add(case)
        return _workflow_response(case, phases, stopped_early=True)

    # ----- Phase 2: Verification -----
    case.status = "verification_in_progress"
    case.updated_at = datetime.utcnow()
    doc_results = process_case_documents(session, case_id)
    verification_row = stub_business_verification(session, case_id, org)
    verification_results = list(
        session.exec(
            select(VerificationResult)
            .where(VerificationResult.case_id == case_id)
            .order_by(VerificationResult.created_at.desc())
        ).all()
    )
    verification_snapshot = {
        "organization": dump_model(org),
        "verification_results": [dump_model(v) for v in verification_results],
    }
    verification_out = run_verification_agent(verification_snapshot)
    _agent_run(session, case_id, "verification_agent", verification_snapshot, verification_out)
    phases.append(
        WorkflowPhaseResult(
            phase="verification",
            status="completed",
            case_status=case.status,
            output={
                "documents_processed": doc_results,
                "verification_id": str(verification_row.id),
                **verification_out,
            },
        )
    )

    # ----- Phase 3: Screening -----
    case.status = "screening_in_progress"
    case.updated_at = datetime.utcnow()
    party_ids = session.exec(select(CaseParty.party_id).where(CaseParty.case_id == case_id)).all()
    parties = [session.get(Party, pid) for pid in party_ids if pid]
    parties = [p for p in parties if p is not None]
    screening_created = stub_screening_batch(session, case_id, org, parties)
    screening_rows = list(
        session.exec(
            select(ScreeningResult)
            .where(ScreeningResult.case_id == case_id)
            .order_by(ScreeningResult.created_at.desc())
        ).all()
    )
    screening_snapshot = {"screening_results": [dump_model(s) for s in screening_rows]}
    screening_out = run_screening_agent(screening_snapshot)
    _agent_run(session, case_id, "screening_agent", screening_snapshot, screening_out)
    phases.append(
        WorkflowPhaseResult(
            phase="screening",
            status="completed",
            case_status=case.status,
            output={"screening_created": len(screening_created), **screening_out},
        )
    )

    # ----- Phase 4: Ownership -----
    ownership_row = ensure_ownership_structure(session, case_id)
    structures = list(
        session.exec(
            select(OwnershipStructure)
            .where(OwnershipStructure.case_id == case_id)
            .order_by(OwnershipStructure.created_at.desc())
        ).all()
    )
    ownership_snapshot = {"ownership_structures": [dump_model(s) for s in structures]}
    ownership_out = run_ownership_agent(ownership_snapshot)
    _agent_run(session, case_id, "ownership_agent", ownership_snapshot, ownership_out)
    phases.append(
        WorkflowPhaseResult(
            phase="ownership",
            status="completed",
            case_status=case.status,
            output={"ownership_id": str(ownership_row.id), **ownership_out},
        )
    )

    # ----- Phase 5: Risk -----
    case.status = "risk_assessment_in_progress"
    case.updated_at = datetime.utcnow()
    screening_rows = list(
        session.exec(select(ScreeningResult).where(ScreeningResult.case_id == case_id)).all()
    )
    pep_true = any(r.screening_type == "pep" and r.disposition == "true_match" for r in screening_rows)
    sanctions_true = any(
        r.screening_type == "sanctions" and r.disposition == "true_match" for r in screening_rows
    )
    complexity = float(ownership_out.get("complexity_score") or ownership_row.complexity_score or 0)
    unresolved = bool(ownership_out.get("unresolved_ownership_issues"))

    risk = evaluate_risk(
        {
            "organization_country": case.jurisdiction or org.incorporation_country,
            "pep_true_match": pep_true,
            "sanctions_true_match": sanctions_true,
            "ownership_complexity_score": complexity,
            "ownership_unresolved": unresolved and len(ownership_out.get("unresolved_ownership_issues") or []) > 0,
        }
    )
    assessment = RiskAssessment(
        case_id=case_id,
        engine_version="risk-engine-v1",
        total_score=risk["total_score"],
        risk_level=risk["risk_level"],
        triggered_rules=risk["triggered_rules"],
        rationale={
            "pep_true_match": pep_true,
            "sanctions_true_match": sanctions_true,
            "ownership_complexity_score": complexity,
        },
        edd_required=risk["edd_required"],
    )
    session.add(assessment)
    case.risk_score = risk["total_score"]
    case.risk_level = risk["risk_level"]

    risk_snapshot = {
        "risk": dump_model(assessment),
        "screening_agent_output": screening_out,
        "ownership_agent_output": ownership_out,
    }
    risk_out = run_risk_agent(risk_snapshot)
    _agent_run(session, case_id, "risk_agent", risk_snapshot, risk_out)
    phases.append(
        WorkflowPhaseResult(
            phase="risk",
            status="completed",
            case_status=case.status,
            output={**risk, **risk_out},
        )
    )

    # ----- Phase 6: Review (summary) -----
    summary_snapshot = {
        "intake_agent_output": intake_out,
        "verification_agent_output": verification_out,
        "screening_agent_output": screening_out,
        "ownership_agent_output": ownership_out,
        "risk_agent_output": risk_out,
    }
    summary_out = run_decision_support_agent(summary_snapshot)
    _agent_run(session, case_id, "decision_support_agent", summary_snapshot, summary_out)

    escalated = bool(screening_out.get("escalated_hits")) or risk["risk_level"] in ("high", "prohibited")
    if risk["risk_level"] == "low" and not escalated:
        case.status = "pending_manager_approval"
    else:
        case.status = "pending_human_review"
    case.updated_at = datetime.utcnow()
    session.add(
        Task(case_id=case_id, task_type="human_review", status="open", payload={"risk_level": risk["risk_level"]})
    )
    phases.append(
        WorkflowPhaseResult(
            phase="review",
            status="completed",
            case_status=case.status,
            output=summary_out,
        )
    )

    log_event(
        session,
        actor_type="workflow",
        actor_id="onboarding_workflow",
        event_type="workflow_completed",
        event_payload={
            "final_status": case.status,
            "risk_level": case.risk_level,
            "phases": [p.phase for p in phases],
        },
        case_id=case_id,
    )
    session.add(case)
    return _workflow_response(case, phases, stopped_early=False)


def schedule_review_cycle(
    session: Session,
    case_id: UUID,
    *,
    frequency_months: int = 12,
) -> ReviewCycle:
    """Phase 7 lite: set next review date after approval."""
    case = session.get(Case, case_id)
    if not case:
        raise ValueError("case_not_found")
    next_at = datetime.utcnow() + timedelta(days=30 * frequency_months)
    row = ReviewCycle(
        organization_id=case.organization_id,
        case_id=case_id,
        next_review_at=next_at,
        review_frequency_months=frequency_months,
        status="scheduled",
    )
    session.add(row)
    case.due_at = next_at
    case.updated_at = datetime.utcnow()
    session.add(case)
    return row


def _workflow_response(
    case: Case, phases: list[WorkflowPhaseResult], *, stopped_early: bool
) -> dict[str, Any]:
    return {
        "case_id": str(case.id),
        "final_status": case.status,
        "risk_level": case.risk_level,
        "risk_score": case.risk_score,
        "stopped_early": stopped_early,
        "phases": [
            {
                "phase": p.phase,
                "status": p.status,
                "case_status": p.case_status,
                "message": p.message,
                "output": p.output,
            }
            for p in phases
        ],
    }
