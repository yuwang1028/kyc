from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.database import get_session
from app.models import Case
from app.services.certification import (
    build_certificate,
    list_certificates,
    verify_certificate,
)

router = APIRouter(tags=["certification"])


@router.post("/cases/{case_id}/certify")
def certify_case(case_id: UUID, session: Session = Depends(get_session)):
    """Issue a signed certificate over the case's audit trail."""
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return build_certificate(session, case)


@router.get("/certificates")
def get_certificates(session: Session = Depends(get_session)):
    """All issued certificates, newest first."""
    return list_certificates(session)


@router.get("/certificates/{certificate_id}/verify")
def verify(certificate_id: str, session: Session = Depends(get_session)):
    """Re-check signature + audit hash chain for a certificate."""
    result = verify_certificate(session, certificate_id)
    if not result:
        raise HTTPException(status_code=404, detail="Certificate not found")
    return result
