import * as React from "react";
import { useApp } from "@/state";
import { TopRow } from "@/components/blocks/TopRow";
import { PillButton } from "@/components/blocks/PillButton";
import { StatusPill, RiskPill } from "@/components/blocks/StatusPill";
import { AIDot } from "@/components/ai/AIDot";
import { SpringIn } from "@/components/ai/SpringIn";
import { StaggerList } from "@/components/ai/StaggerList";
import { StreamingText } from "@/components/ai/StreamingText";
import { api, type ApiCaseDetail, type ApiOrganization, type WorkflowRunStatus } from "@/lib/api";
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
  Mail,
  Send,
  Clock,
  Search,
  ExternalLink,
  ChevronDown,
  X,
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
        action={<Upload size={14} className="text-surface-deep" />}
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

/* ── AI Agents tab — enterprise decision workbench ────────────────── */
type PhaseOutput = Record<string, unknown>;
type WfResult = NonNullable<WorkflowRunStatus["result"]>;
function str(v: unknown): string { return typeof v === "string" ? v : ""; }
function arr(v: unknown): string[] { return Array.isArray(v) ? v.map(String) : []; }

const POLL_MS = 2000;
const PHASE_ORDER = ["intake", "verification", "screening", "ownership", "risk", "review"];
const RUN_COLOR: Record<string, string> = {
  pending: "#f59e0b", running: "#3b82f6", completed: "#22c55e", failed: "#ef4444",
};

const DISP_LABEL: Record<string, string> = {
  approve_with_standard_monitoring: "Approve — standard monitoring",
  escalate: "Escalate to EDD",
  pending_human_review: "Pending human review",
  reject: "Reject",
};

const REASON_CODES = [
  "Confirmed false positive",
  "Name match only — no other identifiers",
  "Verified against primary evidence",
  "Within risk appetite",
  "Requires enhanced due diligence",
  "Requires client information",
  "Data quality issue",
];

type Severity = "high" | "med" | "info";
type Finding = {
  id: string;
  severity: Severity;
  title: string;
  code: string;
  sourceLabel: string;
  kind: "document" | "field" | "screening";
  docType?: string;
  reasoning: string;
};

const RULE_META: Record<string, { title: string; docType?: string; sourceLabel: string; kind: "document" | "field"; reasoning: string }> = {
  HIGH_RISK_INDUSTRY: {
    title: "High-risk industry", docType: "certificate_of_incorporation",
    sourceLabel: "Certificate of incorporation", kind: "document",
    reasoning: "The declared business activity classifies as a high-risk industry under the active policy pack. Review the activity stated on the certificate of incorporation.",
  },
  HIGH_RISK_CORRIDOR: {
    title: "High-risk corridor", sourceLabel: "Org profile · jurisdiction", kind: "field",
    reasoning: "Incorporation country combined with the cross-border corridor sits on the elevated-risk list. This is derived from structured org fields rather than a single uploaded document.",
  },
  TRANSACTION_VOLUME_VERY_HIGH: {
    title: "Very high transaction volume", docType: "audited_financials",
    sourceLabel: "Audited financials", kind: "document",
    reasoning: "Declared annual transaction volume exceeds the very-high threshold in the rules engine. Cross-check the figure on the audited financials against the intake declaration.",
  },
};

function SeverityDot({ s }: { s: Severity }) {
  const c = s === "high" ? "bg-mark-red" : s === "med" ? "bg-[color:var(--surface-sage)]" : "bg-surface-deep";
  return <span className={"w-2.5 h-2.5 rounded-full shrink-0 " + c} />;
}

function buildFindings(detail: ApiCaseDetail, phaseMap: Record<string, PhaseOutput>): Finding[] {
  const out: Finding[] = [];
  const risk = phaseMap["risk"] ?? {};
  const triggered = arr(risk["triggered_rules"]);
  const rules = triggered.length ? triggered : (detail.risk_assessments[0]?.triggered_rules ?? []);
  rules.forEach((rule, i) => {
    const m = RULE_META[rule];
    out.push({
      id: "rule-" + i,
      severity: "high",
      title: m?.title ?? rule.replace(/_/g, " ").toLowerCase(),
      code: rule,
      sourceLabel: m?.sourceLabel ?? "Risk rule",
      kind: m?.kind ?? "field",
      docType: m?.docType,
      reasoning: m?.reasoning || str(risk["risk_narrative"] || risk["agent_reasoning"]) || "Triggered by the rules engine.",
    });
  });
  const screening = phaseMap["screening"] ?? {};
  const fps = Array.isArray(screening["likely_false_positives"]) ? (screening["likely_false_positives"] as Record<string, unknown>[]) : [];
  fps.forEach((fp, i) => {
    const name = str(fp["query_name"]) || "party";
    const st = str(fp["screening_type"]) || "screening";
    out.push({
      id: "scr-" + i, severity: "info",
      title: "Screening — likely false positive", code: st + " · " + name,
      sourceLabel: "Screening detail", kind: "screening",
      reasoning: "Adverse-media / list match assessed as a likely false positive. Confirm the disposition against the matched record before escalation.",
    });
  });
  const intake = phaseMap["intake"] ?? {};
  const dq = arr(intake["document_quality_notes"]);
  if (dq.length) {
    out.push({
      id: "dq-0", severity: "med",
      title: "Document quality note", code: "document_quality",
      sourceLabel: "Certificate of incorporation", kind: "document", docType: "certificate_of_incorporation",
      reasoning: dq[0],
    });
  }
  return out;
}

function Agents({ detail, onRefresh }: { detail: ApiCaseDetail; onRefresh: () => void }) {
  const caseId = detail.case.id;
  const [busy, setBusy] = React.useState(false);
  const [runStatus, setRunStatus] = React.useState<WorkflowRunStatus | null>(null);
  const [runError, setRunError] = React.useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const [drawer, setDrawer] = React.useState<{ type: "evidence" | "edd" | "rfi"; finding?: Finding } | null>(null);
  const [dispo, setDispo] = React.useState<Record<string, { action: string; reason: string }>>({});
  const [maker, setMaker] = React.useState<string | null>(null);
  const [rfiItems, setRfiItems] = React.useState<string[] | null>(null);
  const [toastMsg, setToastMsg] = React.useState<string | null>(null);
  const toastRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  function toast(m: string) {
    setToastMsg(m);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToastMsg(null), 2800);
  }

  function stopPolling() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }
  async function pollRun(runId: string) {
    try {
      const s = await api.getWorkflowRun(caseId, runId);
      setRunStatus(s);
      if (s.status === "completed" || s.status === "failed") { stopPolling(); setBusy(false); onRefresh(); }
    } catch { stopPolling(); setBusy(false); setRunError("Lost connection while polling."); }
  }
  React.useEffect(() => {
    let cancelled = false;
    api.getLatestWorkflowRun(caseId).then((s) => {
      if (cancelled) return;
      setRunStatus(s);
      if (s.status === "pending" || s.status === "running") {
        setBusy(true);
        pollRef.current = setInterval(() => pollRun(s.run_id), POLL_MS);
      }
    }).catch(() => {});
    return () => { cancelled = true; stopPolling(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);
  async function runWorkflow() {
    setBusy(true); setRunError(null); setRunStatus(null); stopPolling();
    try {
      const { run_id } = await api.runWorkflow(caseId);
      await pollRun(run_id);
      pollRef.current = setInterval(() => pollRun(run_id), POLL_MS);
    } catch (e) { setRunError((e as Error).message); setBusy(false); }
  }

  const result = runStatus?.result ?? null;
  const phaseMap: Record<string, PhaseOutput> = result
    ? Object.fromEntries(result.phases.map((p) => [p.phase, p.output as PhaseOutput]))
    : {};
  const review = phaseMap["review"] ?? {};
  const riskPhase = phaseMap["risk"] ?? {};
  const latestRisk = detail.risk_assessments[0];

  const recommendation = str(review["recommendation"] || riskPhase["recommended_disposition"])
    || (latestRisk?.edd_required ? "escalate" : "");
  const eddRequired = Boolean(riskPhase["edd_required"]) || Boolean(latestRisk?.edd_required);
  const summaryRun = detail.agent_runs.find((r) => r.agent_name === "decision_support_agent" || r.agent_name === "summary_agent");
  const execSummary = str(review["executive_summary"]) || str(summaryRun?.output_payload?.["executive_summary"]);
  const openIssues = arr(review["open_issues"]).length ? arr(review["open_issues"]) : arr(summaryRun?.output_payload?.["open_issues"]);
  const checklist = arr(review["reviewer_checklist"]).length ? arr(review["reviewer_checklist"]) : arr(summaryRun?.output_payload?.["reviewer_checklist"]);
  const reviewerNotes = str(review["reviewer_notes"]) || str(summaryRun?.output_payload?.["reviewer_notes"]);

  const findings = buildFindings(detail, phaseMap);
  const dispKind: "ok" | "warn" | "critical" =
    recommendation.startsWith("approve") ? "ok" : recommendation === "reject" ? "critical" : "warn";
  const intakeMissingDocs = arr((phaseMap["intake"] ?? {})["missing_docs"]);

  function submitDecision(type: string) { setMaker(type); setRfiItems(null); toast(type + " submitted — awaiting second approval"); }
  async function checkerApprove() {
    if (!maker) return;
    const decisionType = maker.toLowerCase() === "approve" ? "approved" : maker.toLowerCase() === "reject" ? "rejected" : "edd";
    try {
      await api.decide(caseId, { decision_type: decisionType, decision_notes: "Maker-checker: finalized by checker." });
      onRefresh(); toast("Decision finalized · recorded to audit trail");
    } catch (e) { toast((e as Error).message); }
    setMaker(null);
  }
  async function createEDD() {
    try {
      await api.decide(caseId, { decision_type: "edd", decision_notes: "EDD case opened from AI agents workbench." });
      onRefresh(); toast("EDD case created · escalated for enhanced due diligence");
    } catch (e) { toast((e as Error).message); }
    setDrawer(null);
  }
  function sendRFI(items: string[], to: string) { setRfiItems(items); setMaker(null); setDrawer(null); toast("Request sent to " + to + " · case paused"); }

  return (
    <div className="space-y-3">
      {runError && <div className="text-[13px] text-mark-red">{runError}</div>}

      <VerdictBar
        recommendation={recommendation} dispKind={dispKind} eddRequired={eddRequired} runStatus={runStatus}
        onEdd={() => setDrawer({ type: "edd" })}
        onRfi={() => setDrawer({ type: "rfi" })}
        onApprove={() => submitDecision("Approve")}
        onReject={() => submitDecision("Reject")}
      />

      {maker && (
        <div className="flex items-center gap-3 rounded-md px-4 py-3 text-[13px] bg-[color:var(--valley-cream)] border border-[color:var(--surface-sage)]">
          <Users size={16} className="text-surface-deep" />
          <span className="flex-1"><b>{maker} submitted by analyst (maker).</b> High-risk case requires a second approver (checker) before it is final.</span>
          <PillButton variant="primary" size="sm" onClick={checkerApprove}><CheckCircle2 size={14} /> Approve as checker</PillButton>
        </div>
      )}
      {rfiItems && (
        <div className="flex items-center gap-3 rounded-md px-4 py-3 text-[13px] bg-[#eef4fb] border border-[#b9d4f0]">
          <Clock size={16} className="text-[#185fa5]" />
          <span className="flex-1"><b>Awaiting client information.</b> Case paused · {rfiItems.length} outstanding items — resumes when documents are received.</span>
          <PillButton variant="secondary" size="sm" onClick={() => { setRfiItems(null); toast("Documents received · case resumed"); }}>Mark received</PillButton>
        </div>
      )}

      <Panel
        eyebrow="Onboarding pipeline"
        action={<PillButton variant="primary" size="sm" onClick={runWorkflow} disabled={busy}>{busy ? "Running…" : "Run full workflow"}</PillButton>}
      >
        <p className="text-[13px] text-mute mb-3">Runs all 6 phases (intake → verification → screening → ownership → risk → review).</p>
        <PhaseStepper result={result} agentRuns={detail.agent_runs} />
        {runStatus && (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-[12px] font-bold px-3 py-0.5 rounded-full border" style={{
              background: (RUN_COLOR[runStatus.status] ?? "#334155") + "22",
              color: RUN_COLOR[runStatus.status] ?? "#94a3b8",
              borderColor: RUN_COLOR[runStatus.status] ?? "#334155",
            }}>{runStatus.status}</span>
            {runStatus.elapsed_seconds != null && <span className="text-[12px] text-mute">{runStatus.elapsed_seconds.toFixed(1)}s</span>}
            {runStatus.slow_warning && <span className="text-[12px] text-amber-500">⚠ slow run</span>}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-[1.55fr_1fr] gap-3 items-stretch">
        <DecisionMemo summary={execSummary} openIssues={openIssues} checklist={checklist} notes={reviewerNotes} recommendation={recommendation} dispKind={dispKind} />
        <RiskDriversPanel
          findings={findings} dispo={dispo} setDispo={setDispo}
          onOpenEvidence={(f) => setDrawer({ type: "evidence", finding: f })}
          onRequestInfo={() => setDrawer({ type: "rfi" })}
        />
      </div>

      <AgentDetail detail={detail} caseId={caseId} onRefresh={onRefresh} />

      <Panel eyebrow="History" title="Agent runs" action={<Sparkles size={14} className="text-surface-deep" />}>
        {detail.agent_runs.length === 0 && <div className="text-[14px] text-mute">No agent runs yet.</div>}
        {detail.agent_runs.length > 0 && (
          <div className="overflow-hidden">
            <div className="grid grid-cols-[200px_180px_1fr_110px] text-[11px] uppercase tracking-[0.07em] text-mute font-bold border-b border-divider">
              <div className="px-2 py-2">Agent</div><div className="px-2 py-2">When</div><div className="px-2 py-2">Output</div><div className="px-2 py-2">Status</div>
            </div>
            {detail.agent_runs.map((r, i) => (
              <div key={i} className="grid grid-cols-[200px_180px_1fr_110px] border-b border-divider last:border-b-0 text-[12.5px] hover:bg-surface-fog/60">
                <div className="px-2 py-2.5 flex items-center gap-2 font-bold">
                  <span className="w-6 h-6 rounded-full bg-surface-mint flex items-center justify-center shrink-0"><Sparkles size={12} className="text-surface-deep" /></span>
                  {r.agent_name}
                </div>
                <div className="px-2 py-2.5 text-mute whitespace-nowrap">{new Date(r.started_at).toLocaleString()}</div>
                <div className="px-2 py-2.5 text-mute truncate">{(r.output_payload?.["summary"] as string) ?? (r.output_payload?.["executive_summary"] as string) ?? JSON.stringify(r.output_payload).slice(0, 120)}</div>
                <div className="px-2 py-2.5"><StatusPill label="completed" kind="ok" /></div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {drawer?.type === "evidence" && drawer.finding && (
        <EvidenceDrawer finding={drawer.finding} detail={detail} caseId={caseId} onClose={() => setDrawer(null)} onReviewed={() => { toast("Evidence marked as reviewed"); setDrawer(null); }} />
      )}
      {drawer?.type === "edd" && <EddDrawer onClose={() => setDrawer(null)} onCreate={createEDD} />}
      {drawer?.type === "rfi" && <RfiDrawer org={detail.organization} missingDocs={intakeMissingDocs} onClose={() => setDrawer(null)} onSend={sendRFI} />}

      {toastMsg && (
        <div className="fixed left-1/2 bottom-6 -translate-x-1/2 z-[60] bg-surface-deep text-ink-inverse px-4 py-2.5 rounded-full text-[13px] font-medium shadow-lg flex items-center gap-2">
          <CheckCircle2 size={15} className="text-[color:var(--surface-sage)]" /> {toastMsg}
        </div>
      )}
    </div>
  );
}

function VerdictBar({ recommendation, dispKind, eddRequired, runStatus, onEdd, onRfi, onApprove, onReject }: {
  recommendation: string; dispKind: "ok" | "warn" | "critical"; eddRequired: boolean; runStatus: WorkflowRunStatus | null;
  onEdd: () => void; onRfi: () => void; onApprove: () => void; onReject: () => void;
}) {
  const recLabel = recommendation ? (DISP_LABEL[recommendation] ?? recommendation.replace(/_/g, " ")) : "Pending pipeline run";
  return (
    <section className="bg-white border border-divider border-l-4 border-l-[color:var(--surface-sage)] rounded-md px-5 py-4 flex items-center justify-between gap-5 flex-wrap">
      <div className="flex items-center gap-5 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.08em] font-bold text-mute">AI Recommendation</div>
          <div className="mt-1 flex items-center gap-2">
            <StatusPill label={recLabel} kind={dispKind} />
            {eddRequired && <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold">EDD required</span>}
          </div>
        </div>
        <div className="w-px h-8 bg-divider" />
        <div className="flex items-center gap-2 text-[12px] text-mute">
          {runStatus ? (
            <><CheckCircle2 size={14} className="text-accent-green" /> Pipeline {runStatus.status}
              {runStatus.elapsed_seconds != null ? ` · ${runStatus.elapsed_seconds.toFixed(1)}s` : ""}
              {runStatus.slow_warning ? " · ⚠ slow" : ""}</>
          ) : "Pipeline not run yet"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <PillButton variant="primary" size="sm" onClick={onEdd}><ShieldAlert size={14} /> Escalate to EDD</PillButton>
        <PillButton variant="secondary" size="sm" onClick={onRfi}><Mail size={14} /> Request info</PillButton>
        <PillButton variant="secondary" size="sm" onClick={onApprove}>Approve</PillButton>
        <PillButton variant="secondary" size="sm" onClick={onReject} className="hover:border-mark-red"><span className="text-mark-red">Reject</span></PillButton>
      </div>
    </section>
  );
}

function PhaseStepper({ result, agentRuns }: { result: WfResult | null; agentRuns: ApiCaseDetail["agent_runs"] }) {
  function phaseStatus(name: string): string {
    const p = result?.phases.find((x) => x.phase === name);
    if (p) return p.status;
    return agentRuns.some((r) => r.agent_name.startsWith(name)) ? "completed" : "pending";
  }
  return (
    <div className="flex items-stretch border border-divider rounded-md overflow-hidden">
      {PHASE_ORDER.map((name, i) => {
        const done = phaseStatus(name) === "completed";
        return (
          <div key={name} className={"flex-1 px-3 py-2.5 flex items-center gap-2 " + (i ? "border-l border-divider" : "")}>
            <span className={"w-5 h-5 rounded-full flex items-center justify-center shrink-0 " + (done ? "bg-surface-mint text-surface-deep" : "bg-surface-fog text-mute")}>
              {done ? <CheckCircle2 size={12} /> : <span className="text-[10px] font-bold">{i + 1}</span>}
            </span>
            <span className="text-[12px] font-bold capitalize">{name}</span>
          </div>
        );
      })}
    </div>
  );
}

function DecisionMemo({ summary, openIssues, checklist, notes, recommendation, dispKind }: {
  summary: string; openIssues: string[]; checklist: string[]; notes: string; recommendation: string; dispKind: "ok" | "warn" | "critical";
}) {
  return (
    <Panel eyebrow="Decision memo" title="analyst-ready summary" action={<Sparkles size={14} className="text-surface-deep" />}>
      {summary
        ? <p className="text-[13.5px] text-ink leading-relaxed bg-surface-fog rounded-md px-4 py-3">{summary}</p>
        : <p className="text-[13px] text-mute">No summary yet. Run the workflow or the Summary agent.</p>}
      {recommendation && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-[0.08em] font-bold text-mute">Recommendation</span>
          <StatusPill label={DISP_LABEL[recommendation] ?? recommendation.replace(/_/g, " ")} kind={dispKind} />
        </div>
      )}
      {openIssues.length > 0 && (
        <div className="mt-4">
          <div className="text-[10.5px] uppercase tracking-[0.08em] font-bold text-mute mb-2">Open issues</div>
          <ul className="space-y-1">{openIssues.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-ink"><AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />{s}</li>
          ))}</ul>
        </div>
      )}
      {checklist.length > 0 && (
        <div className="mt-4">
          <div className="text-[10.5px] uppercase tracking-[0.08em] font-bold text-mute mb-2">Reviewer checklist</div>
          <ul className="space-y-1">{checklist.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-mute"><CheckCircle2 size={13} className="text-surface-deep mt-0.5 shrink-0" />{s}</li>
          ))}</ul>
        </div>
      )}
      {notes && <p className="mt-4 pt-3 border-t border-dashed border-divider text-[12.5px] text-mute italic">{notes}</p>}
    </Panel>
  );
}

function RiskDriversPanel({ findings, dispo, setDispo, onOpenEvidence, onRequestInfo }: {
  findings: Finding[];
  dispo: Record<string, { action: string; reason: string }>;
  setDispo: React.Dispatch<React.SetStateAction<Record<string, { action: string; reason: string }>>>;
  onOpenEvidence: (f: Finding) => void;
  onRequestInfo: () => void;
}) {
  const [open, setOpen] = React.useState<Record<string, boolean>>(findings.length ? { [findings[0].id]: true } : {});
  function setAction(f: Finding, action: string) {
    if (action === "Request info") onRequestInfo();
    setDispo((d) => ({ ...d, [f.id]: { action, reason: d[f.id]?.reason ?? "" } }));
  }
  function setReason(f: Finding, reason: string) {
    setDispo((d) => ({ ...d, [f.id]: { action: d[f.id]?.action ?? "", reason } }));
  }
  return (
    <section className="bg-white border border-divider rounded-md overflow-hidden h-full flex flex-col">
      <header className="px-4 py-2.5 border-b border-divider flex items-center gap-3">
        <span className="w-1.5 h-1.5 rounded-full bg-mark-red" />
        <span className="text-[12px] tracking-[0.08em] uppercase text-mark-red font-bold">Risk drivers & evidence</span>
        <span className="text-[12px] text-mute ml-auto">{findings.length} {findings.length === 1 ? "driver" : "drivers"}</span>
      </header>
      <div className="p-4 space-y-2.5 flex-1">
        {findings.length === 0 && <p className="text-[13px] text-mute">No risk drivers. Run the workflow to populate findings.</p>}
        {findings.map((f) => {
          const isOpen = !!open[f.id];
          const d = dispo[f.id];
          return (
            <div key={f.id} className="border border-divider rounded-md overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-fog" onClick={() => setOpen((o) => ({ ...o, [f.id]: !o[f.id] }))}>
                <SeverityDot s={f.severity} />
                <div className="min-w-0">
                  <div className="text-[13px] font-bold capitalize truncate">{f.title}</div>
                  <div className="text-[11px] text-mute font-mono truncate">{f.code}</div>
                </div>
                <button
                  className="ml-auto inline-flex items-center gap-1.5 bg-surface-mint text-surface-deep px-2.5 py-1 rounded-full text-[11.5px] font-bold whitespace-nowrap hover:opacity-80"
                  onClick={(e) => { e.stopPropagation(); onOpenEvidence(f); }}
                >
                  <FileText size={12} /> {f.sourceLabel}
                </button>
                <ChevronDown size={15} className={"text-mute transition-transform " + (isOpen ? "rotate-180" : "")} />
              </div>
              {isOpen && (
                <div className="px-3 pb-3 pl-9 text-[12.5px] text-mute leading-relaxed" onClick={(e) => e.stopPropagation()}>
                  <span className="text-ink font-medium">Why flagged:</span> {f.reasoning}
                  <div className="mt-2">
                    <button className="inline-flex items-center gap-1.5 bg-surface-mint text-surface-deep px-2.5 py-1 rounded-full text-[11.5px] font-bold hover:opacity-80" onClick={() => onOpenEvidence(f)}>
                      <ExternalLink size={12} /> Open evidence
                    </button>
                  </div>
                  <div className="mt-3 pt-3 border-t border-dashed border-divider">
                    <div className="text-[10px] uppercase tracking-[0.07em] font-bold text-mute mb-2">Operator disposition</div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {["Accept", "Override", "Request info", "Escalate"].map((a) => (
                        <button key={a} onClick={() => setAction(f, a)}
                          className={"px-2.5 py-1 rounded-full text-[11.5px] font-bold border " + (d?.action === a ? (a === "Escalate" ? "bg-mark-red text-white border-mark-red" : "bg-surface-deep text-white border-surface-deep") : "bg-white text-ink border-divider hover:border-surface-deep")}>
                          {a}
                        </button>
                      ))}
                    </div>
                    {d?.action && (
                      <select value={d.reason} onChange={(e) => setReason(f, e.target.value)} className="mt-2 w-full max-w-[320px] text-[12px] px-2.5 py-2 border border-divider rounded-md bg-white outline-none focus:ring-2 focus:ring-surface-deep">
                        <option value="">— select reason code —</option>
                        {REASON_CODES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                    {d?.action && d?.reason && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11.5px] font-bold text-surface-deep"><CheckCircle2 size={13} /> {d.action} · {d.reason} · analyst</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function summarizePayload(p: Record<string, unknown>): React.ReactNode {
  const entries = Object.entries(p).filter(([, v]) => v != null && (typeof v !== "object" || Array.isArray(v)));
  return (
    <div className="space-y-1">
      {entries.slice(0, 8).map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="text-mute min-w-[150px] font-mono text-[11.5px]">{k}</span>
          <span className="text-ink">{Array.isArray(v) ? (v.length ? v.map(String).join(", ") : "none") : String(v)}</span>
        </div>
      ))}
    </div>
  );
}

function AgentDetail({ detail, caseId, onRefresh }: { detail: ApiCaseDetail; caseId: string; onRefresh: () => void }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  async function run(which: "intake" | "summary") {
    setBusy(which);
    try { if (which === "intake") await api.runIntakeAgent(caseId); else await api.runSummaryAgent(caseId); onRefresh(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(null); }
  }
  const byName = (n: string) => detail.agent_runs.find((r) => r.agent_name === n);
  const rows = [
    { key: "intake_agent", name: "Intake" },
    { key: "verification_agent", name: "Verification" },
    { key: "screening_agent", name: "Screening" },
    { key: "ownership_agent", name: "Ownership" },
    { key: "risk_agent", name: "Risk" },
  ];
  return (
    <Panel eyebrow="Agent detail" title="per-phase output" action={
      <div className="flex gap-2">
        <PillButton variant="secondary" size="sm" onClick={() => run("intake")} disabled={busy !== null}>{busy === "intake" ? "Running…" : "Run intake"}</PillButton>
        <PillButton variant="secondary" size="sm" onClick={() => run("summary")} disabled={busy !== null}>{busy === "summary" ? "Running…" : "Run summary"}</PillButton>
      </div>
    }>
      <div className="divide-y divide-divider">
        {rows.map((r) => {
          const run0 = byName(r.key);
          const isOpen = !!open[r.key];
          return (
            <div key={r.key}>
              <div className="flex items-center gap-3 py-3 cursor-pointer" onClick={() => setOpen((o) => ({ ...o, [r.key]: !o[r.key] }))}>
                <span className="w-7 h-7 rounded-md bg-surface-mint flex items-center justify-center shrink-0"><Sparkles size={13} className="text-surface-deep" /></span>
                <span className="text-[13.5px] font-bold">{r.name} agent</span>
                <span className="ml-auto"><StatusPill label={run0 ? "completed" : "not run"} kind={run0 ? "ok" : "progress"} /></span>
                <ChevronDown size={15} className={"text-mute transition-transform " + (isOpen ? "rotate-180" : "")} />
              </div>
              {isOpen && run0 && <div className="pb-4 pl-10 text-[12.5px] text-mute leading-relaxed">{summarizePayload(run0.output_payload)}</div>}
              {isOpen && !run0 && <div className="pb-4 pl-10 text-[12.5px] text-mute">No run yet.</div>}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Drawer({ title, subtitle, icon, children, footer, onClose }: {
  title: string; subtitle: string; icon: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-[560px] max-w-[94vw] z-50 bg-white shadow-2xl flex flex-col">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-divider">
          {icon}
          <div>
            <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-surface-deep">{title}</div>
            <div className="text-[12px] text-mute">{subtitle}</div>
          </div>
          <button onClick={onClose} className="ml-auto w-8 h-8 rounded-md flex items-center justify-center text-mute hover:bg-surface-fog hover:text-ink"><X size={16} /></button>
        </header>
        <div className="p-5 overflow-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-divider flex justify-end gap-2 items-center">{footer}</div>}
      </aside>
    </>
  );
}

function EvidenceDrawer({ finding, detail, caseId, onClose, onReviewed }: {
  finding: Finding; detail: ApiCaseDetail; caseId: string; onClose: () => void; onReviewed: () => void;
}) {
  const doc = finding.docType ? detail.documents.find((d) => d.document_type === finding.docType) : undefined;
  const fileUrl = doc ? `/api/v1/cases/${caseId}/documents/${doc.id}/file` : null;
  return (
    <Drawer title="Evidence" subtitle={finding.sourceLabel} icon={<Search size={18} className="text-surface-deep" />} onClose={onClose}
      footer={<>
        <PillButton variant="secondary" size="sm" onClick={onClose}>Close</PillButton>
        <PillButton variant="primary" size="sm" onClick={onReviewed}><CheckCircle2 size={14} /> Mark reviewed</PillButton>
      </>}>
      {finding.kind === "document" && (doc ? (
        <div className="rounded-md border border-divider bg-surface-fog p-4 text-[13px]">
          <div className="font-bold">{doc.file_name}</div>
          <div className="text-mute text-[12px]">{doc.document_type} · {doc.processing_status ?? "uploaded"}</div>
          {fileUrl && <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-surface-deep font-bold text-[12.5px]"><ExternalLink size={13} /> Open document</a>}
          {doc.extracted_fields && Object.keys(doc.extracted_fields).length > 0 && (
            <div className="mt-3">
              <div className="text-[10.5px] uppercase tracking-[0.07em] font-bold text-mute mb-1">Extracted (OCR)</div>
              {Object.entries(doc.extracted_fields).slice(0, 8).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[12px]"><span className="font-mono text-mute min-w-[140px]">{k}</span><span>{String(v)}</span></div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-divider bg-surface-fog p-4 text-[13px] text-mute">No <b>{finding.docType}</b> uploaded yet. Request it from the client to verify this finding.</div>
      ))}
      {finding.kind === "field" && (
        <div className="rounded-md border border-divider bg-surface-fog p-4 text-[13px]">
          <div className="text-[10.5px] uppercase tracking-[0.07em] font-bold text-mute mb-1">Structured org record</div>
          <div className="flex gap-2"><span className="font-mono text-mute min-w-[160px]">incorporation_country</span><span>{detail.organization?.incorporation_country ?? "—"}</span></div>
          <p className="text-[12px] text-mute mt-2">Derived field — no source PDF. Edit in the Overview tab.</p>
        </div>
      )}
      {finding.kind === "screening" && (
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.07em] font-bold text-mute mb-1">Screening matches</div>
          {detail.screening.length === 0 && <p className="text-[13px] text-mute">No screening rows.</p>}
          {detail.screening.map((s, i) => (
            <div key={i} className="rounded-md border border-divider p-3 text-[12.5px] mb-2">
              <div className="font-bold">{s.query_name ?? "—"}</div>
              <div className="text-mute">{s.screening_type} · matched: {s.matched_name ?? "—"} · score {s.match_score?.toFixed(0) ?? "—"} · {s.disposition ?? "pending"}</div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[12.5px] text-mute mt-4"><span className="text-ink font-medium">Why flagged:</span> {finding.reasoning}</p>
    </Drawer>
  );
}

function EddDrawer({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const items: [string, string][] = [
    ["Source of wealth (SoW) documentation", "Owner-level wealth origin"],
    ["Source of funds (SoF) for declared volume", "Supports very-high volume trigger"],
    ["Enhanced sanctions / PEP re-screen", "Incl. export-control / entity-list check"],
    ["UBO supplementary ID", "Where personal data is redacted"],
    ["Adverse media deep-dive", "Resolve likely false positives"],
    ["Site visit / verification call", ""],
  ];
  return (
    <Drawer title="Open EDD case" subtitle="enhanced due diligence checklist" icon={<ShieldAlert size={18} className="text-mark-red" />} onClose={onClose}
      footer={<>
        <PillButton variant="secondary" size="sm" onClick={onClose}>Cancel</PillButton>
        <PillButton variant="primary" size="sm" onClick={onCreate}><Plus size={14} /> Create EDD case</PillButton>
      </>}>
      <div className="text-[10.5px] uppercase tracking-[0.07em] font-bold text-mute mb-2">Required EDD steps</div>
      {items.map(([t, s], i) => (
        <label key={i} className="flex items-start gap-2.5 py-2.5 border-b border-divider text-[13px]">
          <input type="checkbox" defaultChecked={i < 4} className="mt-0.5" />
          <span>{t}{s && <span className="block text-[11.5px] text-mute mt-0.5">{s}</span>}</span>
        </label>
      ))}
      <div className="mt-4">
        <label className="block text-[10.5px] uppercase tracking-[0.06em] font-bold text-mute mb-1.5">Assign to</label>
        <select className="w-full px-3 py-2 bg-surface-fog rounded-md text-[14px] outline-none focus:bg-white focus:ring-2 focus:ring-surface-deep"><option>EDD specialist queue</option><option>Financial crime team</option></select>
      </div>
      <div className="mt-3">
        <label className="block text-[10.5px] uppercase tracking-[0.06em] font-bold text-mute mb-1.5">Due date</label>
        <input type="date" className="w-full px-3 py-2 bg-surface-fog rounded-md text-[14px] outline-none focus:bg-white focus:ring-2 focus:ring-surface-deep" />
      </div>
    </Drawer>
  );
}

function RfiDrawer({ org, missingDocs, onClose, onSend }: {
  org: ApiOrganization | null; missingDocs: string[]; onClose: () => void; onSend: (items: string[], to: string) => void;
}) {
  const baseItems = [
    "Audited financials supporting declared transaction volume",
    "Source of funds statement",
    "Photo ID for the beneficial owner",
    "Clarification of business activity scope",
  ];
  const items = missingDocs.length ? missingDocs.map((d) => "Provide " + d.replace(/_/g, " ")) : baseItems;
  const [checked, setChecked] = React.useState<boolean[]>(items.map(() => true));
  const [to, setTo] = React.useState("compliance@" + (org?.website?.replace(/^https?:\/\//, "") ?? "client.example"));
  const name = org?.legal_name ?? "the organization";
  const body =
`Dear ${name} compliance team,

Thank you for your onboarding submission. To complete our review we need a few additional items:

${items.map((it, i) => `${i + 1}. ${it}.`).join("\n")}

Please reply with the documents attached within 10 business days. Your application is on hold pending receipt.

Kind regards,
KYC Onboarding Team`;
  const selected = items.filter((_, i) => checked[i]);
  return (
    <Drawer title="Request info from client" subtitle="AI-drafted from missing / unclear items" icon={<Mail size={18} className="text-surface-deep" />} onClose={onClose}
      footer={<>
        <PillButton variant="secondary" size="sm" onClick={onClose}>Cancel</PillButton>
        <PillButton variant="primary" size="sm" onClick={() => onSend(selected, to)}><Send size={14} /> Send & pause case</PillButton>
      </>}>
      <div className="text-[10.5px] uppercase tracking-[0.07em] font-bold text-mute mb-2">Outstanding items · AI-selected</div>
      {items.map((it, i) => (
        <label key={i} className="flex items-start gap-2.5 py-2.5 border-b border-divider text-[13px]">
          <input type="checkbox" checked={checked[i]} onChange={() => setChecked((c) => c.map((v, j) => j === i ? !v : v))} className="mt-0.5" />
          <span>{it}</span>
        </label>
      ))}
      <div className="mt-4">
        <label className="block text-[10.5px] uppercase tracking-[0.06em] font-bold text-mute mb-1.5">To</label>
        <input value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-3 py-2 bg-surface-fog rounded-md text-[14px] outline-none focus:bg-white focus:ring-2 focus:ring-surface-deep" />
      </div>
      <div className="mt-3">
        <label className="block text-[10.5px] uppercase tracking-[0.06em] font-bold text-mute mb-1.5">Auto-drafted email · editable</label>
        <textarea rows={13} defaultValue={body} className="w-full px-3 py-2 bg-surface-fog rounded-md text-[13px] leading-relaxed outline-none focus:bg-white focus:ring-2 focus:ring-surface-deep font-mono" />
      </div>
    </Drawer>
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
