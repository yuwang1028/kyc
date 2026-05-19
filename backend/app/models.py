from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, SQLModel

from app.config import settings


def _json_column():
    if settings.database_url.startswith("sqlite"):
        return Column(JSON)
    return Column(JSONB)


def _named_json_column(name: str):
    """JSON column with explicit DB name (e.g. Party.metadata)."""
    if settings.database_url.startswith("sqlite"):
        return Column(name, JSON)
    return Column(name, JSONB)


class Organization(SQLModel, table=True):
    __tablename__ = "organizations"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    legal_name: str
    normalized_name: Optional[str] = None
    registration_number: Optional[str] = None
    tax_id: Optional[str] = None
    incorporation_country: Optional[str] = None
    incorporation_state: Optional[str] = None
    incorporation_date: Optional[date] = None
    registered_address: Optional[str] = None
    operating_address: Optional[str] = None
    website: Optional[str] = None
    business_description: Optional[str] = None
    industry_code: Optional[str] = None
    status: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Case(SQLModel, table=True):
    __tablename__ = "cases"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: Optional[UUID] = None
    case_type: str = "onboarding"
    customer_type: str = "business"
    jurisdiction: Optional[str] = None
    status: str = "initiated"
    priority: Optional[str] = "normal"
    assigned_to: Optional[UUID] = None
    risk_level: Optional[str] = None
    risk_score: Optional[float] = None
    policy_pack_version: Optional[str] = None
    opened_at: datetime = Field(default_factory=datetime.utcnow)
    due_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CaseContact(SQLModel, table=True):
    __tablename__ = "case_contacts"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    case_id: Optional[UUID] = None
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    role_title: Optional[str] = None
    is_primary: Optional[bool] = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Party(SQLModel, table=True):
    __tablename__ = "parties"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    party_type: str
    legal_name: str
    normalized_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    nationality: Optional[str] = None
    registration_number: Optional[str] = None
    country: Optional[str] = None
    address: Optional[str] = None
    party_metadata: Optional[dict] = Field(default=None, sa_column=_named_json_column("metadata"))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CaseParty(SQLModel, table=True):
    __tablename__ = "case_parties"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    case_id: Optional[UUID] = None
    party_id: Optional[UUID] = None
    relation_type: str
    ownership_percentage: Optional[float] = None
    control_flag: Optional[bool] = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Document(SQLModel, table=True):
    __tablename__ = "documents"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    case_id: Optional[UUID] = None
    organization_id: Optional[UUID] = None
    uploaded_by: Optional[UUID] = None
    document_type: str
    file_name: str
    file_url: str
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    processing_status: Optional[str] = "uploaded"
    extracted_fields: Optional[dict] = Field(default=None, sa_column=_json_column())
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class DocumentReview(SQLModel, table=True):
    __tablename__ = "document_reviews"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    document_id: Optional[UUID] = None
    reviewed_by: Optional[UUID] = None
    review_status: Optional[str] = None
    notes: Optional[str] = None
    corrected_fields: Optional[dict] = Field(default=None, sa_column=_json_column())
    created_at: datetime = Field(default_factory=datetime.utcnow)


class VerificationResult(SQLModel, table=True):
    __tablename__ = "verification_results"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    case_id: Optional[UUID] = None
    verification_type: str
    provider_name: Optional[str] = None
    request_payload: Optional[dict] = Field(default=None, sa_column=_json_column())
    raw_response: Optional[dict] = Field(default=None, sa_column=_json_column())
    normalized_result: Optional[dict] = Field(default=None, sa_column=_json_column())
    status: Optional[str] = None
    confidence: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ScreeningResult(SQLModel, table=True):
    __tablename__ = "screening_results"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    case_id: Optional[UUID] = None
    party_id: Optional[UUID] = None
    screening_type: str
    provider_name: Optional[str] = None
    query_name: Optional[str] = None
    matched_name: Optional[str] = None
    match_score: Optional[float] = 0
    disposition: Optional[str] = "unresolved"
    raw_response: Optional[dict] = Field(default=None, sa_column=_json_column())
    evidence: Optional[dict] = Field(default=None, sa_column=_json_column())
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class OwnershipStructure(SQLModel, table=True):
    __tablename__ = "ownership_structures"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    case_id: Optional[UUID] = None
    version: int = 1
    structure_json: dict = Field(default_factory=dict, sa_column=_json_column())
    complexity_score: Optional[float] = None
    unresolved_flag: Optional[bool] = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RiskAssessment(SQLModel, table=True):
    __tablename__ = "risk_assessments"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    case_id: Optional[UUID] = None
    engine_version: Optional[str] = "risk-engine-v1"
    total_score: Optional[float] = None
    risk_level: Optional[str] = None
    triggered_rules: Optional[Any] = Field(default_factory=list, sa_column=_json_column())
    rationale: Optional[dict] = Field(default=None, sa_column=_json_column())
    edd_required: Optional[bool] = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PolicyEvaluation(SQLModel, table=True):
    __tablename__ = "policy_evaluations"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    case_id: Optional[UUID] = None
    policy_pack_version: Optional[str] = None
    rule_code: str
    rule_name: Optional[str] = None
    evaluation_result: Optional[bool] = None
    evaluation_details: Optional[dict] = Field(default=None, sa_column=_json_column())
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AgentRun(SQLModel, table=True):
    __tablename__ = "agent_runs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    case_id: Optional[UUID] = None
    agent_name: str
    input_payload: Optional[dict] = Field(default=None, sa_column=_json_column())
    output_payload: Optional[dict] = Field(default=None, sa_column=_json_column())
    status: Optional[str] = "completed"
    model_name: Optional[str] = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: Optional[datetime] = None


class Task(SQLModel, table=True):
    __tablename__ = "tasks"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    case_id: Optional[UUID] = None
    task_type: str
    status: str = "open"
    assigned_to: Optional[UUID] = None
    due_at: Optional[datetime] = None
    payload: Optional[dict] = Field(default=None, sa_column=_json_column())
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Decision(SQLModel, table=True):
    __tablename__ = "decisions"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    case_id: Optional[UUID] = None
    decision_type: str
    decided_by: Optional[UUID] = None
    decision_reason: Optional[str] = None
    decision_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AuditEvent(SQLModel, table=True):
    __tablename__ = "audit_events"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    case_id: Optional[UUID] = None
    actor_type: str
    actor_id: Optional[str] = None
    event_type: str
    event_payload: Optional[dict] = Field(default=None, sa_column=_json_column())
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ReviewCycle(SQLModel, table=True):
    __tablename__ = "review_cycles"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: Optional[UUID] = None
    case_id: Optional[UUID] = None
    next_review_at: Optional[datetime] = None
    review_frequency_months: Optional[int] = None
    status: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
