from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel as PydanticBaseModel
from sqlmodel import Session, select

from app.config import settings
from app.database import get_session
from app.models import (
    AgentRun,
    AgentWorkingMemory,
    AuditEvent,
    Case,
    CaseContact,
    CaseParty,
    Decision,
    Document,
    Organization,
    OwnershipStructure,
    Party,
    ReviewCycle,
    RiskAssessment,
    ScreeningResult,
    Task,
    VerificationResult,
    WorkflowRun,
)
from app.api.llm_routes import router as llm_router
from app.schemas import (
    AgentLoopRequest,
    CaseContactCreate,
    CaseCreate,
    CaseUpdate,
    OrganizationUpdate,
    DecisionCreate,
    DocumentCreate,
    OwnershipStructureCreate,
    PartyCreate,
    RiskEvaluateResponse,
    ScreeningCreate,
    TaskUpdate,
    WorkflowRunRequest,
)
from app.services.agents import (
    run_intake_agent,
    run_ownership_agent,
    run_risk_agent,
    run_screening_agent,
    run_summary_agent,
    run_verification_agent,
)
from app.services.audit import log_event
from app.services.agent_loop import run_kyc_case_agent_loop
from app.services.llm_gateway import get_llm_gateway
from app.services.risk_engine import evaluate_risk
from app.services.agent_llm import model_name_from_output
from app.services.document_ocr import process_pdf_file
from app.services.document_storage import resolve_public_url, resolve_upload_bytes, resolve_upload_path, save_case_pdf
from app.services.serialize import dump_model, json_safe
from app.services.workflow import schedule_review_cycle
from app.services.workflow_runner import execute_workflow_task, get_or_create_workflow_run

router = APIRouter()
router.include_router(llm_router)


def _create_agent_run(
    session: Session,
    case_id: UUID,
    agent_name: str,
    input_payload: dict,
    output_payload: dict,
    *,
    model_name: str | None = None,
) -> AgentRun:
    started = datetime.utcnow()
    run = AgentRun(
        case_id=case_id,
        agent_name=agent_name,
        input_payload=json_safe(input_payload),
        output_payload=json_safe(output_payload),
        status="completed",
        model_name=model_name or model_name_from_output(output_payload),
        started_at=started,
        finished_at=datetime.utcnow(),
    )
    session.add(run)
    return run


def _latest_agent_output(session: Session, case_id: UUID, agent_name: str) -> dict:
    run = session.exec(
        select(AgentRun)
        .where(AgentRun.case_id == case_id, AgentRun.agent_name == agent_name)
        .order_by(AgentRun.started_at.desc())
    ).first()
    return run.output_payload if run and run.output_payload else {}


def _fresh_intake_output(session: Session, case_id: UUID) -> dict:
    """Recompute intake from current organization + documents (not stale agent runs)."""
    case = session.get(Case, case_id)
    if not case:
        return {}
    org = session.get(Organization, case.organization_id) if case.organization_id else None
    docs = session.exec(select(Document).where(Document.case_id == case_id)).all()
    snapshot = {
        "organization": dump_model(org) if org else {},
        "documents": [dump_model(d) for d in docs],
        "policy_pack_version": case.policy_pack_version,
    }
    return run_intake_agent(snapshot)


def _risk_output_for_summary(session: Session, case_id: UUID) -> dict:
    """Prefer latest risk_agent run; fall back to risk_assessments row."""
    cached = _latest_agent_output(session, case_id, "risk_agent")
    if cached.get("risk_level") and cached.get("risk_level") != "unknown":
        return cached
    latest = session.exec(
        select(RiskAssessment)
        .where(RiskAssessment.case_id == case_id)
        .order_by(RiskAssessment.created_at.desc())
    ).first()
    if not latest:
        return {
            "risk_score": None,
            "risk_level": "unknown",
            "triggered_rules": [],
            "recommended_disposition": "pending_human_review",
        }
    level = latest.risk_level or "unknown"
    disposition = "pending_human_review"
    if level in {"high", "prohibited"}:
        disposition = "escalate"
    elif level == "low":
        disposition = "approve_with_standard_monitoring"
    return {
        "risk_score": latest.total_score,
        "risk_level": level,
        "triggered_rules": latest.triggered_rules or [],
        "recommended_disposition": disposition,
        "edd_required": bool(latest.edd_required),
    }


# ----- Cases -----------------------------------------------------------------


@router.get("/cases")
def list_cases(
    status: Optional[str] = None,
    limit: int = 50,
    session: Session = Depends(get_session),
):
    stmt = select(Case).order_by(Case.created_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(Case.status == status)
    return session.exec(stmt).all()


@router.post("/cases", status_code=201)
def create_case(payload: CaseCreate, session: Session = Depends(get_session)):
    org = Organization(**payload.organization.model_dump())
    session.add(org)
    session.flush()

    case = Case(
        organization_id=org.id,
        case_type=payload.case_type,
        customer_type=payload.customer_type,
        jurisdiction=payload.jurisdiction,
        priority=payload.priority or "normal",
        status="awaiting_documents",
        policy_pack_version="v1-us-business-onboarding",
    )
    session.add(case)
    session.flush()

    log_event(
        session,
        actor_type="user",
        actor_id="external_customer",
        event_type="case_created",
        event_payload={
            "case_type": payload.case_type,
            "customer_type": payload.customer_type,
            "jurisdiction": payload.jurisdiction,
        },
        case_id=case.id,
    )
    session.commit()
    session.refresh(case)
    return {"case": case, "organization": org}


@router.get("/cases/{case_id}")
def get_case(case_id: UUID, session: Session = Depends(get_session)):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    org = session.get(Organization, case.organization_id) if case.organization_id else None
    docs = session.exec(select(Document).where(Document.case_id == case_id)).all()
    screening = session.exec(select(ScreeningResult).where(ScreeningResult.case_id == case_id)).all()
    risks = session.exec(
        select(RiskAssessment)
        .where(RiskAssessment.case_id == case_id)
        .order_by(RiskAssessment.created_at.desc())
    ).all()
    runs = session.exec(
        select(AgentRun).where(AgentRun.case_id == case_id).order_by(AgentRun.started_at.desc())
    ).all()
    decisions = session.exec(
        select(Decision).where(Decision.case_id == case_id).order_by(Decision.created_at.desc())
    ).all()
    contacts = session.exec(select(CaseContact).where(CaseContact.case_id == case_id)).all()
    case_party_links = session.exec(select(CaseParty).where(CaseParty.case_id == case_id)).all()
    parties = []
    for link in case_party_links:
        party = session.get(Party, link.party_id) if link.party_id else None
        if party:
            parties.append({"party": party, "relation": link})
    ownership = session.exec(
        select(OwnershipStructure)
        .where(OwnershipStructure.case_id == case_id)
        .order_by(OwnershipStructure.created_at.desc())
    ).all()
    verifications = session.exec(
        select(VerificationResult)
        .where(VerificationResult.case_id == case_id)
        .order_by(VerificationResult.created_at.desc())
    ).all()
    tasks = session.exec(
        select(Task).where(Task.case_id == case_id).order_by(Task.created_at.desc())
    ).all()
    return {
        "case": case,
        "organization": org,
        "documents": docs,
        "screening": screening,
        "risk_assessments": risks,
        "agent_runs": runs,
        "decisions": decisions,
        "contacts": contacts,
        "parties": parties,
        "ownership_structures": ownership,
        "verification_results": verifications,
        "tasks": tasks,
    }


@router.patch("/cases/{case_id}")
def update_case(case_id: UUID, payload: CaseUpdate, session: Session = Depends(get_session)):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    update_data = payload.model_dump(exclude_none=True)
    for key, value in update_data.items():
        setattr(case, key, value)
    case.updated_at = datetime.utcnow()
    session.add(case)

    log_event(
        session,
        actor_type="user",
        actor_id="analyst",
        event_type="case_updated",
        event_payload=update_data,
        case_id=case.id,
    )
    session.commit()
    session.refresh(case)
    return case


@router.post("/cases/{case_id}/submit")
def submit_case(case_id: UUID, session: Session = Depends(get_session)):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    case.status = "intake_review"
    case.updated_at = datetime.utcnow()
    session.add(case)
    session.add(Task(case_id=case.id, task_type="intake_review", status="open"))
    log_event(
        session,
        actor_type="user",
        actor_id="external_customer",
        event_type="case_submitted",
        event_payload={},
        case_id=case.id,
    )
    session.commit()
    return {"case_id": str(case.id), "status": case.status}


@router.post("/cases/{case_id}/contacts", status_code=201)
def add_case_contact(
    case_id: UUID, payload: CaseContactCreate, session: Session = Depends(get_session)
):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    contact = CaseContact(case_id=case_id, **payload.model_dump())
    session.add(contact)
    log_event(
        session,
        actor_type="user",
        actor_id="external_customer",
        event_type="contact_added",
        event_payload=payload.model_dump(),
        case_id=case_id,
    )
    session.commit()
    session.refresh(contact)
    return contact


@router.post("/cases/{case_id}/parties", status_code=201)
def add_case_party(case_id: UUID, payload: PartyCreate, session: Session = Depends(get_session)):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    party = Party(
        party_type=payload.party_type,
        legal_name=payload.legal_name,
        nationality=payload.nationality,
        country=payload.country,
    )
    session.add(party)
    session.flush()
    link = CaseParty(
        case_id=case_id,
        party_id=party.id,
        relation_type=payload.relation_type,
        ownership_percentage=payload.ownership_percentage,
        control_flag=payload.control_flag,
    )
    session.add(link)
    log_event(
        session,
        actor_type="user",
        actor_id="external_customer",
        event_type="party_added",
        event_payload={"party_id": str(party.id), "relation_type": payload.relation_type},
        case_id=case_id,
    )
    session.commit()
    session.refresh(party)
    return {"party": party, "case_party": link}


@router.post("/cases/{case_id}/ownership", status_code=201)
def create_ownership_structure(
    case_id: UUID, payload: OwnershipStructureCreate, session: Session = Depends(get_session)
):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    latest = session.exec(
        select(OwnershipStructure)
        .where(OwnershipStructure.case_id == case_id)
        .order_by(OwnershipStructure.version.desc())
    ).first()
    version = (latest.version + 1) if latest else 1
    row = OwnershipStructure(
        case_id=case_id,
        version=version,
        structure_json=payload.structure_json,
        complexity_score=payload.complexity_score,
        unresolved_flag=payload.unresolved_flag,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


# ----- Workflow (PRD Phases 1–6) ---------------------------------------------


@router.post("/cases/{case_id}/workflow/run")
def run_case_workflow(
    case_id: UUID,
    background_tasks: BackgroundTasks,
    payload: WorkflowRunRequest | None = None,
    session: Session = Depends(get_session),
):
    """
    Launch onboarding pipeline asynchronously. Returns {run_id, status} immediately.
    Poll GET /cases/{id}/workflow/runs/{run_id} for progress and final result.
    Idempotent: if a run is already active for this case, returns the existing run_id.
    """
    if not session.get(Case, case_id):
        raise HTTPException(status_code=404, detail="Case not found")

    body = payload or WorkflowRunRequest()
    run, is_new = get_or_create_workflow_run(
        session,
        case_id,
        stop_on_incomplete_intake=body.stop_on_incomplete_intake,
    )

    if is_new:
        background_tasks.add_task(execute_workflow_task, run.id)

    return {
        "run_id": str(run.id),
        "status": run.status,
        "already_running": not is_new,
    }


@router.get("/cases/{case_id}/workflow/runs/latest")
def get_latest_workflow_run(
    case_id: UUID,
    session: Session = Depends(get_session),
):
    """Return the most recent workflow run for this case, or 404 if none exists."""
    run = session.exec(
        select(WorkflowRun)
        .where(WorkflowRun.case_id == case_id)
        .order_by(WorkflowRun.created_at.desc())
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="No workflow runs found")
    return {
        "run_id": str(run.id),
        "case_id": str(run.case_id),
        "status": run.status,
        "current_phase": run.current_phase,
        "elapsed_seconds": run.elapsed_seconds,
        "slow_warning": run.slow_warning,
        "error": run.error,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "result": run.result_payload,
    }


@router.get("/cases/{case_id}/workflow/runs/{run_id}")
def get_workflow_run(
    case_id: UUID,
    run_id: UUID,
    session: Session = Depends(get_session),
):
    """Poll workflow run status. result_payload is populated when status == 'completed'."""
    run = session.get(WorkflowRun, run_id)
    if not run or run.case_id != case_id:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    return {
        "run_id": str(run.id),
        "case_id": str(run.case_id),
        "status": run.status,
        "current_phase": run.current_phase,
        "elapsed_seconds": run.elapsed_seconds,
        "slow_warning": run.slow_warning,
        "error": run.error,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "result": run.result_payload,
    }


@router.get("/dashboard/stats")
def dashboard_stats(session: Session = Depends(get_session)):
    cases = session.exec(select(Case)).all()
    by_status: dict[str, int] = {}
    for c in cases:
        by_status[c.status] = by_status.get(c.status, 0) + 1
    pending_review = sum(
        by_status.get(s, 0)
        for s in ("pending_human_review", "pending_manager_approval", "intake_review")
    )
    high_risk = sum(1 for c in cases if c.risk_level in ("high", "prohibited"))
    return {
        "total_cases": len(cases),
        "by_status": by_status,
        "pending_review": pending_review,
        "high_risk": high_risk,
    }


# ----- Documents -------------------------------------------------------------


@router.post("/cases/{case_id}/documents", status_code=201)
def add_document(case_id: UUID, payload: DocumentCreate, session: Session = Depends(get_session)):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    doc = Document(
        case_id=case.id,
        organization_id=case.organization_id,
        **payload.model_dump(),
    )
    session.add(doc)
    log_event(
        session,
        actor_type="user",
        actor_id="external_customer",
        event_type="document_uploaded",
        event_payload={"document_type": payload.document_type, "file_name": payload.file_name},
        case_id=case.id,
    )
    session.commit()
    session.refresh(doc)
    return doc


@router.get("/cases/{case_id}/documents")
def list_documents(case_id: UUID, session: Session = Depends(get_session)):
    return session.exec(
        select(Document).where(Document.case_id == case_id).order_by(Document.created_at.desc())
    ).all()


_ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
_MIME_MAP = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}

def _auto_register_ubo_parties(
    session: Session, case_id: UUID, ubo_parties: list[dict]
) -> int:
    """Create Party + CaseParty rows from LLM-extracted UBO list. Skip duplicates by name."""
    existing_names = {
        (session.get(Party, link.party_id).legal_name or "").strip().lower()
        for link in session.exec(select(CaseParty).where(CaseParty.case_id == case_id)).all()
        if link.party_id and session.get(Party, link.party_id)
    }
    registered = 0
    for p in ubo_parties:
        name = (p.get("full_name") or "").strip()
        if not name or name.lower() in existing_names:
            continue
        pct = p.get("ownership_percentage")
        is_managing = bool(p.get("is_managing_member"))
        relation = "ubo_candidate" if (pct or 0) >= 25 else "shareholder"
        party = Party(
            party_type="individual",
            legal_name=name,
            nationality=p.get("nationality") or None,
        )
        session.add(party)
        session.flush()
        link = CaseParty(
            case_id=case_id,
            party_id=party.id,
            relation_type=relation,
            ownership_percentage=float(pct) if pct is not None else None,
            control_flag=is_managing,
        )
        session.add(link)
        existing_names.add(name.lower())
        registered += 1
    return registered


@router.post("/cases/{case_id}/documents/upload", status_code=201)
async def upload_document_pdf(
    case_id: UUID,
    document_type: str = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    """Upload a PDF/PNG/JPG, store locally, run OCR on PDFs, and persist extracted fields."""
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    fname = (file.filename or "").lower()
    ext = next((e for e in _ALLOWED_EXTENSIONS if fname.endswith(e)), None)
    if not ext:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(_ALLOWED_EXTENSIONS)}",
        )

    raw = await file.read()
    max_bytes = settings.max_upload_bytes
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {max_bytes // (1024 * 1024)} MB)",
        )

    rel_path, abs_path = save_case_pdf(case_id, file.filename, raw)
    mime_type = _MIME_MAP.get(ext, "application/octet-stream")

    auto_registered_parties = 0
    if ext == ".pdf":
        if not raw.startswith(b"%PDF"):
            raise HTTPException(status_code=400, detail="File is not a valid PDF")
        try:
            extracted = process_pdf_file(
                abs_path=abs_path,
                document_type=document_type,
                file_name=file.filename,
            )
            processing_status = "parsed"
            # Auto-register UBO parties extracted from declaration PDFs
            ubo_parties = extracted.get("ubo_parties") or []
            if ubo_parties:
                auto_registered_parties = _auto_register_ubo_parties(session, case_id, ubo_parties)
        except Exception as exc:
            extracted = json_safe({"error": str(exc), "document_type": document_type})
            processing_status = "failed"
    else:
        # Image files: stored as-is, no OCR; intake gate treats "uploaded" as satisfying the requirement
        extracted = json_safe({"document_type": document_type, "file_name": file.filename, "ocr_method": "none"})
        processing_status = "uploaded"

    doc = Document(
        case_id=case.id,
        organization_id=case.organization_id,
        document_type=document_type,
        file_name=file.filename,
        file_url=rel_path,
        mime_type=mime_type,
        file_size=len(raw),
        processing_status=processing_status,
        extracted_fields=json_safe(extracted),
    )
    session.add(doc)
    payload: dict = {
        "document_type": document_type,
        "file_name": file.filename,
        "upload_method": ext.lstrip("."),
        "processing_status": processing_status,
    }
    if auto_registered_parties:
        payload["auto_registered_ubo_parties"] = auto_registered_parties
    log_event(
        session,
        actor_type="user",
        actor_id="external_customer",
        event_type="document_uploaded",
        event_payload=json_safe(payload),
        case_id=case.id,
    )
    session.commit()
    session.refresh(doc)
    return doc


@router.delete("/cases/{case_id}/documents/{document_id}", status_code=204)
def delete_document(
    case_id: UUID,
    document_id: UUID,
    session: Session = Depends(get_session),
):
    """Delete a document record and its on-disk file."""
    doc = session.get(Document, document_id)
    if not doc or doc.case_id != case_id:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete the physical file if it exists
    path = resolve_upload_path(doc.file_url or "")
    if path:
        try:
            path.unlink()
        except OSError:
            pass  # already gone, continue

    log_event(
        session,
        actor_type="user",
        actor_id="external_customer",
        event_type="document_deleted",
        event_payload={"document_type": doc.document_type, "file_name": doc.file_name},
        case_id=case_id,
    )
    session.delete(doc)
    session.commit()


@router.get("/cases/{case_id}/documents/{document_id}/file")
def download_document_file(
    case_id: UUID,
    document_id: UUID,
    session: Session = Depends(get_session),
):
    doc = session.get(Document, document_id)
    if not doc or doc.case_id != case_id:
        raise HTTPException(status_code=404, detail="Document not found")

    # GCS: redirect to signed URL
    signed_url = resolve_public_url(doc.file_url or "")
    if signed_url:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(signed_url)

    # Local: stream bytes
    data = resolve_upload_bytes(doc.file_url or "")
    if not data:
        raise HTTPException(status_code=404, detail="File not available on server")
    from fastapi.responses import Response
    return Response(
        content=data,
        media_type=doc.mime_type or "application/pdf",
        headers={"Content-Disposition": f'inline; filename="{doc.file_name}"'},
    )


# ----- Screening -------------------------------------------------------------


@router.post("/cases/{case_id}/screening/run", status_code=201)
def create_screening_result(
    case_id: UUID, payload: ScreeningCreate, session: Session = Depends(get_session)
):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    body = payload.model_dump()
    body.pop("party_name", None)
    result = ScreeningResult(case_id=case.id, **body)
    session.add(result)
    log_event(
        session,
        actor_type="system",
        actor_id="screening_service",
        event_type="screening_result_ingested",
        event_payload=payload.model_dump(),
        case_id=case.id,
    )
    session.commit()
    session.refresh(result)
    return result


@router.get("/cases/{case_id}/screening/results")
def list_screening_results(case_id: UUID, session: Session = Depends(get_session)):
    return session.exec(
        select(ScreeningResult)
        .where(ScreeningResult.case_id == case_id)
        .order_by(ScreeningResult.created_at.desc())
    ).all()


# ----- Risk ------------------------------------------------------------------


@router.post("/cases/{case_id}/risk/evaluate", response_model=RiskEvaluateResponse)
def evaluate_case_risk(case_id: UUID, session: Session = Depends(get_session)):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    org = session.get(Organization, case.organization_id) if case.organization_id else None
    docs = session.exec(select(Document).where(Document.case_id == case_id)).all()
    screening = session.exec(select(ScreeningResult).where(ScreeningResult.case_id == case_id)).all()
    party_links = session.exec(select(CaseParty).where(CaseParty.case_id == case_id)).all()

    pep_true_match = any(r.screening_type == "pep" and r.disposition == "true_match" for r in screening)
    sanctions_true_match = any(
        r.screening_type == "sanctions" and r.disposition == "true_match" for r in screening
    )
    adverse_media_escalated = any(
        r.screening_type == "adverse_media" and r.disposition == "true_match" for r in screening
    )

    ubo_parties: list[dict] = []
    for link in party_links:
        party_row = session.get(Party, link.party_id) if link.party_id else None
        if party_row:
            ubo_parties.append({
                "party": {"nationality": party_row.nationality, "legal_name": party_row.legal_name},
                "relation": {
                    "relation_type": link.relation_type,
                    "ownership_percentage": link.ownership_percentage,
                },
            })

    ownership_rows = session.exec(
        select(OwnershipStructure)
        .where(OwnershipStructure.case_id == case_id)
        .order_by(OwnershipStructure.created_at.desc())
    ).all()
    latest_ownership = ownership_rows[0] if ownership_rows else None
    complexity = float(latest_ownership.complexity_score or 0) if latest_ownership else 0.0
    unresolved = bool(latest_ownership and latest_ownership.unresolved_flag)

    risk = evaluate_risk(
        {
            "organization_country": case.jurisdiction or (org.incorporation_country if org else None),
            "incorporation_country": org.incorporation_country if org else None,
            "jurisdiction": case.jurisdiction,
            "business_description": org.business_description if org else None,
            "pep_true_match": pep_true_match,
            "sanctions_true_match": sanctions_true_match,
            "adverse_media_escalated": adverse_media_escalated,
            "ownership_complexity_score": complexity,
            "ownership_unresolved": unresolved,
            "documents": [json_safe(dict(d)) for d in docs],
            "ubo_parties": ubo_parties,
        }
    )

    assessment = RiskAssessment(
        case_id=case.id,
        engine_version="risk-engine-v2",
        total_score=risk["total_score"],
        risk_level=risk["risk_level"],
        triggered_rules=risk["triggered_rules"],
        rationale=risk.get("rationale", {}),
        edd_required=risk["edd_required"],
    )
    session.add(assessment)

    case.risk_score = risk["total_score"]
    case.risk_level = risk["risk_level"]
    case.status = (
        "pending_manager_approval" if risk["risk_level"] == "low" else "pending_human_review"
    )
    session.add(case)

    log_event(
        session,
        actor_type="system",
        actor_id="risk_engine",
        event_type="risk_assessed",
        event_payload=risk,
        case_id=case.id,
    )
    session.commit()

    return {
        "case_id": case.id,
        "total_score": risk["total_score"],
        "risk_level": risk["risk_level"],
        "triggered_rules": risk["triggered_rules"],
        "recommendation": risk["recommendation"],
        "edd_required": risk["edd_required"],
    }


@router.get("/cases/{case_id}/risk")
def list_risk_results(case_id: UUID, session: Session = Depends(get_session)):
    return session.exec(
        select(RiskAssessment)
        .where(RiskAssessment.case_id == case_id)
        .order_by(RiskAssessment.created_at.desc())
    ).all()


# ----- Agents ----------------------------------------------------------------


@router.post("/cases/{case_id}/agents/intake")
def run_case_intake_agent(case_id: UUID, session: Session = Depends(get_session)):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    org = session.get(Organization, case.organization_id) if case.organization_id else None
    docs = session.exec(select(Document).where(Document.case_id == case_id)).all()

    snapshot = {
        "organization": dump_model(org) if org else {},
        "documents": [dump_model(d) for d in docs],
        "policy_pack_version": case.policy_pack_version,
    }
    output = run_intake_agent(snapshot)

    run = _create_agent_run(session, case.id, "intake_agent", snapshot, output)
    log_event(
        session,
        actor_type="agent",
        actor_id="intake_agent",
        event_type="agent_run_completed",
        event_payload=output,
        case_id=case.id,
    )
    session.commit()
    session.refresh(run)
    return run


@router.post("/cases/{case_id}/agents/verification")
def run_case_verification_agent(case_id: UUID, session: Session = Depends(get_session)):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    org = session.get(Organization, case.organization_id) if case.organization_id else None
    verification_results = session.exec(
        select(VerificationResult)
        .where(VerificationResult.case_id == case_id)
        .order_by(VerificationResult.created_at.desc())
    ).all()

    snapshot = {
        "organization": dump_model(org) if org else {},
        "verification_results": [dump_model(v) for v in verification_results],
    }
    output = run_verification_agent(snapshot)
    run = _create_agent_run(session, case.id, "verification_agent", snapshot, output)
    log_event(
        session,
        actor_type="agent",
        actor_id="verification_agent",
        event_type="agent_run_completed",
        event_payload=output,
        case_id=case.id,
    )
    session.commit()
    session.refresh(run)
    return run


@router.post("/cases/{case_id}/agents/screening")
def run_case_screening_agent(case_id: UUID, session: Session = Depends(get_session)):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    screening_results = session.exec(
        select(ScreeningResult)
        .where(ScreeningResult.case_id == case_id)
        .order_by(ScreeningResult.created_at.desc())
    ).all()
    snapshot = {"screening_results": [dump_model(s) for s in screening_results]}
    output = run_screening_agent(snapshot)
    run = _create_agent_run(session, case.id, "screening_agent", snapshot, output)
    log_event(
        session,
        actor_type="agent",
        actor_id="screening_agent",
        event_type="agent_run_completed",
        event_payload=output,
        case_id=case.id,
    )
    session.commit()
    session.refresh(run)
    return run


@router.post("/cases/{case_id}/agents/ownership")
def run_case_ownership_agent(case_id: UUID, session: Session = Depends(get_session)):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    structures = session.exec(
        select(OwnershipStructure)
        .where(OwnershipStructure.case_id == case_id)
        .order_by(OwnershipStructure.created_at.desc())
    ).all()
    snapshot = {"ownership_structures": [dump_model(s) for s in structures]}
    output = run_ownership_agent(snapshot)
    run = _create_agent_run(session, case.id, "ownership_agent", snapshot, output)
    log_event(
        session,
        actor_type="agent",
        actor_id="ownership_agent",
        event_type="agent_run_completed",
        event_payload=output,
        case_id=case.id,
    )
    session.commit()
    session.refresh(run)
    return run


@router.post("/cases/{case_id}/agents/risk")
def run_case_risk_agent(case_id: UUID, session: Session = Depends(get_session)):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    latest_risk = session.exec(
        select(RiskAssessment)
        .where(RiskAssessment.case_id == case_id)
        .order_by(RiskAssessment.created_at.desc())
    ).first()
    snapshot = {
        "risk": dump_model(latest_risk) if latest_risk else {},
        "screening_agent_output": _latest_agent_output(session, case_id, "screening_agent"),
        "ownership_agent_output": _latest_agent_output(session, case_id, "ownership_agent"),
    }
    output = run_risk_agent(snapshot)
    run = _create_agent_run(session, case.id, "risk_agent", snapshot, output)
    log_event(
        session,
        actor_type="agent",
        actor_id="risk_agent",
        event_type="agent_run_completed",
        event_payload=output,
        case_id=case.id,
    )
    session.commit()
    session.refresh(run)
    return run


@router.patch("/cases/{case_id}/organization")
def patch_case_organization(
    case_id: UUID,
    payload: OrganizationUpdate,
    session: Session = Depends(get_session),
):
    case = session.get(Case, case_id)
    if not case or not case.organization_id:
        raise HTTPException(status_code=404, detail="Case or organization not found")
    org = session.get(Organization, case.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(org, key, value)
    org.updated_at = datetime.utcnow()
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


@router.post("/cases/{case_id}/agents/summary")
def run_case_summary_agent(case_id: UUID, session: Session = Depends(get_session)):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    intake_out = _fresh_intake_output(session, case_id)
    intake_snapshot = {
        "organization": dump_model(session.get(Organization, case.organization_id))
        if case.organization_id
        else {},
        "documents": [
            dump_model(d)
            for d in session.exec(select(Document).where(Document.case_id == case_id)).all()
        ],
        "policy_pack_version": case.policy_pack_version,
    }
    _create_agent_run(session, case.id, "intake_agent", intake_snapshot, intake_out)

    snapshot = {
        "intake_agent_output": intake_out,
        "verification_agent_output": _latest_agent_output(session, case_id, "verification_agent"),
        "screening_agent_output": _latest_agent_output(session, case_id, "screening_agent"),
        "ownership_agent_output": _latest_agent_output(session, case_id, "ownership_agent"),
        "risk_agent_output": _risk_output_for_summary(session, case_id),
    }
    output = run_summary_agent(snapshot)

    run = _create_agent_run(session, case.id, "decision_support_agent", snapshot, output)
    log_event(
        session,
        actor_type="agent",
        actor_id="decision_support_agent",
        event_type="agent_run_completed",
        event_payload=output,
        case_id=case.id,
    )
    session.commit()
    session.refresh(run)
    return run


@router.post("/cases/{case_id}/agents/loop")
def run_case_react_agent_loop(
    case_id: UUID,
    payload: AgentLoopRequest,
    session: Session = Depends(get_session),
):
    """
    Vertex Gemini tool loop on a single case: read-only case tools plus optional `todo` planning.
    If the model calls tools three rounds in a row without `todo`, a reminder is injected (s03 pattern).
    Persists an `AgentRun` named `kyc_react_agent` with step trace in `output_payload`.
    """
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    gw = get_llm_gateway()
    if not gw.enabled:
        raise HTTPException(
            status_code=503,
            detail="Ollama is not configured. Set OLLAMA_BASE_URL / OLLAMA_MODEL in .env and run: ollama serve && ollama pull qwen2.5:7b",
        )

    try:
        _, model_id = gw.resolve_model_id("kyc_agent_loop")
        result = run_kyc_case_agent_loop(
            session,
            case_id,
            payload.goal,
            max_turns=payload.max_turns,
        )
    except ValueError as e:
        if str(e) == "case_not_found":
            raise HTTPException(status_code=404, detail="Case not found") from e
        raise
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    steps_out = [
        {
            "turn": s.turn,
            "role": s.role,
            "detail": s.detail,
            "tool_name": s.tool_name,
            "tool_result": s.tool_result,
        }
        for s in result.steps
    ]
    input_payload = {"goal": payload.goal, "max_turns": payload.max_turns}
    output_payload = {
        "final_text": result.final_text,
        "stopped_reason": result.stopped_reason,
        "model_rounds": result.model_rounds,
        "steps": steps_out,
        "todos_final": result.todos_final,
        "todo_reminders_injected": result.todo_reminders_injected,
    }
    run = _create_agent_run(
        session,
        case.id,
        "kyc_react_agent",
        input_payload,
        output_payload,
        model_name=model_id,
    )
    log_event(
        session,
        actor_type="agent",
        actor_id="kyc_react_agent",
        event_type="agent_run_completed",
        event_payload={"stopped_reason": result.stopped_reason, "model_rounds": result.model_rounds},
        case_id=case.id,
    )
    session.commit()
    session.refresh(run)
    return {"agent_run": run, **output_payload}


@router.get("/cases/{case_id}/agent-runs")
def list_agent_runs(case_id: UUID, session: Session = Depends(get_session)):
    return session.exec(
        select(AgentRun).where(AgentRun.case_id == case_id).order_by(AgentRun.started_at.desc())
    ).all()


# ----- Decisions / Tasks / Audit ---------------------------------------------


@router.post("/cases/{case_id}/decision", status_code=201)
def create_decision(case_id: UUID, payload: DecisionCreate, session: Session = Depends(get_session)):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    decision = Decision(case_id=case_id, **payload.model_dump())
    session.add(decision)

    status_map = {
        "approve": "approved",
        "reject": "rejected",
        "request_more_info": "awaiting_documents",
        "escalate": "pending_manager_approval",
    }
    if payload.decision_type in status_map:
        case.status = status_map[payload.decision_type]
        case.updated_at = datetime.utcnow()
        if payload.decision_type == "approve":
            case.closed_at = datetime.utcnow()
        session.add(case)

    review_cycle = None
    if payload.decision_type == "approve":
        review_cycle = schedule_review_cycle(session, case_id, frequency_months=12)

    log_event(
        session,
        actor_type="user",
        actor_id=str(payload.decided_by) if payload.decided_by else "analyst",
        event_type="decision_recorded",
        event_payload=payload.model_dump(mode="json"),
        case_id=case.id,
    )
    session.commit()
    session.refresh(decision)
    out: dict = {"decision": decision}
    if review_cycle:
        out["review_cycle"] = review_cycle
    return out


@router.get("/tasks")
def list_tasks(
    status: Optional[str] = None,
    case_id: Optional[UUID] = None,
    session: Session = Depends(get_session),
):
    stmt = select(Task).order_by(Task.created_at.desc())
    if status:
        stmt = stmt.where(Task.status == status)
    if case_id:
        stmt = stmt.where(Task.case_id == case_id)
    return session.exec(stmt).all()


@router.patch("/tasks/{task_id}")
def update_task(task_id: UUID, payload: TaskUpdate, session: Session = Depends(get_session)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    update_data = payload.model_dump(exclude_none=True)
    for key, value in update_data.items():
        setattr(task, key, value)
    task.updated_at = datetime.utcnow()
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.get("/cases/{case_id}/audit")
def list_audit_events(case_id: UUID, session: Session = Depends(get_session)):
    return session.exec(
        select(AuditEvent)
        .where(AuditEvent.case_id == case_id)
        .order_by(AuditEvent.created_at.desc())
    ).all()


@router.post("/refresh/run")
def run_refresh_cycle(session: Session = Depends(get_session)):
    """Create refresh tasks for approved cases due for periodic review (PRD Use Case 4)."""
    now = datetime.utcnow()
    due_cycles = session.exec(
        select(ReviewCycle).where(
            ReviewCycle.status == "scheduled",
            ReviewCycle.next_review_at <= now,
        )
    ).all()
    created_tasks = 0
    refresh_cases = 0
    for cycle in due_cycles:
        if not cycle.case_id:
            continue
        parent = session.get(Case, cycle.case_id)
        if not parent:
            continue
        session.add(
            Task(
                case_id=parent.id,
                task_type="refresh_review",
                status="open",
                payload={"review_cycle_id": str(cycle.id)},
            )
        )
        created_tasks += 1
        parent.status = "refresh_due"
        parent.updated_at = now
        session.add(parent)

        existing_refresh = session.exec(
            select(Case).where(
                Case.organization_id == parent.organization_id,
                Case.case_type == "refresh",
                Case.status.in_(("initiated", "awaiting_documents", "intake_review")),
            )
        ).first()
        if not existing_refresh:
            refresh_case = Case(
                organization_id=parent.organization_id,
                case_type="refresh",
                customer_type=parent.customer_type,
                jurisdiction=parent.jurisdiction,
                status="awaiting_documents",
                policy_pack_version=parent.policy_pack_version,
            )
            session.add(refresh_case)
            refresh_cases += 1
            log_event(
                session,
                actor_type="system",
                actor_id="refresh_scheduler",
                event_type="refresh_case_created",
                event_payload={"parent_case_id": str(parent.id)},
                case_id=refresh_case.id,
            )

    session.commit()
    return {
        "refresh_tasks_created": created_tasks,
        "refresh_cases_created": refresh_cases,
        "due_cycles_processed": len(due_cycles),
    }


# ----- LLM Provider settings -------------------------------------------------

from app.services.llm_provider import (
    get_provider, is_vertex_configured, is_vllm_configured, is_nim_configured,
    set_provider, provider_summary, VALID_PROVIDERS,
)
from app.services.llm_gateway import (
    OllamaGateway, VertexAIGateway, VLLMGateway, NIMGateway,
    get_llm_gateway, get_prefix_cache_stats,
)


@router.get("/settings/llm-provider")
def get_llm_provider_settings():
    """Return current LLM provider config and availability for all backends."""
    ollama_gw = OllamaGateway()
    vertex_gw = VertexAIGateway()
    vllm_gw   = VLLMGateway()
    nim_gw    = NIMGateway()
    return {
        **provider_summary(),
        "ollama": {"configured": ollama_gw.enabled, "model": ollama_gw._model},
        "vertex": {
            "configured": is_vertex_configured(),
            "project":    vertex_gw._project,
            "location":   vertex_gw._location,
            "models":     {"lite": "gemini-2.5-flash-lite", "flash": "gemini-2.5-flash", "pro": "gemini-2.5-pro"},
        },
        "vllm": {
            "configured":           is_vllm_configured(),
            "base_url":             vllm_gw._base_url,
            "model":                vllm_gw._model,
            "tensor_parallel_size": vllm_gw._tensor_parallel_size,
            "prefix_cache_stats":   get_prefix_cache_stats(),
        },
        "nim": {
            "configured": is_nim_configured(),
            "base_url":   nim_gw._base_url,
            "models":     {"lite": "llama-3.1-8b", "flash": "llama-3.1-70b", "pro": "llama-3.1-405b"},
        },
    }


class LLMProviderUpdate(PydanticBaseModel):
    provider: str  # "ollama" | "vertex" | "vllm" | "nim"


@router.post("/settings/llm-provider")
def update_llm_provider(payload: LLMProviderUpdate):
    """Switch active LLM provider at runtime. Persisted across restarts."""
    if payload.provider not in VALID_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"provider must be one of: {', '.join(VALID_PROVIDERS)}"
        )
    if payload.provider == "vertex" and not is_vertex_configured():
        raise HTTPException(
            status_code=400,
            detail="Vertex AI is not configured. Set VERTEX_PROJECT_ID and VERTEX_LOCATION in .env"
        )
    if payload.provider == "vllm" and not is_vllm_configured():
        raise HTTPException(
            status_code=400,
            detail="vLLM is not configured. Set VLLM_BASE_URL and VLLM_MODEL in .env"
        )
    if payload.provider == "nim" and not is_nim_configured():
        raise HTTPException(
            status_code=400,
            detail="NVIDIA NIM is not configured. Set NIM_API_KEY in .env"
        )
    set_provider(payload.provider)
    return {"active": payload.provider, "status": "ok"}
