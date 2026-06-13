import { cn } from "@/lib/utils";
import { useApp } from "@/state";
import { StatusPill } from "./StatusPill";
import { StaggerList } from "@/components/ai/StaggerList";
import { AIDot } from "@/components/ai/AIDot";
import { type ApiCaseWithOrg } from "@/lib/api";

const showCount = 4;

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸", UK: "🇬🇧", SG: "🇸🇬", CN: "🇨🇳", EU: "🇪🇺", HK: "🇭🇰",
  DE: "🇩🇪", FR: "🇫🇷", JP: "🇯🇵", AU: "🇦🇺", LT: "🇱🇹",
};

function flagFor(j: string | null): string {
  return FLAG_MAP[(j ?? "").toUpperCase()] ?? "🏳️";
}

function statusKindFor(
  status: string,
): "critical" | "ready" | "progress" | "resolved" | "warn" | "ok" | "active" {
  const s = status.toLowerCase();
  if (s === "rejected") return "critical";
  if (s === "approved") return "ok";
  if (s === "review") return "ready";
  if (s === "in_review") return "warn";
  if (s === "completed") return "resolved";
  if (s === "needs_decision" || s === "needs_review") return "critical";
  return "active";
}

function caseTitle(c: ApiCaseWithOrg): string {
  const org = c.organization?.legal_name ?? "Unnamed organization";
  return `${org} · ${c.case_type}`;
}

function caseSub(c: ApiCaseWithOrg): string {
  const parts: string[] = [];
  if (c.organization?.business_description) parts.push(c.organization.business_description);
  if (c.organization?.incorporation_country) parts.push(c.organization.incorporation_country);
  if (c.risk_level) parts.push(`${c.risk_level} risk`);
  return parts.join(" · ") || c.customer_type;
}

export function CasesPanel({
  className,
  cases,
}: {
  className?: string;
  cases: ApiCaseWithOrg[] | null;
}) {
  const { go } = useApp();
  const visible = (cases ?? []).slice(0, showCount);
  const totalCount = cases?.length ?? 0;

  return (
    <section className={cn("bg-white border border-divider rounded-md overflow-hidden", className)}>
      <header className="px-4 py-2.5 border-b border-divider flex items-center gap-3">
        <AIDot size={6} tone="deep" />
        <span className="text-[12px] tracking-[0.08em] uppercase text-surface-deep font-medium">
          Active KYC cases
        </span>
        <span className="text-[12px] text-mute">Open the workspace from any row</span>
      </header>

      {cases === null && (
        <div className="px-4 py-8 text-center text-[14px] text-mute">Loading cases…</div>
      )}
      {cases !== null && cases.length === 0 && (
        <div className="px-4 py-8 text-center text-[14px] text-mute">No cases yet. Create one from + New intake.</div>
      )}

      <StaggerList step={70}>
        {visible.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => go({ kind: "case", id: c.id })}
            className="ui-pill w-full px-4 py-3 border-b border-divider last:border-b-0 flex items-center justify-between gap-4 text-left hover:bg-surface-mint/40"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-8 h-8 rounded-full bg-surface-fog flex items-center justify-center text-[16px] shrink-0"
                aria-hidden
              >
                {flagFor(c.jurisdiction)}
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-medium text-ink truncate">{caseTitle(c)}</div>
                <div className="text-[12px] text-mute truncate">{caseSub(c)}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <StatusPill label={c.status.replace(/_/g, " ")} kind={statusKindFor(c.status)} />
              <span className="text-ink" aria-hidden>→</span>
            </div>
          </button>
        ))}
      </StaggerList>

      {totalCount > showCount && (
        <button
          type="button"
          onClick={() => go({ kind: "cases" })}
          className="ui-pill w-full px-4 py-2.5 flex items-center justify-between text-[13px] text-surface-deep font-medium hover:bg-surface-mint/40"
        >
          <span>View all {totalCount} cases</span>
          <span aria-hidden>→</span>
        </button>
      )}
    </section>
  );
}
