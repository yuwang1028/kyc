const BASE = "/api/v1";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type ApiCase = {
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

export type ApiOrganization = {
  id: string;
  legal_name: string;
  registration_number: string | null;
  incorporation_country: string | null;
  website: string | null;
  business_description: string | null;
};

export type ApiDocument = {
  id: string;
  case_id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  processing_status: string | null;
  extracted_fields?: Record<string, unknown> | null;
  created_at: string;
};

export type ApiScreeningResult = {
  id: string;
  case_id: string;
  screening_type: string;
  query_name: string | null;
  matched_name: string | null;
  match_score: number | null;
  disposition: string | null;
  created_at: string;
};

export type ApiRiskAssessment = {
  id: string;
  case_id: string;
  total_score: number | null;
  risk_level: string | null;
  triggered_rules: string[] | null;
  edd_required: boolean | null;
  created_at: string;
};

export type ApiAgentRun = {
  id: string;
  agent_name: string;
  output_payload: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
};

export type ApiDecision = {
  id: string;
  decision_type: string;
  decision_reason: string | null;
  decision_notes: string | null;
  created_at: string;
};

export type ApiParty = {
  party: {
    id: string;
    legal_name: string;
    party_type: string;
    nationality: string | null;
    country: string | null;
  };
  relation: {
    relation_type: string;
    ownership_percentage: number | null;
    control_flag: boolean;
  };
};

export type ApiCaseDetail = {
  case: ApiCase;
  organization: ApiOrganization | null;
  documents: ApiDocument[];
  screening: ApiScreeningResult[];
  risk_assessments: ApiRiskAssessment[];
  agent_runs: ApiAgentRun[];
  decisions: ApiDecision[];
  parties: ApiParty[];
};

export type DashboardStats = {
  total_cases: number;
  by_status: Record<string, number>;
  pending_review: number;
  high_risk: number;
};

export type WorkflowRunStatus = {
  run_id: string;
  case_id: string;
  status: "pending" | "running" | "completed" | "failed";
  current_phase: string | null;
  elapsed_seconds: number | null;
  slow_warning: boolean;
  error: string | null;
  result: {
    final_status: string;
    risk_level: string | null;
    risk_score: number | null;
    stopped_early: boolean;
    phases: {
      phase: string;
      status: string;
      message: string;
      output: Record<string, unknown>;
    }[];
  } | null;
};

export const api = {
  listCases: (status?: string) =>
    request<ApiCase[]>(`/cases${status ? `?status=${encodeURIComponent(status)}` : ""}`),

  getDashboardStats: () => request<DashboardStats>("/dashboard/stats"),

  createCase: (body: {
    organization: Partial<ApiOrganization> & { legal_name: string };
    case_type?: string;
    jurisdiction?: string;
    priority?: string;
  }) =>
    request<{ case: ApiCase; organization: ApiOrganization }>("/cases", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getCase: (id: string) => request<ApiCaseDetail>(`/cases/${id}`),

  runWorkflow: (id: string) =>
    request<{ run_id: string; status: string; already_running: boolean }>(
      `/cases/${id}/workflow/run`,
      { method: "POST", body: JSON.stringify({ stop_on_incomplete_intake: true }) }
    ),

  getLatestWorkflowRun: (caseId: string) =>
    request<WorkflowRunStatus>(`/cases/${caseId}/workflow/runs/latest`),

  getWorkflowRun: (caseId: string, runId: string) =>
    request<WorkflowRunStatus>(`/cases/${caseId}/workflow/runs/${runId}`),

  deleteDocument: (caseId: string, documentId: string) =>
    request<void>(`/cases/${caseId}/documents/${documentId}`, { method: "DELETE" }),

  uploadDocument: async (caseId: string, documentType: string, file: File) => {
    const form = new FormData();
    form.append("document_type", documentType);
    form.append("file", file, file.name);
    const res = await fetch(`${BASE}/cases/${caseId}/documents/upload`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
    return res.json() as Promise<ApiDocument>;
  },

  runIntakeAgent: (id: string) =>
    request<ApiAgentRun>(`/cases/${id}/agents/intake`, { method: "POST" }),

  runSummaryAgent: (id: string) =>
    request<ApiAgentRun>(`/cases/${id}/agents/summary`, { method: "POST" }),

  evaluateRisk: (id: string) =>
    request<{ total_score: number; risk_level: string; triggered_rules: string[] }>(
      `/cases/${id}/risk/evaluate`,
      { method: "POST" }
    ),

  decide: (id: string, body: { decision_type: string; decision_reason?: string; decision_notes?: string }) =>
    request<{ decision: ApiDecision }>(`/cases/${id}/decision`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  addParty: (
    caseId: string,
    body: {
      legal_name: string;
      party_type?: string;
      relation_type: string;
      ownership_percentage?: number;
      control_flag?: boolean;
      nationality?: string;
      country?: string;
    }
  ) =>
    request<{ party: ApiParty["party"]; case_party: ApiParty["relation"] }>(
      `/cases/${caseId}/parties`,
      { method: "POST", body: JSON.stringify(body) }
    ),
};
