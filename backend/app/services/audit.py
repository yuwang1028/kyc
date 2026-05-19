from typing import Optional
from uuid import UUID

from sqlmodel import Session

from app.models import AuditEvent
from app.services.serialize import json_safe


def log_event(
    session: Session,
    *,
    actor_type: str,
    actor_id: Optional[str] = None,
    event_type: str,
    event_payload: Optional[dict] = None,
    case_id: Optional[UUID] = None,
) -> AuditEvent:
    event = AuditEvent(
        actor_type=actor_type,
        actor_id=actor_id,
        event_type=event_type,
        event_payload=json_safe(event_payload or {}),
        case_id=case_id,
    )
    session.add(event)
    return event
