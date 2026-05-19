"""
MVP stub integrations for document processing, verification, and screening.

Replace with real OCR / registry / screening providers in production.
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlmodel import Session, select

from app.models import Case, Document, Organization, Party, ScreeningResult, VerificationResult
from app.models import CaseParty, OwnershipStructure
from app.services.document_ocr import process_document_record
from app.services.document_storage import resolve_upload_path
from app.services.serialize import json_safe


def process_case_documents(session: Session, case_id: UUID) -> list[dict[str, Any]]:
    """OCR / field extraction for uploaded PDFs (local files) or legacy URL-only rows."""
    docs = session.exec(select(Document).where(Document.case_id == case_id)).all()
    results: list[dict[str, Any]] = []
    for doc in docs:
        if doc.processing_status == "parsed" and doc.extracted_fields:
            results.append({"document_id": str(doc.id), "status": "already_parsed"})
            continue

        local_path = resolve_upload_path(doc.file_url or "")
        if local_path:
            try:
                row = process_document_record(doc)
                if row.get("status") == "parsed":
                    doc.processing_status = "parsed"
                    doc.extracted_fields = json_safe(row["extracted_fields"])
                    doc.updated_at = datetime.utcnow()
                    session.add(doc)
                    results.append(row)
                else:
                    results.append(row)
            except Exception as exc:
                doc.processing_status = "failed"
                doc.extracted_fields = json_safe(
                    {"error": str(exc), "document_type": doc.document_type}
                )
                session.add(doc)
                results.append(
                    {"document_id": str(doc.id), "status": "failed", "error": str(exc)}
                )
            continue

        doc.processing_status = "parsed"
        doc.extracted_fields = json_safe(
            {
                "document_type": doc.document_type,
                "file_name": doc.file_name,
                "extracted_at": "url_only_stub",
                "legal_name": None,
                "registration_number": None,
                "note": "No local PDF; upload via PDF upload for OCR",
            }
        )
        session.add(doc)
        results.append({"document_id": str(doc.id), "status": "parsed", "mode": "url_stub"})
    return results


def stub_business_verification(
    session: Session, case_id: UUID, org: Organization
) -> VerificationResult:
    """Simulate business registry lookup — matches org fields when present."""
    existing = session.exec(
        select(VerificationResult)
        .where(
            VerificationResult.case_id == case_id,
            VerificationResult.verification_type == "business_registry",
        )
        .order_by(VerificationResult.created_at.desc())
    ).first()
    if existing:
        return existing

    normalized = {
        "legal_name": org.legal_name,
        "registration_number": org.registration_number,
        "incorporation_country": org.incorporation_country,
        "status": "active",
    }
    row = VerificationResult(
        case_id=case_id,
        verification_type="business_registry",
        provider_name="stub_registry_v1",
        normalized_result=normalized,
        status="completed",
        confidence=0.92 if org.registration_number else 0.75,
    )
    session.add(row)
    session.flush()
    return row


def _demo_screening_hit(legal_name: str, screening_type: str) -> tuple[bool, float, str | None]:
    """Deterministic demo: ~15% of names get a low-confidence unresolved hit."""
    digest = hashlib.sha256(f"{legal_name}:{screening_type}".encode()).hexdigest()
    bucket = int(digest[:2], 16)
    if screening_type == "sanctions" and bucket < 8:
        return True, 0.72, legal_name.upper()
    if screening_type == "pep" and bucket < 12:
        return True, 0.65, f"{legal_name} (PEP candidate)"
    if screening_type == "adverse_media" and bucket < 20:
        return True, 0.55, None
    return False, 0.0, None


def stub_screening_batch(
    session: Session, case_id: UUID, org: Organization, parties: list[Party]
) -> list[ScreeningResult]:
    """Run sanctions / PEP / adverse_media for org and linked parties (skip if already present)."""
    names: list[tuple[str, UUID | None]] = [(org.legal_name, None)]
    for p in parties:
        names.append((p.legal_name, p.id))

    created: list[ScreeningResult] = []
    for legal_name, party_id in names:
        for screening_type in ("sanctions", "pep", "adverse_media", "watchlist"):
            exists = session.exec(
                select(ScreeningResult).where(
                    ScreeningResult.case_id == case_id,
                    ScreeningResult.screening_type == screening_type,
                    ScreeningResult.query_name == legal_name,
                )
            ).first()
            if exists:
                continue

            has_hit, score, matched = _demo_screening_hit(legal_name, screening_type)
            if not has_hit and screening_type == "watchlist":
                continue

            row = ScreeningResult(
                case_id=case_id,
                party_id=party_id,
                screening_type=screening_type,
                provider_name="stub_screening_v1",
                query_name=legal_name,
                matched_name=matched,
                match_score=score if has_hit else 0.0,
                disposition="unresolved" if has_hit else "false_positive",
                raw_response={"stub": True, "screening_type": screening_type},
            )
            session.add(row)
            created.append(row)
    session.flush()
    return created


def ensure_ownership_structure(session: Session, case_id: UUID) -> OwnershipStructure:
    """Build or return latest ownership structure from case parties."""
    latest = session.exec(
        select(OwnershipStructure)
        .where(OwnershipStructure.case_id == case_id)
        .order_by(OwnershipStructure.created_at.desc())
    ).first()
    if latest:
        return latest

    links = session.exec(select(CaseParty).where(CaseParty.case_id == case_id)).all()
    ubo_candidates: list[dict[str, Any]] = []
    tree_nodes: list[dict[str, Any]] = []

    for link in links:
        party = session.get(Party, link.party_id) if link.party_id else None
        if not party:
            continue
        node = {
            "party_id": str(party.id),
            "name": party.legal_name,
            "relation_type": link.relation_type,
            "ownership_percentage": link.ownership_percentage,
        }
        tree_nodes.append(node)
        if link.relation_type in ("ubo_candidate", "shareholder") and (link.ownership_percentage or 0) >= 25:
            ubo_candidates.append(
                {
                    "party_id": str(party.id),
                    "name": party.legal_name,
                    "ownership_percentage": link.ownership_percentage,
                }
            )

    complexity = min(100.0, 20.0 + len(tree_nodes) * 15.0)
    unresolved = len(ubo_candidates) == 0

    structure_json: dict[str, Any] = {
        "tree": {"root": "organization", "nodes": tree_nodes},
        "ubo_candidates": ubo_candidates,
        "control_person_candidates": [
            n for n in tree_nodes if n.get("relation_type") == "director"
        ],
        "unresolved_issues": ["no_ubo_identified"] if unresolved else [],
    }

    row = OwnershipStructure(
        case_id=case_id,
        version=1,
        structure_json=structure_json,
        complexity_score=complexity,
        unresolved_flag=unresolved,
    )
    session.add(row)
    session.flush()
    return row
