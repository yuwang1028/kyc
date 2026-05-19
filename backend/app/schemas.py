from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class OrganizationCreate(BaseModel):
    legal_name: str
    registration_number: Optional[str] = None
    incorporation_country: Optional[str] = None
    incorporation_state: Optional[str] = None
    registered_address: Optional[str] = None
    operating_address: Optional[str] = None
    website: Optional[str] = None
    business_description: Optional[str] = None
    industry_code: Optional[str] = None


class CaseCreate(BaseModel):
    organization: OrganizationCreate
    case_type: str = "onboarding"
    customer_type: str = "business"
    jurisdiction: Optional[str] = None
    priority: Optional[str] = "normal"


class OrganizationUpdate(BaseModel):
    legal_name: Optional[str] = None
    registration_number: Optional[str] = None
    incorporation_country: Optional[str] = None
    incorporation_state: Optional[str] = None
    website: Optional[str] = None
    business_description: Optional[str] = None


class CaseUpdate(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[UUID] = None
    priority: Optional[str] = None
    risk_level: Optional[str] = None
    risk_score: Optional[float] = None


class DocumentCreate(BaseModel):
    document_type: str
    file_name: str
    file_url: str
    mime_type: Optional[str] = None
    file_size: Optional[int] = None


class ScreeningCreate(BaseModel):
    party_name: str
    screening_type: str
    query_name: str
    matched_name: Optional[str] = None
    match_score: float = 0
    disposition: str = "unresolved"
    provider_name: Optional[str] = "manual"


class DecisionCreate(BaseModel):
    decision_type: str
    decided_by: Optional[UUID] = None
    decision_reason: Optional[str] = None
    decision_notes: Optional[str] = None


class TaskUpdate(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[UUID] = None
    due_at: Optional[datetime] = None


class RiskEvaluateResponse(BaseModel):
    case_id: UUID
    total_score: float
    risk_level: str
    triggered_rules: list[str] = Field(default_factory=list)
    recommendation: str
    edd_required: bool = False


class AgentLoopRequest(BaseModel):
    """Body for `POST /cases/{case_id}/agents/loop` — Vertex-backed tool loop on one case."""

    goal: str = Field(..., min_length=1, description="What the analyst wants the agent to figure out.")
    max_turns: int = Field(default=10, ge=1, le=25, description="Max LLM rounds (each may include tool execution).")


class WorkflowRunRequest(BaseModel):
    stop_on_incomplete_intake: bool = True


class CaseContactCreate(BaseModel):
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    role_title: Optional[str] = None
    is_primary: bool = False


class PartyCreate(BaseModel):
    legal_name: str
    party_type: str = "individual"
    relation_type: str = Field(
        ...,
        description="director | shareholder | ubo_candidate | signatory | control_person",
    )
    ownership_percentage: Optional[float] = None
    control_flag: bool = False
    nationality: Optional[str] = None
    country: Optional[str] = None


class OwnershipStructureCreate(BaseModel):
    structure_json: dict = Field(default_factory=dict)
    complexity_score: Optional[float] = None
    unresolved_flag: bool = False
