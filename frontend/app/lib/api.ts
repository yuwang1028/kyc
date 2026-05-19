export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      ...init,
    });
  } catch (e) {
    throw new Error(
      `Cannot reach API at ${url}. Is the backend running on port 8000? (${(e as Error).message})`
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status} ${url}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type Case = {
  id: string;
  organization_id: string | null;
  case_type: string;
  customer_type: string;
  jurisdiction: string | null;
  status: string;
  priority: string | null;
  risk_level: string | null;
  risk_score: number | null;
  created_at: string;
  updated_at: string;
};

export type Organization = {
  id: string;
  legal_name: string;
  registration_number: string | null;
  incorporation_country: string | null;
  website: string | null;
  business_description: string | null;
};

export type Document = {
  id: string;
  case_id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  processing_status: string | null;
  extracted_fields?: Record<string, unknown> | null;
  created_at: string;
};

export type ScreeningResult = {
  id: string;
  case_id: string;
  screening_type: string;
  query_name: string | null;
  matched_name: string | null;
  match_score: number | null;
  disposition: string | null;
  created_at: string;
};

export type RiskAssessment = {
  id: string;
  case_id: string;
  total_score: number | null;
  risk_level: string | null;
  triggered_rules: string[] | null;
  edd_required: boolean | null;
  created_at: string;
};

export type AgentRun = {
  id: string;
  agent_name: string;
  output_payload: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
};

export type Decision = {
  id: string;
  decision_type: string;
  decision_reason: string | null;
  decision_notes: string | null;
  created_at: string;
};

export type CasePartyRow = {
  party: {
    id: string;
    legal_name: string;
    party_type: string;
  };
  relation: {
    relation_type: string;
    ownership_percentage: number | null;
    control_flag: boolean | null;
  };
};

export type OwnershipStructure = {
  id: string;
  version: number;
  structure_json: Record<string, unknown>;
  complexity_score: number | null;
  unresolved_flag: boolean | null;
};

export type VerificationResult = {
  id: string;
  verification_type: string;
  status: string | null;
  confidence: number | null;
  normalized_result: Record<string, unknown> | null;
};

export type Task = {
  id: string;
  task_type: string;
  status: string;
  payload: Record<string, unknown> | null;
};

export type WorkflowPhase = {
  phase: string;
  status: string;
  case_status: string;
  message: string;
  output: Record<string, unknown>;
};

export type WorkflowRunResult = {
  case_id: string;
  final_status: string;
  risk_level: string | null;
  risk_score: number | null;
  stopped_early: boolean;
  phases: WorkflowPhase[];
};

export type DashboardStats = {
  total_cases: number;
  by_status: Record<string, number>;
  pending_review: number;
  high_risk: number;
};

export type CaseDetail = {
  case: Case;
  organization: Organization | null;
  documents: Document[];
  screening: ScreeningResult[];
  risk_assessments: RiskAssessment[];
  agent_runs: AgentRun[];
  decisions: Decision[];
  contacts?: { full_name: string; email: string | null }[];
  parties?: CasePartyRow[];
  ownership_structures?: OwnershipStructure[];
  verification_results?: VerificationResult[];
  tasks?: Task[];
};

export const api = {
  listCases: (status?: string) =>
    request<Case[]>(`/cases${status ? `?status=${encodeURIComponent(status)}` : ""}`),

  getDashboardStats: () => request<DashboardStats>(`/dashboard/stats`),

  createCase: (body: {
    organization: Partial<Organization> & { legal_name: string };
    case_type?: string;
    customer_type?: string;
    jurisdiction?: string;
  }) =>
    request<{ case: Case; organization: Organization }>(`/cases`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getCase: (id: string) => request<CaseDetail>(`/cases/${id}`),

  submitCase: (id: string) =>
    request<{ case_id: string; status: string }>(`/cases/${id}/submit`, {
      method: "POST",
    }),

  runWorkflow: (id: string, stopOnIncompleteIntake = true) =>
    request<WorkflowRunResult>(`/cases/${id}/workflow/run`, {
      method: "POST",
      body: JSON.stringify({ stop_on_incomplete_intake: stopOnIncompleteIntake }),
    }),

  addDocument: (
    id: string,
    body: { document_type: string; file_name: string; file_url: string }
  ) =>
    request<Document>(`/cases/${id}/documents`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  uploadDocumentPdf: async (id: string, documentType: string, file: File) => {
    const url = `${API_BASE}/cases/${id}/documents/upload`;
    const form = new FormData();
    form.append("document_type", documentType);
    form.append("file", file, file.name);
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", body: form, cache: "no-store" });
    } catch (e) {
      throw new Error(
        `Cannot reach API at ${url}. Is the backend running on port 8000? (${(e as Error).message})`
      );
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status} ${url}: ${text || res.statusText}`);
    }
    return (await res.json()) as Document;
  },

  documentFileUrl: (caseId: string, documentId: string) =>
    `${API_BASE}/cases/${caseId}/documents/${documentId}/file`,

  addParty: (
    id: string,
    body: {
      legal_name: string;
      party_type?: string;
      relation_type: string;
      ownership_percentage?: number;
    }
  ) =>
    request<{ party: { id: string; legal_name: string }; case_party: unknown }>(
      `/cases/${id}/parties`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  addScreening: (
    id: string,
    body: {
      party_name: string;
      screening_type: string;
      query_name: string;
      matched_name?: string;
      match_score?: number;
      disposition?: string;
    }
  ) =>
    request<ScreeningResult>(`/cases/${id}/screening/run`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  evaluateRisk: (id: string) =>
    request<{
      case_id: string;
      total_score: number;
      risk_level: string;
      triggered_rules: string[];
      recommendation: string;
      edd_required: boolean;
    }>(`/cases/${id}/risk/evaluate`, { method: "POST" }),

  runIntakeAgent: (id: string) =>
    request<AgentRun>(`/cases/${id}/agents/intake`, { method: "POST" }),

  runSummaryAgent: (id: string) =>
    request<AgentRun>(`/cases/${id}/agents/summary`, { method: "POST" }),

  patchOrganization: (
    caseId: string,
    body: { incorporation_country?: string; legal_name?: string; registration_number?: string }
  ) =>
    request<Organization>(`/cases/${caseId}/organization`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  decide: (
    id: string,
    body: { decision_type: string; decision_reason?: string; decision_notes?: string }
  ) =>
    request<{ decision: Decision; review_cycle?: unknown }>(`/cases/${id}/decision`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
