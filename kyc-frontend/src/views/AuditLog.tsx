import * as React from "react";
import { useApp } from "@/state";
import { TopRow } from "@/components/blocks/TopRow";
import { StatusPill } from "@/components/blocks/StatusPill";
import { AIDot } from "@/components/ai/AIDot";
import { StaggerList } from "@/components/ai/StaggerList";
import { PillButton } from "@/components/blocks/PillButton";
import {
  api,
  type Certificate,
  type CertificateVerification,
  type ApiAuditEvent,
} from "@/lib/api";
import { FileBadge2, Activity, ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react";

const POLL_INTERVAL_MS = 30_000;

export function AuditLog() {
  const { go } = useApp();
  const [tab, setTab] = React.useState<"events" | "certs">("certs");
  const [events, setEvents] = React.useState<ApiAuditEvent[] | null>(null);
  const [certs, setCerts] = React.useState<Certificate[] | null>(null);

  async function reload() {
    const [evs, cs] = await Promise.all([
      api.listAuditEvents(200).catch(() => []),
      api.listCertificates().catch(() => []),
    ]);
    setEvents(evs);
    setCerts(cs);
  }

  React.useEffect(() => {
    let cancelled = false;
    reload();
    const id = setInterval(() => { if (!cancelled) reload(); }, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const certCount  = certs?.length ?? 0;
  const eventCount = events?.length ?? 0;

  return (
    <div className="pl-5 pr-6 pt-4 pb-8 space-y-3 min-h-screen bg-[color-mix(in_srgb,var(--surface-mint)_18%,var(--surface-fog))]">
      <TopRow breadcrumb={{ label: "Audit log", chip: `${certCount} certificates · ${eventCount} events` }} />

      <section className="bg-white border border-divider rounded-md overflow-hidden">
        <header className="px-4 py-2.5 border-b border-divider flex items-center gap-3">
          <AIDot size={6} tone="deep" />
          <span className="text-[12px] tracking-[0.08em] uppercase text-surface-deep font-medium">
            Compliance evidence
          </span>
          <nav className="ml-auto flex items-center gap-1">
            <TabBtn active={tab === "certs"} onClick={() => setTab("certs")}>
              <FileBadge2 size={13} /> Certificates ({certCount})
            </TabBtn>
            <TabBtn active={tab === "events"} onClick={() => setTab("events")}>
              <Activity size={13} /> Events ({eventCount})
            </TabBtn>
            <button
              type="button"
              onClick={reload}
              title="Refresh"
              className="ml-2 w-7 h-7 inline-flex items-center justify-center rounded-md text-mute hover:text-ink hover:bg-surface-fog"
            >
              <RefreshCw size={13} />
            </button>
          </nav>
        </header>

        {tab === "certs" && (
          <CertificateList
            certs={certs}
            onOpenCase={(id) => go({ kind: "case", id })}
          />
        )}
        {tab === "events" && (
          <EventList
            events={events}
            onOpenCase={(id) => go({ kind: "case", id })}
          />
        )}
      </section>
    </div>
  );
}

function TabBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors " +
        (active
          ? "bg-surface-deep text-ink-inverse"
          : "text-mute hover:bg-surface-mint/40 hover:text-ink")
      }
    >
      {children}
    </button>
  );
}

/* ── Certificates ─────────────────────────────────────────────── */

function CertificateList({
  certs,
  onOpenCase,
}: {
  certs: Certificate[] | null;
  onOpenCase: (caseId: string) => void;
}) {
  if (certs === null) return <Empty>Loading…</Empty>;
  if (certs.length === 0)
    return <Empty>No certificates issued yet. Run a workflow, then click <b>Issue certificate</b> on the case Decision tab.</Empty>;

  return (
    <>
      <div className="grid grid-cols-[40px_120px_2fr_1fr_140px_140px_120px] bg-surface-deep text-ink-inverse text-[11px] uppercase tracking-[0.08em] font-medium">
        <div className="px-4 py-2.5" />
        <div className="px-4 py-2.5">Issued</div>
        <div className="px-4 py-2.5">Workflow · Decision</div>
        <div className="px-4 py-2.5">Models</div>
        <div className="px-4 py-2.5">Audit root</div>
        <div className="px-4 py-2.5">Events</div>
        <div className="px-4 py-2.5">Status</div>
      </div>
      <StaggerList step={40}>
        {certs.map((c) => (
          <CertRow key={c.certificate_id} cert={c} onOpenCase={onOpenCase} />
        ))}
      </StaggerList>
    </>
  );
}

function CertRow({ cert, onOpenCase }: { cert: Certificate; onOpenCase: (id: string) => void }) {
  const [v, setV] = React.useState<CertificateVerification | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    api.verifyCertificate(cert.certificate_id)
      .then((res) => { if (!cancelled) setV(res); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cert.certificate_id]);

  const issuedDate = new Date(cert.issued_at).toLocaleString();
  const rootShort = cert.audit_root.slice(0, 10) + "…";

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="ui-pill w-full grid grid-cols-[40px_120px_2fr_1fr_140px_140px_120px] items-center border-t border-divider text-[13px] text-left hover:bg-surface-mint/40"
      >
        <div className="px-4 py-3 text-mute">{expanded ? "▾" : "▸"}</div>
        <div className="px-4 py-3 text-mute text-[12px]">{issuedDate}</div>
        <div className="px-4 py-3 min-w-0">
          <div className="font-medium truncate">{cert.workflow}</div>
          <div className="text-[12px] text-mute">decision = {cert.decision}</div>
        </div>
        <div className="px-4 py-3 text-[12px] text-mute truncate">{cert.models.join(", ") || "—"}</div>
        <div className="px-4 py-3 font-mono text-[11px] text-mute">{rootShort}</div>
        <div className="px-4 py-3 text-mute">{cert.audit_event_count}</div>
        <div className="px-4 py-3">
          {v === null ? (
            <StatusPill label="checking…" kind="neutral" />
          ) : v.verified ? (
            <StatusPill label="verified" kind="ok" />
          ) : (
            <StatusPill label="tampered" kind="critical" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-divider bg-surface-fog/30 px-6 py-4 grid grid-cols-2 gap-x-8 gap-y-2 text-[12px]">
          <KV k="certificate_id" v={cert.certificate_id} mono />
          <KV k="issuer" v={cert.issuer} />
          <KV k="case_id" v={cert.case_id} mono link onClick={() => onOpenCase(cert.case_id)} />
          <KV k="policy_pack" v={cert.policy_pack_version ?? "—"} />
          <KV k="risk_level" v={cert.risk_level ?? "—"} />
          <KV k="risk_score" v={cert.risk_score?.toFixed(1) ?? "—"} />
          <KV k="audit_root" v={cert.audit_root} mono full />
          <KV k="signature" v={cert.signature} mono full />
          <div className="col-span-2 mt-2">
            <div className="text-[11px] uppercase tracking-[0.06em] text-mute mb-1">Model fingerprint</div>
            <div className="bg-white border border-divider rounded-md p-3 font-mono text-[11px] space-y-0.5">
              {Object.entries(cert.model_fingerprint).map(([agent, model]) => (
                <div key={agent} className="flex justify-between">
                  <span className="text-mute">{agent}</span>
                  <span>{model}</span>
                </div>
              ))}
            </div>
          </div>
          {v && (
            <div className="col-span-2 mt-2">
              <div className="text-[11px] uppercase tracking-[0.06em] text-mute mb-1">Verification</div>
              <div className="flex flex-wrap gap-2">
                <StatusPill
                  label={`signature ${v.signature_valid ? "✓" : "✗"}`}
                  kind={v.signature_valid ? "ok" : "critical"}
                />
                <StatusPill
                  label={`hash chain ${v.chain_intact ? "intact" : "broken"}`}
                  kind={v.chain_intact ? "ok" : "critical"}
                />
                <StatusPill
                  label={`${v.current_event_count - v.audit_event_count} events after issuance`}
                  kind="neutral"
                />
              </div>
              {!v.verified && (
                <div className="mt-2 flex items-center gap-1.5 text-mark-red text-[12px]">
                  <ShieldAlert size={13} /> Stored root {v.stored_root.slice(0, 12)}… ≠ recomputed root {v.recomputed_root.slice(0, 12)}…
                </div>
              )}
              {v.verified && (
                <div className="mt-2 flex items-center gap-1.5 text-surface-deep text-[12px]">
                  <ShieldCheck size={13} /> Signature and audit chain match — certificate is authentic.
                </div>
              )}
            </div>
          )}
          <div className="col-span-2 pt-2 flex justify-end">
            <PillButton variant="primary" size="sm" arrow onClick={() => onOpenCase(cert.case_id)}>
              Open case
            </PillButton>
          </div>
        </div>
      )}
    </>
  );
}

function KV({
  k, v, mono, full, link, onClick,
}: {
  k: string; v: string;
  mono?: boolean; full?: boolean; link?: boolean; onClick?: () => void;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-[11px] uppercase tracking-[0.06em] text-mute">{k}</div>
      {link ? (
        <button
          type="button"
          onClick={onClick}
          className={
            "text-left text-surface-deep hover:underline " +
            (mono ? "font-mono text-[11px]" : "text-[13px]")
          }
        >
          {v}
        </button>
      ) : (
        <div className={"text-ink break-all " + (mono ? "font-mono text-[11px]" : "text-[13px]")}>
          {v}
        </div>
      )}
    </div>
  );
}

/* ── Events ────────────────────────────────────────────────────── */

function EventList({
  events,
  onOpenCase,
}: {
  events: ApiAuditEvent[] | null;
  onOpenCase: (caseId: string) => void;
}) {
  if (events === null) return <Empty>Loading…</Empty>;
  if (events.length === 0) return <Empty>No audit events yet.</Empty>;

  return (
    <>
      <div className="grid grid-cols-[180px_140px_140px_2fr_120px] bg-surface-deep text-ink-inverse text-[11px] uppercase tracking-[0.08em] font-medium">
        <div className="px-4 py-2.5">Timestamp</div>
        <div className="px-4 py-2.5">Event type</div>
        <div className="px-4 py-2.5">Actor</div>
        <div className="px-4 py-2.5">Detail</div>
        <div className="px-4 py-2.5">Case</div>
      </div>
      <StaggerList step={20}>
        {events.map((e) => {
          const ts = new Date(e.created_at).toLocaleString();
          const detail = summarizeEvent(e);
          return (
            <div
              key={e.id}
              className="grid grid-cols-[180px_140px_140px_2fr_120px] items-center border-t border-divider text-[13px] hover:bg-surface-mint/40"
            >
              <div className="px-4 py-2.5 text-mute text-[12px]">{ts}</div>
              <div className="px-4 py-2.5">
                <span className="font-mono text-[11px] bg-surface-fog px-2 py-0.5 rounded">{e.event_type}</span>
              </div>
              <div className="px-4 py-2.5 text-mute text-[12px]">
                {e.actor_type}{e.actor_id ? ` · ${e.actor_id}` : ""}
              </div>
              <div className="px-4 py-2.5 truncate text-mute">{detail}</div>
              <div className="px-4 py-2.5">
                {e.case_id ? (
                  <button
                    type="button"
                    onClick={() => onOpenCase(e.case_id!)}
                    className="text-surface-deep hover:underline text-[12px] font-mono"
                  >
                    {e.case_id.slice(0, 8)}…
                  </button>
                ) : (
                  <span className="text-mute">—</span>
                )}
              </div>
            </div>
          );
        })}
      </StaggerList>
    </>
  );
}

function summarizeEvent(e: ApiAuditEvent): string {
  const p = e.event_payload as Record<string, unknown> | null;
  if (!p) return "";
  if (e.event_type === "certificate_issued") {
    return `cert ${(p["certificate_id"] as string | undefined)?.slice(0, 8) ?? "?"}… · decision=${p["decision"] ?? "?"}`;
  }
  if (e.event_type === "decision_recorded") {
    return `decision=${p["decision_type"] ?? "?"}`;
  }
  if (e.event_type === "document_uploaded") {
    return `${p["document_type"] ?? ""} · ${p["file_name"] ?? ""}`;
  }
  // Generic fallback — show the first 80 chars of the payload
  return JSON.stringify(p).slice(0, 100);
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-[14px] text-mute">{children}</div>;
}
