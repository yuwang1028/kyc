import Link from "next/link";

import { api, type CaseDetail } from "../../lib/api";
import CaseActions from "./Actions";
import LlmStatusBanner from "./LlmStatusBanner";
import WorkflowPanel from "./WorkflowPanel";

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  let detail: CaseDetail | null = null;
  let error: string | null = null;
  try {
    detail = await api.getCase(params.id);
  } catch (e) {
    error = (e as Error).message;
  }

  if (error || !detail) {
    return (
      <div>
        <Link href="/" style={{ color: "#93c5fd" }}>
          ← Back
        </Link>
        <h1>Case not found</h1>
        <pre style={{ color: "#fca5a5" }}>{error}</pre>
      </div>
    );
  }

  const {
    case: c,
    organization,
    documents,
    screening,
    risk_assessments,
    agent_runs,
    decisions,
    parties = [],
    ownership_structures = [],
    verification_results = [],
    tasks = [],
  } = detail;
  const latestRisk = risk_assessments[0];
  const latestSummary = agent_runs.find((r) => r.agent_name === "decision_support_agent");
  const latestIntake = agent_runs.find((r) => r.agent_name === "intake_agent");

  return (
    <div>
      <Link href="/" style={{ color: "#93c5fd" }}>
        ← Back to dashboard
      </Link>
      <h1 style={{ marginBottom: 6 }}>
        {organization?.legal_name || "Case"}{" "}
        <span style={{ color: "#94a3b8", fontWeight: 400, fontSize: 16 }}>
          ({c.id.slice(0, 8)}…)
        </span>
      </h1>
      <p style={{ color: "#94a3b8", marginTop: 0 }}>
        Status: <b>{c.status}</b> · Risk: <b>{c.risk_level || "—"}</b> ({c.risk_score ?? "n/a"})
      </p>

      <LlmStatusBanner />
      <WorkflowPanel caseId={c.id} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
          marginTop: 16,
        }}
      >
        <Panel title="Overview">
          <KV k="Case Type" v={c.case_type} />
          <KV k="Customer Type" v={c.customer_type} />
          <KV k="Jurisdiction" v={c.jurisdiction || "—"} />
          <KV k="Priority" v={c.priority || "normal"} />
          <KV k="Created" v={new Date(c.created_at).toLocaleString()} />
        </Panel>

        <Panel title="Organization">
          <KV k="Legal Name" v={organization?.legal_name || "—"} />
          <KV k="Reg #" v={organization?.registration_number || "—"} />
          <KV k="Country" v={organization?.incorporation_country || "—"} />
          <KV k="Website" v={organization?.website || "—"} />
        </Panel>

        <Panel title="Summary (Decision Support Agent)">
          {latestSummary ? (
            <>
              <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 8px" }}>
                Generated {latestSummary.started_at?.slice(0, 19) ?? "—"} — click
                &quot;Summary only&quot; after updating docs/country to refresh.
              </p>
              <pre style={preStyle}>{JSON.stringify(latestSummary.output_payload, null, 2)}</pre>
            </>
          ) : (
            <p style={{ color: "#94a3b8" }}>Not run yet.</p>
          )}
        </Panel>

        <Panel title="Intake Agent">
          {latestIntake ? (
            <pre style={preStyle}>{JSON.stringify(latestIntake.output_payload, null, 2)}</pre>
          ) : (
            <p style={{ color: "#94a3b8" }}>Not run yet.</p>
          )}
        </Panel>

        <Panel title={`Documents (${documents.length})`}>
          {documents.length === 0 && <p style={{ color: "#94a3b8" }}>No documents.</p>}
          {documents.map((d) => (
            <div key={d.id} style={{ borderBottom: "1px solid #1f2547", padding: "6px 0" }}>
              <div style={{ fontWeight: 600 }}>{d.document_type}</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                {d.file_name}
                {d.processing_status ? ` · ${d.processing_status}` : ""}
              </div>
              {d.extracted_fields && (
                <pre style={{ ...preStyle, marginTop: 6, maxHeight: 120, overflow: "auto" }}>
                  {JSON.stringify(
                    {
                      ocr_method: d.extracted_fields.ocr_method,
                      legal_name: d.extracted_fields.legal_name,
                      registration_number: d.extracted_fields.registration_number,
                      tax_id: d.extracted_fields.tax_id,
                      preview: d.extracted_fields.raw_text_preview,
                    },
                    null,
                    2
                  )}
                </pre>
              )}
            </div>
          ))}
        </Panel>

        <Panel title={`Parties / UBO (${parties.length})`}>
          {parties.length === 0 && <p style={{ color: "#94a3b8" }}>No parties linked.</p>}
          {parties.map((row) => (
            <div key={row.party.id} style={{ borderBottom: "1px solid #1f2547", padding: "6px 0" }}>
              <div style={{ fontWeight: 600 }}>{row.party.legal_name}</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                {row.relation.relation_type}
                {row.relation.ownership_percentage != null
                  ? ` · ${row.relation.ownership_percentage}%`
                  : ""}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title={`Verification (${verification_results.length})`}>
          {verification_results.length === 0 && (
            <p style={{ color: "#94a3b8" }}>Run workflow to stub registry check.</p>
          )}
          {verification_results.map((v) => (
            <div key={v.id} style={{ borderBottom: "1px solid #1f2547", padding: "6px 0" }}>
              <div style={{ fontWeight: 600 }}>
                {v.verification_type} — {v.status}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                confidence {v.confidence ?? "n/a"}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title={`Ownership (${ownership_structures.length})`}>
          {ownership_structures[0] ? (
            <pre style={preStyle}>
              {JSON.stringify(ownership_structures[0].structure_json, null, 2)}
            </pre>
          ) : (
            <p style={{ color: "#94a3b8" }}>No structure yet.</p>
          )}
        </Panel>

        <Panel title={`Open tasks (${tasks.filter((t) => t.status === "open").length})`}>
          {tasks.length === 0 && <p style={{ color: "#94a3b8" }}>No tasks.</p>}
          {tasks.map((t) => (
            <div key={t.id} style={{ borderBottom: "1px solid #1f2547", padding: "6px 0" }}>
              <b>{t.task_type}</b> — {t.status}
            </div>
          ))}
        </Panel>

        <Panel title={`Screening (${screening.length})`}>
          {screening.length === 0 && <p style={{ color: "#94a3b8" }}>No screening hits.</p>}
          {screening.map((s) => (
            <div key={s.id} style={{ borderBottom: "1px solid #1f2547", padding: "6px 0" }}>
              <div style={{ fontWeight: 600 }}>
                {s.screening_type} — {s.disposition}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                {s.matched_name || s.query_name} · score {s.match_score ?? "n/a"}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Risk & Decision">
          {latestRisk ? (
            <>
              <KV k="Risk Level" v={latestRisk.risk_level || "—"} />
              <KV k="Score" v={String(latestRisk.total_score ?? "—")} />
              <KV k="EDD Required" v={latestRisk.edd_required ? "yes" : "no"} />
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>Triggered Rules</div>
                <ul style={{ margin: "4px 0 0 18px" }}>
                  {(latestRisk.triggered_rules || []).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p style={{ color: "#94a3b8" }}>No risk assessment yet.</p>
          )}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Decisions</div>
            {decisions.length === 0 && <span style={{ color: "#94a3b8" }}>None.</span>}
            {decisions.map((d) => (
              <div key={d.id} style={{ borderTop: "1px solid #1f2547", padding: "6px 0" }}>
                <b>{d.decision_type}</b>
                {d.decision_reason ? <> — {d.decision_reason}</> : null}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <CaseActions caseId={c.id} />
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "#11162b",
        border: "1px solid #1f2547",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: 16 }}>{title}</h2>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
      <span style={{ color: "#94a3b8", fontSize: 13 }}>{k}</span>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{v}</span>
    </div>
  );
}

const preStyle: React.CSSProperties = {
  background: "#0b1020",
  border: "1px solid #1f2547",
  borderRadius: 8,
  padding: 10,
  fontSize: 12,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
