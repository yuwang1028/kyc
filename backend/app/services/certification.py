"""
Decision certification — turns a case's audit trail into a signed, verifiable
certificate without any schema change.

How it works:
  * The case's audit_events are folded into a SHA-256 hash chain (the
    `audit_root`). Tampering with any past event changes the root.
  * The certificate bundles {workflow, policy pack version, models used,
    decision, audit_root, event count} and is signed with HMAC-SHA256.
  * Issuing a certificate writes it back as a `certificate_issued` audit event,
    so the certificate itself lives in the same tamper-evident trail.

Verification recomputes the hash chain over the first N events (the state at
issuance) and re-checks the signature, so it detects both data tampering
(chain breaks) and forged certificates (signature fails).
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime
from uuid import uuid4

from sqlmodel import Session, select

from app.config import settings
from app.models import AgentRun, AuditEvent, Case, Decision
from app.services.audit import log_event

CERT_EVENT_TYPE = "certificate_issued"
ISSUER = "cosmos-cert/v1"

WORKFLOW_LABEL = {
    "onboarding": "KYC · Business Onboarding",
}


def _canonical(obj) -> str:
    """Stable JSON for hashing/signing — sorted keys, no whitespace."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def _event_record(e: AuditEvent) -> str:
    return _canonical(
        {
            "case_id": str(e.case_id),
            "actor_type": e.actor_type,
            "actor_id": e.actor_id,
            "event_type": e.event_type,
            "event_payload": e.event_payload or {},
            "created_at": e.created_at.isoformat(),
        }
    )


def _chain_root(events: list[AuditEvent]) -> str:
    """Fold ordered events into a single SHA-256 hash chain."""
    h = ""
    for e in events:
        h = hashlib.sha256((h + _event_record(e)).encode()).hexdigest()
    return h


def _ordered_trail(session: Session, case_id) -> list[AuditEvent]:
    """Case audit events, oldest first, excluding the certificate events
    themselves (so issuing a certificate never alters the chain it covers)."""
    events = session.exec(
        select(AuditEvent).where(AuditEvent.case_id == case_id).order_by(AuditEvent.created_at)
    ).all()
    return [e for e in events if e.event_type != CERT_EVENT_TYPE]


def _sign(payload: dict) -> str:
    key = (settings.cert_signing_key or "").encode()
    return hmac.new(key, _canonical(payload).encode(), hashlib.sha256).hexdigest()


def _model_fingerprint(session: Session, case_id) -> tuple[dict, list[str]]:
    runs = session.exec(
        select(AgentRun).where(AgentRun.case_id == case_id).order_by(AgentRun.started_at)
    ).all()
    fingerprint: dict[str, str] = {}
    for r in runs:
        if r.model_name:
            fingerprint[r.agent_name] = r.model_name  # keep the latest per agent
    models = sorted({m for m in fingerprint.values() if "fail" not in m.lower()})
    return fingerprint, models


def _latest_decision(session: Session, case_id) -> str | None:
    decisions = session.exec(
        select(Decision).where(Decision.case_id == case_id).order_by(Decision.created_at.desc())
    ).all()
    return decisions[0].decision_type if decisions else None


def build_certificate(session: Session, case: Case) -> dict:
    trail = _ordered_trail(session, case.id)
    fingerprint, models = _model_fingerprint(session, case.id)

    payload = {
        "certificate_id": str(uuid4()),
        "issuer": ISSUER,
        "case_id": str(case.id),
        "workflow": WORKFLOW_LABEL.get(case.case_type, case.case_type),
        "policy_pack_version": case.policy_pack_version,
        "decision": _latest_decision(session, case.id) or case.status,
        "risk_level": case.risk_level,
        "risk_score": case.risk_score,
        "models": models,
        "model_fingerprint": fingerprint,
        "audit_root": _chain_root(trail),
        "audit_event_count": len(trail),
        "issued_at": datetime.utcnow().isoformat(),
    }
    cert = {**payload, "signature": _sign(payload)}

    log_event(
        session,
        actor_type="cosmos",
        actor_id="certification",
        event_type=CERT_EVENT_TYPE,
        event_payload=cert,
        case_id=case.id,
    )
    session.commit()
    return cert


def list_certificates(session: Session) -> list[dict]:
    events = session.exec(
        select(AuditEvent)
        .where(AuditEvent.event_type == CERT_EVENT_TYPE)
        .order_by(AuditEvent.created_at.desc())
    ).all()
    return [e.event_payload for e in events if e.event_payload]


def _find_certificate(session: Session, certificate_id: str) -> dict | None:
    for cert in list_certificates(session):
        if cert.get("certificate_id") == certificate_id:
            return cert
    return None


def verify_certificate(session: Session, certificate_id: str) -> dict | None:
    cert = _find_certificate(session, certificate_id)
    if not cert:
        return None

    # Signature check: re-sign the payload (everything but the signature).
    payload = {k: v for k, v in cert.items() if k != "signature"}
    signature_valid = hmac.compare_digest(_sign(payload), cert.get("signature", ""))

    # Chain check: recompute the root over the first N events (state at issuance).
    trail = _ordered_trail(session, cert["case_id"])
    at_issuance = trail[: cert["audit_event_count"]]
    recomputed_root = _chain_root(at_issuance)
    chain_intact = (
        len(trail) >= cert["audit_event_count"] and recomputed_root == cert["audit_root"]
    )

    return {
        "certificate_id": certificate_id,
        "signature_valid": signature_valid,
        "chain_intact": chain_intact,
        "verified": signature_valid and chain_intact,
        "stored_root": cert["audit_root"],
        "recomputed_root": recomputed_root,
        "audit_event_count": cert["audit_event_count"],
        "current_event_count": len(trail),
        "certificate": cert,
    }
