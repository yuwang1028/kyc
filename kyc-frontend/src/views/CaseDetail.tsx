import * as React from "react";
import { useApp } from "@/state";
import { TopRow } from "@/components/blocks/TopRow";
import { PillButton } from "@/components/blocks/PillButton";
import { StatusPill, RiskPill } from "@/components/blocks/StatusPill";
import { AIDot } from "@/components/ai/AIDot";
import { SpringIn } from "@/components/ai/SpringIn";
import { StaggerList } from "@/components/ai/StaggerList";
import { StreamingText } from "@/components/ai/StreamingText";
import { api, type ApiCaseDetail, type WorkflowRunStatus, type LLMProviderSettings, type LLMInfraStatus } from "@/lib/api";
import {
  ShieldAlert,
  Sparkles,
  FileText,
  Activity,
  Gavel,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Upload,
  Trash2,
  Users,
  Plus,
  FlaskConical,
} from "lucide-react";

type TabId = "overview" | "documents" | "ownership" | "screening" | "risk" | "agents" | "decision" | "audit";

const tabs: { id: TabId; label: string }[] = [
  { id: "overview",   label: "Overview" },
  { id: "documents",  label: "Documents" },
  { id: "ownership",  label: "Ownership / UBO" },
  { id: "screening",  label: "Screening" },
  { id: "risk",       label: "Risk" },
  { id: "agents",     label: "AI agents" },
  { id: "decision",   label: "Decision" },
  { id: "audit",      label: "Audit" },
];

function riskLevelFromScore(s?: number | null) {
  if (s == null) return undefined;
  if (s >= 85) return "critical";
  if (s >= 70) return "high";
  if (s >= 40) return "medium";
  return "low";
}

function statusKind(status: string): "critical" | "ready" | "progress" | "resolved" | "warn" | "ok" | "active" {
  const s = status.toLowerCase();
  if (s === "rejected") return "critical";
  if (s === "approved") return "ok";
  if (s === "review") return "ready";
  if (s === "completed") return "resolved";
  return "active";
}

export function CaseDetail({ id }: { id: string }) {
  const { go } = useApp();
  const [tab, setTab] = React.useState<TabId>("overview");
  const [detail, setDetail] = React.useState<ApiCaseDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(() => {
    setLoading(true);
    api.getCase(id)
      .then((d) => { setDetail(d); setLoading(false); })
      .catch((e) => { setError((e as Error).message); setLoading(false); });
  }, [id]);

  React.useEffect(() => { reload(); }, [reload]);

  if (loading) {
    return (
      <div className="pl-5 pr-6 pt-4 min-h-screen flex items-center justify-center text-[14px] text-mute">
        Loading case…
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="pl-5 pr-6 pt-4 min-h-screen flex items-center justify-center text-[14px] text-mark-red">
        {error ?? "Case not found"}
      </div>
    );
  }

  const c = detail.case;
  const org = detail.organization;
  const title = org?.legal_name ?? `Case ${c.id.slice(0, 8)}`;
  const riskScore = c.risk_score;

  return (
    <div className="pl-5 pr-6 pt-4 pb-8 space-y-3 min-h-screen bg-[color-mix(in_srgb,var(--surface-mint)_18%,var(--surface-fog))]">
      <TopRow breadcrumb={{ label: title, chip: c.jurisdiction ?? "—" }} />

      <SpringIn>
        <section className="bg-white border border-divider rounded-md overflow-hidden">
          <div className="bg-surface-deep text-ink-inverse px-5 py-4 flex items-start justify-between gap-6">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] font-medium text-surface-sage mb-1">
                Case · {c.id.slice(0, 8)}…
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-[22px] font-bold tracking-[-0.01em]">{title}</div>
                  <div className="text-[13px] text-ink-inverse/80 mt-0.5">
                    {org?.business_description ?? `${c.case_type} · ${c.customer_type}`}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusPill label={c.status} kind={statusKind(c.status)} />
                <RiskPill level={riskLevelFromScore(riskScore)} />
                <span className="px-2.5 py-1 rounded-full bg-white/10 text-[12px] font-medium">{c.case_type}</span>
                {c.jurisdiction && (
                  <span className="px-2.5 py-1 rounded-full bg-white/10 text-[12px] font-medium">{c.jurisdiction}</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-[0.08em] font-medium text-ink-inverse/70">Risk score</div>
              <div className="text-[44px] font-bold tracking-[-0.02em] leading-none text-surface-sage">
                {riskScore?.toFixed(1) ?? "—"}
              </div>
              <div className="text-[11px] text-ink-inverse/60 mt-1">/ 100</div>
            </div>
          </div>

          <div className="flex items-center px-2 border-b border-divider bg-white">
            {tabs.map((t) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={
                    "px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.08em] -mb-px border-b-2 transition-colors " +
                    (active ? "text-surface-deep border-surface-deep" : "text-mute border-transparent hover:text-ink")
                  }
                >
                  {t.label}
                </button>
              );
            })}
            <div className="ml-auto pr-2 flex items-center gap-2">
              <button onClick={reload} className="text-[12px] text-mute hover:text-ink flex items-center gap-1">
                <RefreshCw size={12} /> Refresh
              </button>
              <button
                onClick={() => go({ kind: "cases" })}
                className="text-[12px] text-mute hover:text-ink flex items-center gap-1"
              >
                <ArrowLeft size={12} /> Back to cases
              </button>
            </div>
          </div>
        </section>
      </SpringIn>

      {tab === "overview"   && <Overview detail={detail} />}
      {tab === "documents"  && <Documents detail={detail} onRefresh={reload} />}
      {tab === "ownership"  && <Ownership detail={detail} onRefresh={reload} />}
      {tab === "screening"  && <Screening detail={detail} />}
      {tab === "risk"       && <Risk detail={detail} onRefresh={reload} />}
      {tab === "agents"     && <Agents detail={detail} onRefresh={reload} />}
      {tab === "decision"   && <Decision detail={detail} onRefresh={reload} />}
      {tab === "audit"      && <Audit detail={detail} />}
    </div>
  );
}

/* ── shared Panel ─────────────────────────────────────────────────── */
function Panel({
  eyebrow, title, action, children,
}: { eyebrow: string; title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-divider rounded-md overflow-hidden">
      <header className="px-4 py-2.5 border-b border-divider flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AIDot size={6} tone="deep" />
          <span className="text-[12px] tracking-[0.08em] uppercase text-surface-deep font-medium">{eyebrow}</span>
          {title && <span className="text-[12px] text-mute">{title}</span>}
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/* ── Overview ─────────────────────────────────────────────────────── */
function Overview({ detail }: { detail: ApiCaseDetail }) {
  const c = detail.case;
  const org = detail.organization;
  const latestRisk = detail.risk_assessments[0];
  const latestSummary = detail.agent_runs.find(
    (r) => r.agent_name === "decision_support_agent" || r.agent_name === "summary_agent" || r.agent_name === "summary"
  )?.output_payload;
  const summary = (latestSummary?.["executive_summary"] ?? latestSummary?.["summary"]) as string | undefined;

  const rows: [string, string][] = [
    ["Legal name", org?.legal_name ?? "—"],
    ["Case ID", c.id],
    ["Jurisdiction", c.jurisdiction ?? "—"],
    ["Case type", c.case_type],
    ["Status", c.status],
    ["Risk score", c.risk_score?.toFixed(1) ?? "—"],
    ["Priority", c.priority ?? "—"],
    ["Created", new Date(c.created_at).toLocaleString()],
  ];
  if (org?.registration_number) rows.push(["Reg. number", org.registration_number]);
  if (org?.website) rows.push(["Website", org.website]);

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="col-span-2 space-y-3">
        <Panel eyebrow="Agent summary" action={<Sparkles size={14} className="text-surface-deep" />}>
          <p className="text-[14px] text-ink leading-5.5">
            {summary ? (
              <StreamingText cps={80} caret={false} text={summary} />
            ) : (
              <span className="text-mute">No summary yet. Run the Summary agent from the AI agents tab.</span>
            )}
          </p>
        </Panel>
        <Panel eyebrow="Organization" title="Submitted information">
          <dl className="grid grid-cols-2 gap-y-3 gap-x-8 text-[14px]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-divider pb-2">
                <dt className="text-mute font-medium uppercase text-[11px] tracking-[0.06em]">{k}</dt>
                <dd className="text-right text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
      <div className="space-y-3">
        <Panel eyebrow="Pipeline" action={<Activity size={14} className="text-surface-deep" />}>
          <div className="text-[13px] text-mute mb-3">
            Risk level: <span className="font-bold text-ink">{latestRisk?.risk_level ?? "not evaluated"}</span>
          </div>
          <StaggerList step={60}>
            {detail.agent_runs.map((r, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 text-[13px]">
                <CheckCircle2 size={14} className="text-surface-deep" />
                <span className="text-ink">{r.agent_name} agent</span>
                <span className="text-[11px] text-mute ml-auto">{new Date(r.started_at).toLocaleTimeString()}</span>
              </div>
            ))}
            {detail.agent_runs.length === 0 && (
              <div className="text-[13px] text-mute">No agent runs yet.</div>
            )}
          </StaggerList>
        </Panel>
      </div>
    </div>
  );
}

function DocumentRow({
  doc,
  caseId,
  onDeleted,
}: {
  doc: ApiCaseDetail["documents"][number];
  caseId: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    if (!window.confirm(`Delete "${doc.file_name}"?`)) return;
    setDeleting(true);
    try {
      await api.deleteDocument(caseId, doc.id);
      onDeleted();
    } catch (e) {
      alert((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <div className="py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-md bg-surface-fog flex items-center justify-center shrink-0">
          <FileText size={14} className="text-mute" />
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-medium truncate">{doc.file_name}</div>
          <div className="text-[12px] text-mute">{doc.document_type}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusPill
          label={doc.processing_status ?? "pending"}
          kind={
            doc.processing_status === "parsed" || doc.processing_status === "uploaded"
              ? "ok"
              : doc.processing_status === "failed"
              ? "critical"
              : "warn"
          }
        />
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Delete document"
          className="w-7 h-7 flex items-center justify-center rounded-md text-mute hover:text-mark-red hover:bg-surface-fog disabled:opacity-40 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

const DOCUMENT_TYPES = [
  { value: "certificate_of_incorporation", label: "Certificate of incorporation" },
  { value: "ownership_chart", label: "Ownership chart" },
  { value: "ubo_declaration", label: "UBO declaration" },
  { value: "proof_of_address", label: "Proof of address" },
  { value: "audited_financials", label: "Audited financials" },
  { value: "business_license", label: "Business license" },
  { value: "passport", label: "Passport / ID" },
  { value: "other", label: "Other" },
];

/* ── Documents ────────────────────────────────────────────────────── */
function Documents({ detail, onRefresh }: { detail: ApiCaseDetail; onRefresh: () => void }) {
  const [docType, setDocType] = React.useState(DOCUMENT_TYPES[0].value);
  const [uploading, setUploading] = React.useState(false);
  const [loadingSamples, setLoadingSamples] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      await api.uploadDocument(detail.case.id, docType, file);
      onRefresh();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function loadAllSamples() {
    setLoadingSamples(true);
    setUploadError(null);
    try {
      const jur = detail.case.jurisdiction ?? "US";
      const res = await fetch(`/api/v1/cases/${detail.case.id}/load-samples?jurisdiction=${jur}`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Failed to load samples");
      }
      onRefresh();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setLoadingSamples(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-3">
      {/* Upload zone */}
      <Panel
        eyebrow="Upload"
        title="Add document"
        action={
          <PillButton variant="mint" size="sm" disabled={loadingSamples} onClick={loadAllSamples}>
            <FlaskConical size={13} />
            {loadingSamples ? "Loading…" : `Load all ${detail.case.jurisdiction ?? "US"} samples`}
          </PillButton>
        }
      >
        <div className="flex items-end gap-3 mb-4">
          <label className="block flex-1">
            <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-1.5">Document type</div>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full px-3 py-2 bg-surface-fog rounded-md text-[14px] outline-none focus:bg-white focus:ring-2 focus:ring-surface-deep"
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          <PillButton
            variant="primary"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={13} /> {uploading ? "Uploading…" : "Choose file"}
          </PillButton>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={onInputChange}
          />
        </div>

        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-divider rounded-md px-6 py-8 text-center hover:border-surface-deep hover:bg-surface-fog/50 transition-colors"
        >
          <Upload size={20} className="text-mute mx-auto mb-2" />
          <div className="text-[14px] font-medium">Drop PDF, PNG or JPG here</div>
          <div className="text-[12px] text-mute mt-1">or use the button above · max 20 MB</div>
        </div>

        {uploadError && (
          <div className="mt-3 text-[13px] text-mark-red">{uploadError}</div>
        )}
      </Panel>

      {/* Existing documents */}
      <Panel eyebrow="Evidence" title="Uploaded documents" action={<FileText size={14} className="text-surface-deep" />}>
        {detail.documents.length === 0 && (
          <p className="text-[14px] text-mute">No documents uploaded yet.</p>
        )}
        <div className="divide-y divide-divider">
          {detail.documents.map((d) => (
            <DocumentRow key={d.id} doc={d} caseId={detail.case.id} onDeleted={onRefresh} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ── Ownership / UBO ──────────────────────────────────────────────── */
const RELATION_TYPES = [
  { value: "ubo_candidate", label: "UBO (≥25% owner)" },
  { value: "shareholder",   label: "Shareholder" },
  { value: "director",      label: "Director" },
  { value: "control_person", label: "Control person" },
  { value: "signatory",     label: "Signatory" },
];

function Ownership({ detail, onRefresh }: { detail: ApiCaseDetail; onRefresh: () => void }) {
  const caseId = detail.case.id;
  const [form, setForm] = React.useState({
    legal_name: "",
    relation_type: "ubo_candidate",
    ownership_percentage: "",
    nationality: "",
    party_type: "individual",
  });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  function setF<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function addParty() {
    if (!form.legal_name.trim()) { setErr("Full name is required."); return; }
    setBusy(true); setErr(null);
    try {
      await api.addParty(caseId, {
        legal_name: form.legal_name.trim(),
        party_type: form.party_type,
        relation_type: form.relation_type,
        ownership_percentage: form.ownership_percentage ? parseFloat(form.ownership_percentage) : undefined,
        nationality: form.nationality || undefined,
        control_flag: form.relation_type === "control_person" || form.relation_type === "director",
      });
      setForm({ legal_name: "", relation_type: "ubo_candidate", ownership_percentage: "", nationality: "", party_type: "individual" });
      onRefresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const parties = detail.parties ?? [];
  const fieldCx = "w-full px-3 py-2 bg-surface-fog rounded-md text-[14px] outline-none focus:bg-white focus:ring-2 focus:ring-surface-deep";

  return (
    <div className="space-y-3">
      <Panel eyebrow="Add person / entity" title="Ownership structure" action={<Users size={14} className="text-surface-deep" />}>
        <div className="mb-4 px-4 py-3 rounded-md bg-amber-50 border border-amber-200 text-[13px] text-amber-800">
          <b>Important:</b> The Ownership Agent reads from this structured registry, not from uploaded PDFs.
          Add UBOs, directors, and shareholders here so the AI can reason about the ownership structure.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block">
            <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-1.5">Full legal name *</div>
            <input value={form.legal_name} onChange={(e) => setF("legal_name", e.target.value)}
              placeholder="Jane Smith" className={fieldCx} />
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-1.5">Role</div>
            <select value={form.relation_type} onChange={(e) => setF("relation_type", e.target.value)} className={fieldCx}>
              {RELATION_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-1.5">Type</div>
            <select value={form.party_type} onChange={(e) => setF("party_type", e.target.value)} className={fieldCx}>
              <option value="individual">Individual</option>
              <option value="entity">Corporate entity</option>
            </select>
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-1.5">Ownership %</div>
            <input type="number" min="0" max="100" step="0.1"
              value={form.ownership_percentage} onChange={(e) => setF("ownership_percentage", e.target.value)}
              placeholder="e.g. 75.0" className={fieldCx} />
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-1.5">Nationality / Country</div>
            <input value={form.nationality} onChange={(e) => setF("nationality", e.target.value)}
              placeholder="US" className={fieldCx} />
          </label>
        </div>

        {err && <div className="mt-3 text-[13px] text-mark-red">{err}</div>}

        <div className="mt-4">
          <PillButton variant="primary" size="sm" onClick={addParty} disabled={busy}>
            <Plus size={13} /> {busy ? "Adding…" : "Add to registry"}
          </PillButton>
        </div>
      </Panel>

      <Panel eyebrow="Registry" title={`${parties.length} registered ${parties.length === 1 ? "party" : "parties"}`}>
        {parties.length === 0 && (
          <p className="text-[14px] text-mute">
            No parties registered yet. Add UBOs and directors above so the Ownership Agent can evaluate the structure.
          </p>
        )}
        {parties.length > 0 && (
          <div className="divide-y divide-divider">
            {parties.map((p, i) => {
              const relLabel = RELATION_TYPES.find((r) => r.value === p.relation.relation_type)?.label ?? p.relation.relation_type;
              const pct = p.relation.ownership_percentage;
              const isUBO = p.relation.relation_type === "ubo_candidate" && (pct ?? 0) >= 25;
              return (
                <div key={i} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-surface-fog flex items-center justify-center shrink-0">
                      <Users size={13} className="text-mute" />
                    </div>
                    <div>
                      <div className="text-[14px] font-medium">{p.party.legal_name}</div>
                      <div className="text-[12px] text-mute">
                        {p.party.nationality && <>{p.party.nationality} · </>}
                        {p.party.party_type}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {pct != null && (
                      <span className="text-[13px] font-bold text-ink">{pct}%</span>
                    )}
                    <StatusPill
                      label={relLabel}
                      kind={isUBO ? "ready" : p.relation.control_flag ? "warn" : "active"}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ── Screening ────────────────────────────────────────────────────── */
function Screening({ detail }: { detail: ApiCaseDetail }) {
  return (
    <Panel eyebrow="Sanctions · PEP · Adverse media" title="Screening results">
      {detail.screening.length === 0 && (
        <p className="text-[14px] text-mute">No screening results yet. Run the workflow to screen this case.</p>
      )}
      {detail.screening.length > 0 && (
        <div className="overflow-hidden border border-divider rounded-md">
          <div className="grid grid-cols-[2fr_1fr_2fr_80px_140px] bg-surface-deep text-ink-inverse text-[11px] uppercase tracking-[0.08em] font-medium">
            <div className="px-4 py-2.5">Party</div>
            <div className="px-4 py-2.5">Type</div>
            <div className="px-4 py-2.5">Match</div>
            <div className="px-4 py-2.5">Score</div>
            <div className="px-4 py-2.5">Disposition</div>
          </div>
          {detail.screening.map((r, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_2fr_80px_140px] border-t border-divider text-[13px] hover:bg-surface-mint/40">
              <div className="px-4 py-3 font-medium">{r.query_name ?? "—"}</div>
              <div className="px-4 py-3">{r.screening_type}</div>
              <div className="px-4 py-3 text-mute">{r.matched_name ?? "—"}</div>
              <div className="px-4 py-3 font-bold">{r.match_score?.toFixed(0) ?? "—"}</div>
              <div className="px-4 py-3">
                <StatusPill
                  label={r.disposition ?? "pending"}
                  kind={r.disposition === "cleared" ? "ok" : r.disposition === "true_match" ? "critical" : "warn"}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── Risk ─────────────────────────────────────────────────────────── */
function Risk({ detail, onRefresh }: { detail: ApiCaseDetail; onRefresh: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const r = detail.risk_assessments[0];
  const score = r?.total_score ?? detail.case.risk_score;

  async function evaluate() {
    setBusy(true);
    try { await api.evaluateRisk(detail.case.id); onRefresh(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Panel
      eyebrow="Rules engine"
      title="Risk assessment"
      action={
        <PillButton variant="primary" size="sm" onClick={evaluate} disabled={busy}>
          <ShieldAlert size={14} /> {busy ? "Evaluating…" : "Re-evaluate"}
        </PillButton>
      }
    >
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface-fog rounded-md p-4">
          <div className="text-[11px] uppercase tracking-[0.08em] font-medium text-mute">Total score</div>
          <div className="text-[44px] font-bold tracking-[-0.02em] leading-none mt-1">
            {score?.toFixed(1) ?? "—"}
          </div>
          <div className="mt-2"><RiskPill level={riskLevelFromScore(score)} /></div>
        </div>
        <div className="col-span-2 space-y-3">
          {r && (
            <>
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] font-medium text-mute mb-1">
                  Risk level
                </div>
                <div className="text-[15px] font-bold">{r.risk_level ?? "—"}</div>
              </div>
              {r.triggered_rules && r.triggered_rules.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.08em] font-medium text-mute mb-2">
                    Triggered rules
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.triggered_rules.map((rule) => (
                      <span key={rule} className="px-2.5 py-1 rounded-full bg-surface-sage text-surface-deep text-[12px] font-medium">
                        {rule}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-[13px] text-mute">
                EDD required: <span className="font-bold text-ink">{r.edd_required ? "Yes" : "No"}</span>
              </div>
            </>
          )}
          {!r && (
            <div className="text-[14px] text-mute">No risk assessment yet. Click Re-evaluate or run the workflow.</div>
          )}
        </div>
      </div>
    </Panel>
  );
}

/* ── Workflow result breakdown ────────────────────────────────────── */
type PhaseOutput = Record<string, unknown>;
type WfResult = NonNullable<WorkflowRunStatus["result"]>;

function str(v: unknown): string { return typeof v === "string" ? v : ""; }
function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return [o.issue, o.description, o.action, o.required_action, o.impact]
      .filter(Boolean).map(String).join(" — ") || JSON.stringify(v);
  }
  return String(v ?? "");
}
function arr(v: unknown): string[] { return Array.isArray(v) ? v.map(toStr) : []; }

function WorkflowResult({ result }: { result: WfResult }) {
  const phaseMap = Object.fromEntries(result.phases.map((p) => [p.phase, p.output as PhaseOutput]));
  const review   = phaseMap["review"]   ?? {};
  const risk     = phaseMap["risk"]     ?? {};
  const ownership = phaseMap["ownership"] ?? {};
  const screening = phaseMap["screening"] ?? {};
  const intake   = phaseMap["intake"]   ?? {};

  const execSummary     = str(review["executive_summary"]);
  const openIssues      = arr(review["open_issues"]);
  const recommendation  = str(review["recommendation"] || risk["recommended_disposition"]);
  const reviewerChecklist = arr(review["reviewer_checklist"]);

  const triggeredRules  = arr(risk["triggered_rules"]);
  const riskNarrative   = str(risk["risk_narrative"] || risk["agent_reasoning"]);
  const eddRequired     = Boolean(risk["edd_required"]);

  const ownershipNarrative = str(ownership["ownership_narrative"] || ownership["agent_reasoning"]);
  const screeningNarrative = str(screening["screening_narrative"]);
  const intakeNotes        = arr(intake["document_quality_notes"]);

  const DISP_LABEL: Record<string, string> = {
    approve_with_standard_monitoring: "Approve — standard monitoring",
    escalate:                         "Escalate to EDD",
    pending_human_review:             "Pending human review",
    reject:                           "Reject",
  };
  const dispKind: "ok" | "warn" | "critical" =
    recommendation.startsWith("approve") ? "ok" :
    recommendation === "reject"          ? "critical" : "warn";

  return (
    <div className="mt-4 space-y-4 border-t border-divider pt-4">

      {/* Status bar + phase badges */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            label={result.stopped_early ? "stopped early" : result.final_status.replace(/_/g, " ")}
            kind={result.stopped_early ? "critical" : "ok"}
          />
          {result.risk_level && (
            <RiskPill level={result.risk_level as "low" | "medium" | "high" | "critical" | undefined} />
          )}
          {result.risk_score != null && (
            <span className="text-[13px] font-bold text-ink">
              Score: {Number(result.risk_score).toFixed(1)}
            </span>
          )}
          {eddRequired && (
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[12px] font-bold">
              EDD required
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PHASE_ORDER.map((name) => {
            const phase = result.phases.find((p) => p.phase === name);
            const s = phase?.status || "pending";
            const color = PHASE_COLOR[s] ?? "#334155";
            return (
              <span key={name} className="text-[11px] font-semibold px-2 py-0.5 rounded border"
                style={{ background: `${color}22`, borderColor: color, color }}>
                {name}
              </span>
            );
          })}
        </div>

        {result.stopped_early && (
          <p className="text-[13px] text-amber-600 font-medium">
            Workflow stopped early — complete intake fields before re-running.
          </p>
        )}
      </div>

      {/* Executive summary */}
      {execSummary && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-1.5">Executive summary</div>
          <p className="text-[14px] text-ink leading-relaxed bg-surface-fog rounded-md px-4 py-3">{execSummary}</p>
        </div>
      )}

      {/* Recommendation */}
      {recommendation && (
        <div className="flex items-center gap-3">
          <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute">Recommendation</div>
          <StatusPill label={DISP_LABEL[recommendation] ?? recommendation.replace(/_/g, " ")} kind={dispKind} />
        </div>
      )}

      {/* Triggered rules */}
      {triggeredRules.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-2">Triggered rules</div>
          <div className="flex flex-wrap gap-2">
            {triggeredRules.map((r) => (
              <span key={r} className="px-2.5 py-1 rounded-full bg-surface-sage text-surface-deep text-[12px] font-medium">
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Risk narrative */}
      {riskNarrative && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-1.5">Risk agent reasoning</div>
          <p className="text-[13px] text-mute leading-relaxed">{riskNarrative}</p>
        </div>
      )}

      {/* Ownership narrative */}
      {ownershipNarrative && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-1.5">Ownership assessment</div>
          <p className="text-[13px] text-mute leading-relaxed">{ownershipNarrative}</p>
        </div>
      )}

      {/* Screening summary */}
      {screeningNarrative && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-1">Screening</div>
          <p className="text-[13px] text-mute">{screeningNarrative}</p>
        </div>
      )}

      {/* Open issues */}
      {openIssues.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-2">Open issues</div>
          <ul className="space-y-1">
            {openIssues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-ink">
                <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reviewer checklist */}
      {reviewerChecklist.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-2">Reviewer checklist</div>
          <ul className="space-y-1">
            {reviewerChecklist.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-mute">
                <CheckCircle2 size={13} className="text-surface-deep mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Document quality notes */}
      {intakeNotes.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-2">Document quality notes</div>
          <ul className="space-y-1">
            {intakeNotes.map((note, i) => (
              <li key={i} className="text-[13px] text-mute leading-snug">· {note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── LLM Provider selector ────────────────────────────────────────── */
type ProviderKey = "ollama" | "vertex" | "vllm" | "nim";

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  ollama: "Local — Ollama",
  vertex: "Google Vertex AI",
  vllm:   "vLLM (NVIDIA GPU)",
  nim:    "NVIDIA NIM",
};

function ModelSelector({
  providerCfg,
  selected,
  onChange,
}: {
  providerCfg: LLMProviderSettings | null;
  selected: ProviderKey;
  onChange: (p: ProviderKey) => void;
}) {
  const ollamaModel = providerCfg?.ollama.model ?? "qwen2.5:7b";
  const vertexOk    = providerCfg?.vertex.configured ?? false;
  const vllmOk      = providerCfg?.vllm.configured   ?? false;
  const nimOk       = providerCfg?.nim.configured     ?? false;

  function subtitle(p: ProviderKey): string {
    if (p === "ollama") return ollamaModel;
    if (p === "vertex") return vertexOk ? "2.5-flash-lite / 2.5-flash / 2.5-pro" : "not configured";
    if (p === "vllm")   return vllmOk   ? `${providerCfg?.vllm.model ?? "llama-3.1"} · PagedAttention` : "set VLLM_BASE_URL in .env";
    if (p === "nim")    return nimOk     ? "8B / 70B / 405B · Llama 3.1" : "not configured";
    return "not configured";
  }

  const providers: ProviderKey[] = ["ollama", "vertex", "vllm", "nim"];
  const isDisabled = (p: ProviderKey) =>
    (p === "vertex" && !vertexOk) ||
    (p === "vllm"   && !vllmOk)   ||
    (p === "nim"    && !nimOk);

  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {providers.map((p) => {
        const active   = selected === p;
        const disabled = isDisabled(p);
        return (
          <button
            key={p}
            onClick={() => !disabled && onChange(p)}
            disabled={disabled}
            className={
              "rounded-md border-2 px-3 py-2.5 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed " +
              (active
                ? "border-surface-deep bg-surface-deep text-ink-inverse"
                : "border-divider bg-surface-fog hover:border-surface-deep/50 text-ink")
            }
          >
            <div className="text-[12px] font-bold mb-0.5">{PROVIDER_LABELS[p]}</div>
            <div className={`text-[11px] ${active ? "text-ink-inverse/70" : "text-mute"}`}>
              {subtitle(p)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function InfraPanel({ infra }: { infra: LLMInfraStatus | null }) {
  if (!infra) return null;
  const CB_COLOR: Record<string, string> = {
    closed: "#22c55e", open: "#ef4444", "half-open": "#f59e0b",
  };
  return (
    <Panel eyebrow="AI Infrastructure" title="NVIDIA / Provider status" action={<Activity size={14} className="text-surface-deep" />}>
      <div className="space-y-3 text-[13px]">
        <div className="flex gap-2 flex-wrap">
          {Object.entries(infra.providers).map(([name, p]) => (
            <div key={name} className="border border-divider rounded-md px-3 py-2 bg-surface-fog min-w-[140px]">
              <div className="font-bold capitalize mb-1">{name}</div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: CB_COLOR[p.circuit_breaker] ?? "#64748b" }}
                />
                <span className="text-mute text-[11px]">{p.circuit_breaker}</span>
              </div>
              <div className="text-mute text-[11px] mt-0.5">{p.runtime}</div>
              {p.model && <div className="text-mute text-[11px] truncate">{p.model}</div>}
              {!p.configured && <div className="text-[11px] text-amber-500 mt-0.5">not configured</div>}
            </div>
          ))}
        </div>

        <div>
          <div className="font-bold mb-1 text-mute uppercase text-[11px] tracking-wide">Tier routing</div>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-mute border-b border-divider">
                <th className="text-left py-0.5 pr-2">Tier</th>
                <th className="text-left py-0.5 pr-2">Ollama</th>
                <th className="text-left py-0.5 pr-2">Vertex</th>
                <th className="text-left py-0.5">NIM</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(infra.tier_routing).map(([tier, row]) => (
                <tr key={tier} className="border-b border-divider/50 last:border-0">
                  <td className="py-0.5 pr-2 font-bold capitalize">{tier}</td>
                  <td className="py-0.5 pr-2 text-mute">{row.ollama}</td>
                  <td className="py-0.5 pr-2 text-mute">{row.vertex}</td>
                  <td className="py-0.5 text-mute">{row.nim}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {Object.keys(infra.prefix_cache.tracker).length > 0 && (
          <div>
            <div className="font-bold mb-1 text-mute uppercase text-[11px] tracking-wide">KV Cache (prefix)</div>
            {Object.entries(infra.prefix_cache.tracker).map(([kind, s]) => (
              <div key={kind} className="flex justify-between text-[11px] py-0.5">
                <span className="text-mute capitalize">{kind}</span>
                <span className="text-green-400">{(s.hit_rate * 100).toFixed(1)}% hit · {s.calls} calls</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ── Agents + Workflow runner ─────────────────────────────────────── */
const POLL_MS = 2000;
const PHASE_ORDER = ["intake", "verification", "screening", "ownership", "risk", "review"];
const RUN_COLOR: Record<string, string> = {
  pending: "#f59e0b", running: "#3b82f6", completed: "#22c55e", failed: "#ef4444",
};
const PHASE_COLOR: Record<string, string> = {
  completed: "#22c55e", skipped: "#64748b", pending: "#334155",
};

function Agents({ detail, onRefresh }: { detail: ApiCaseDetail; onRefresh: () => void }) {
  const caseId = detail.case.id;
  const [busy, setBusy] = React.useState(false);
  const [runStatus, setRunStatus] = React.useState<WorkflowRunStatus | null>(null);
  const [runError, setRunError] = React.useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [providerCfg, setProviderCfg] = React.useState<LLMProviderSettings | null>(null);
  const [selectedProvider, setSelectedProvider] = React.useState<ProviderKey>("ollama");
  const [infra, setInfra] = React.useState<LLMInfraStatus | null>(null);

  React.useEffect(() => {
    api.getLLMProvider().then((cfg) => {
      setProviderCfg(cfg);
      setSelectedProvider(cfg.active);
    }).catch(() => {});
    api.getLLMInfra().then(setInfra).catch(() => {});
  }, []);

  async function handleProviderChange(p: ProviderKey) {
    setSelectedProvider(p);
    await api.setLLMProvider(p).catch(() => {});
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function pollRun(runId: string) {
    try {
      const s = await api.getWorkflowRun(caseId, runId);
      setRunStatus(s);
      if (s.status === "completed" || s.status === "failed") {
        stopPolling(); setBusy(false); onRefresh();
      }
    } catch {
      stopPolling(); setBusy(false);
      setRunError("Lost connection while polling.");
    }
  }

  // On mount: load the latest run so results persist across page loads / tab switches
  React.useEffect(() => {
    let cancelled = false;
    api.getLatestWorkflowRun(caseId).then((s) => {
      if (cancelled) return;
      setRunStatus(s);
      // If still in-flight, resume polling
      if (s.status === "pending" || s.status === "running") {
        setBusy(true);
        pollRef.current = setInterval(() => pollRun(s.run_id), POLL_MS);
      }
    }).catch(() => {}); // 404 = no prior runs, that's fine
    return () => { cancelled = true; stopPolling(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function runWorkflow() {
    setBusy(true); setRunError(null); setRunStatus(null); stopPolling();
    try {
      const { run_id } = await api.runWorkflow(caseId);
      await pollRun(run_id);
      pollRef.current = setInterval(() => pollRun(run_id), POLL_MS);
    } catch (e) {
      setRunError((e as Error).message); setBusy(false);
    }
  }

  const result = runStatus?.result;

  return (
    <div className="space-y-3">
      {/* LLM provider selector */}
      <Panel eyebrow="AI provider" action={<Sparkles size={14} className="text-surface-deep" />}>
        <ModelSelector
          providerCfg={providerCfg}
          selected={selectedProvider}
          onChange={handleProviderChange}
        />
      </Panel>

      {/* NVIDIA / provider infra status */}
      <InfraPanel infra={infra} />

      {/* Workflow runner */}
      <Panel eyebrow="Onboarding pipeline" action={<Sparkles size={14} className="text-surface-deep" />}>
        <p className="text-[13px] text-mute mb-3">
          Runs all 6 phases (intake → verification → screening → ownership → risk → review) using Qwen 2.5 7B agents.
        </p>
        {runError && <div className="text-[13px] text-mark-red mb-3">{runError}</div>}
        <PillButton variant="primary" size="sm" onClick={runWorkflow} disabled={busy}>
          {busy ? "Running pipeline…" : "Run full workflow"}
        </PillButton>

        {runStatus && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <span
                className="text-[12px] font-bold px-3 py-0.5 rounded-full border"
                style={{
                  background: `${RUN_COLOR[runStatus.status] ?? "#334155"}22`,
                  color: RUN_COLOR[runStatus.status] ?? "#94a3b8",
                  borderColor: RUN_COLOR[runStatus.status] ?? "#334155",
                }}
              >
                {runStatus.status}
              </span>
              {runStatus.elapsed_seconds != null && (
                <span className="text-[12px] text-mute">{runStatus.elapsed_seconds.toFixed(1)}s</span>
              )}
              {runStatus.slow_warning && (
                <span className="text-[12px] text-amber-500">⚠ slow run</span>
              )}
            </div>

            {result && <WorkflowResult result={result} />}
          </div>
        )}
      </Panel>

      {/* Individual agents */}
      <div className="grid grid-cols-2 gap-3">
        <IntakeAgentPanel caseId={caseId} detail={detail} onRefresh={onRefresh} />
        <SummaryAgentPanel caseId={caseId} detail={detail} onRefresh={onRefresh} />
      </div>

      {/* Agent run history */}
      <Panel eyebrow="History" title="Agent runs" action={<Activity size={14} className="text-surface-deep" />}>
        {detail.agent_runs.length === 0 && (
          <div className="text-[14px] text-mute">No agent runs yet.</div>
        )}
        <StaggerList step={60}>
          {detail.agent_runs.map((r, i) => (
            <div key={i} className="border-b border-divider last:border-b-0 py-3 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-mint flex items-center justify-center shrink-0">
                <Sparkles size={14} className="text-surface-deep" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold">{r.agent_name} agent</span>
                  <span className="text-[11px] text-mute">· {new Date(r.started_at).toLocaleString()}</span>
                </div>
                <div className="text-[13px] text-mute mt-0.5">
                  {(r.output_payload?.["summary"] as string) ?? JSON.stringify(r.output_payload).slice(0, 120)}
                </div>
              </div>
              <StatusPill label="completed" kind="ok" />
            </div>
          ))}
        </StaggerList>
      </Panel>
    </div>
  );
}

function IntakeAgentPanel({ caseId, detail, onRefresh }: { caseId: string; detail: ApiCaseDetail; onRefresh: () => void }) {
  const latest = detail.agent_runs.find((r) => r.agent_name === "intake_agent");
  const [result, setResult] = React.useState<Record<string, unknown> | null>(latest?.output_payload ?? null);
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    try {
      const r = await api.runIntakeAgent(caseId);
      setResult(r.output_payload);
      onRefresh();
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  const score = result ? Number(result["intake_completeness_score"] ?? 0) : null;
  const missingFields = Array.isArray(result?.["missing_fields"]) ? result!["missing_fields"] as string[] : [];
  const missingDocs   = Array.isArray(result?.["missing_docs"])   ? result!["missing_docs"]   as string[] : [];
  const nextActions   = Array.isArray(result?.["next_actions"])   ? result!["next_actions"]   as string[] : [];
  const remediation   = Array.isArray(result?.["remediation_plan"]) ? result!["remediation_plan"] as string[] : [];
  const qualityNotes  = Array.isArray(result?.["document_quality_notes"]) ? result!["document_quality_notes"] as string[] : [];
  const reasoning     = typeof result?.["agent_reasoning"] === "string" ? result!["agent_reasoning"] as string : "";

  const scoreColor = score == null ? "#94a3b8" : score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <Panel eyebrow="Intake agent" action={<Sparkles size={14} className="text-surface-deep" />}>
      <p className="text-[13px] text-mute leading-5 mb-3">Validates org fields and documents against the policy pack.</p>
      <PillButton variant="primary" size="sm" onClick={run} disabled={busy}>
        {busy ? "Running…" : "Run intake agent"}
      </PillButton>

      {result && (
        <div className="mt-4 space-y-3 border-t border-divider pt-4">
          {/* Completeness score */}
          <div className="flex items-end gap-2">
            <span className="text-[38px] font-bold leading-none" style={{ color: scoreColor }}>{score}</span>
            <span className="text-[13px] text-mute mb-1">/ 100 completeness</span>
          </div>

          {/* Status chips */}
          <div className="flex flex-wrap gap-1.5">
            {nextActions.map((a) => (
              <span key={a} className="px-2 py-0.5 rounded-full bg-surface-mint text-surface-deep text-[11px] font-bold">
                {a.replace(/_/g, " ")}
              </span>
            ))}
          </div>

          {/* Missing items */}
          {(missingFields.length > 0 || missingDocs.length > 0) && (
            <div className="space-y-1">
              {missingFields.map((f) => (
                <div key={f} className="flex items-center gap-1.5 text-[12px] text-mark-red">
                  <XCircle size={12} /> Missing field: {f}
                </div>
              ))}
              {missingDocs.map((d) => (
                <div key={d} className="flex items-center gap-1.5 text-[12px] text-mark-red">
                  <XCircle size={12} /> Missing doc: {d}
                </div>
              ))}
            </div>
          )}
          {missingFields.length === 0 && missingDocs.length === 0 && (
            <div className="flex items-center gap-1.5 text-[12px] text-surface-deep font-medium">
              <CheckCircle2 size={12} /> All required fields and documents present
            </div>
          )}

          {/* Agent reasoning */}
          {reasoning && (
            <p className="text-[12px] text-mute leading-relaxed">{reasoning}</p>
          )}

          {/* Remediation plan */}
          {remediation.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-1">Remediation plan</div>
              <ul className="space-y-0.5">
                {remediation.map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[12px] text-ink">
                    <AlertTriangle size={11} className="text-amber-500 mt-0.5 shrink-0" />{item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Document quality notes */}
          {qualityNotes.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-1">Document quality</div>
              <ul className="space-y-0.5">
                {qualityNotes.map((note, i) => (
                  <li key={i} className="text-[12px] text-mute">· {note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function SummaryAgentPanel({ caseId, detail, onRefresh }: { caseId: string; detail: ApiCaseDetail; onRefresh: () => void }) {
  const latest = detail.agent_runs.find((r) => r.agent_name === "decision_support_agent" || r.agent_name === "summary_agent");
  const [result, setResult] = React.useState<Record<string, unknown> | null>(latest?.output_payload ?? null);
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    try {
      const r = await api.runSummaryAgent(caseId);
      setResult(r.output_payload);
      onRefresh();
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  const execSummary    = typeof result?.["executive_summary"] === "string" ? result!["executive_summary"] as string : "";
  const recommendation = typeof result?.["recommendation"]    === "string" ? result!["recommendation"]    as string : "";
  const openIssues     = Array.isArray(result?.["open_issues"])     ? result!["open_issues"]     as string[] : [];
  const checklist      = Array.isArray(result?.["reviewer_checklist"]) ? result!["reviewer_checklist"] as string[] : [];
  const reviewerNotes  = typeof result?.["reviewer_notes"] === "string" ? result!["reviewer_notes"] as string : "";

  const DISP_LABEL: Record<string, string> = {
    approve_with_standard_monitoring: "Approve — standard monitoring",
    escalate: "Escalate to EDD",
    pending_human_review: "Pending human review",
    reject: "Reject",
  };
  const dispKind: "ok" | "warn" | "critical" =
    recommendation.startsWith("approve") ? "ok" : recommendation === "reject" ? "critical" : "warn";

  return (
    <Panel eyebrow="Summary agent" action={<Sparkles size={14} className="text-surface-deep" />}>
      <p className="text-[13px] text-mute leading-5 mb-3">Produces an analyst-ready decision memo with open issues and a reviewer checklist.</p>
      <PillButton variant="primary" size="sm" onClick={run} disabled={busy}>
        {busy ? "Running…" : "Run summary agent"}
      </PillButton>

      {result && (
        <div className="mt-4 space-y-3 border-t border-divider pt-4">
          {/* Executive summary */}
          {execSummary && (
            <p className="text-[13px] text-ink leading-relaxed bg-surface-fog rounded-md px-3 py-2.5">{execSummary}</p>
          )}

          {/* Recommendation */}
          {recommendation && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute">Recommendation</span>
              <StatusPill label={DISP_LABEL[recommendation] ?? recommendation.replace(/_/g, " ")} kind={dispKind} />
            </div>
          )}

          {/* Open issues */}
          {openIssues.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-1">Open issues</div>
              <ul className="space-y-0.5">
                {openIssues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[12px] text-ink">
                    <AlertTriangle size={11} className="text-amber-500 mt-0.5 shrink-0" />{issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reviewer checklist */}
          {checklist.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-mute mb-1">Reviewer checklist</div>
              <ul className="space-y-0.5">
                {checklist.map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[12px] text-mute">
                    <CheckCircle2 size={11} className="text-surface-deep mt-0.5 shrink-0" />{item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reviewer notes */}
          {reviewerNotes && (
            <p className="text-[12px] text-mute italic">{reviewerNotes}</p>
          )}
        </div>
      )}
    </Panel>
  );
}

/* ── Decision ─────────────────────────────────────────────────────── */
function Decision({ detail, onRefresh }: { detail: ApiCaseDetail; onRefresh: () => void }) {
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [chosen, setChosen] = React.useState<string | null>(null);
  const latest = detail.decisions[0];

  async function decide(type: string) {
    setBusy(true); setChosen(type);
    try {
      await api.decide(detail.case.id, { decision_type: type, decision_notes: notes || undefined });
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false); setChosen(null);
    }
  }

  return (
    <Panel eyebrow="Final action" title="Record decision" action={<Gavel size={14} className="text-surface-deep" />}>
      {latest && (
        <div className="mb-4 px-4 py-3 bg-surface-fog rounded-md text-[13px]">
          Latest decision: <b>{latest.decision_type}</b>
          {latest.decision_notes && <> · {latest.decision_notes}</>}
          <span className="text-mute ml-2">{new Date(latest.created_at).toLocaleString()}</span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => decide("approved")}
          disabled={busy}
          className="ui-pill text-left bg-white border border-divider rounded-md p-4 hover:border-surface-deep disabled:opacity-50"
        >
          <CheckCircle2 size={20} className="text-surface-deep mb-2" />
          <div className="text-[14px] font-bold">Approve</div>
          <div className="text-[12px] text-mute mt-1">Onboarding completes, monitoring engaged.</div>
          {busy && chosen === "approved" && <div className="text-[11px] text-mute mt-1">Recording…</div>}
        </button>
        <button
          onClick={() => decide("edd")}
          disabled={busy}
          className="ui-pill text-left bg-white border border-divider rounded-md p-4 hover:border-surface-deep disabled:opacity-50"
        >
          <AlertTriangle size={20} className="text-surface-deep mb-2" />
          <div className="text-[14px] font-bold">Escalate to EDD</div>
          <div className="text-[12px] text-mute mt-1">Open EDD checklist · assign specialist.</div>
        </button>
        <button
          onClick={() => decide("rejected")}
          disabled={busy}
          className="ui-pill text-left bg-white border border-divider rounded-md p-4 hover:border-mark-red disabled:opacity-50"
        >
          <XCircle size={20} className="text-mark-red mb-2" />
          <div className="text-[14px] font-bold">Reject</div>
          <div className="text-[12px] text-mute mt-1">Decline onboarding, log to SAR queue.</div>
        </button>
      </div>
      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-[0.08em] font-medium text-mute mb-1">Decision notes</div>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional analyst rationale…"
          className="w-full px-3 py-2 bg-surface-fog rounded-md text-[14px] outline-none focus:bg-white focus:ring-2 focus:ring-surface-deep"
        />
      </div>
    </Panel>
  );
}

/* ── Audit ────────────────────────────────────────────────────────── */
function Audit({ detail }: { detail: ApiCaseDetail }) {
  type AuditEvent = { ts: string; type: string; who: string; text: string };
  const events: AuditEvent[] = [
    ...detail.decisions.map((d) => ({
      ts: new Date(d.created_at).toLocaleString(),
      type: `decision.${d.decision_type}`,
      who: "Analyst",
      text: d.decision_notes ?? d.decision_reason ?? `Decision: ${d.decision_type}`,
    })),
    ...detail.agent_runs.map((r) => ({
      ts: new Date(r.started_at).toLocaleString(),
      type: `agent.${r.agent_name}`,
      who: `${r.agent_name} agent`,
      text: (r.output_payload?.["summary"] as string) ?? "Agent run completed.",
    })),
    ...detail.screening.map((s) => ({
      ts: new Date(s.created_at).toLocaleString(),
      type: `screening.${s.screening_type}`,
      who: "Screening engine",
      text: `${s.query_name ?? "Party"} · ${s.disposition ?? "pending"} (score: ${s.match_score ?? "—"})`,
    })),
    ...detail.documents.map((d) => ({
      ts: new Date(d.created_at).toLocaleString(),
      type: "document.uploaded",
      who: "Client portal",
      text: `${d.file_name} uploaded (${d.document_type})`,
    })),
    {
      ts: new Date(detail.case.created_at).toLocaleString(),
      type: "case.created",
      who: "System",
      text: "Case created.",
    },
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return (
    <Panel eyebrow="Compliance" title="Audit trail">
      {events.length === 0 && <div className="text-[14px] text-mute">No events yet.</div>}
      <StaggerList step={50}>
        {events.map((e, i) => (
          <div key={i} className="border-b border-divider last:border-b-0 py-2.5 flex items-start gap-3 text-[13px]">
            <div className="w-2 h-2 rounded-full bg-surface-deep mt-1.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-mute font-mono text-[11px]">{e.ts}</span>
                <span className="px-1.5 py-0.5 rounded bg-surface-fog text-[11px] font-medium">{e.type}</span>
                <span className="text-[11px] text-mute">{e.who}</span>
              </div>
              <div className="text-ink mt-0.5">{e.text}</div>
            </div>
          </div>
        ))}
      </StaggerList>
    </Panel>
  );
}
