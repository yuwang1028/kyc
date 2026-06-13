import * as React from "react";
import { cn } from "@/lib/utils";
import { useApp } from "@/state";
import { PillButton } from "./PillButton";
import { AIDot } from "@/components/ai/AIDot";
import { type ApiCaseWithOrg } from "@/lib/api";

const NAME_MAP: Record<string, string> = {
  US: "United States", UK: "United Kingdom", SG: "Singapore", CN: "China",
  EU: "European Union", HK: "Hong Kong", DE: "Germany", FR: "France",
  JP: "Japan", AU: "Australia", LT: "Lithuania",
};

const urgencyChip: Record<"critical" | "high" | "medium", string> = {
  critical: "bg-mark-red text-ink-inverse",
  high: "bg-surface-sage text-surface-deep",
  medium: "bg-surface-fog text-ink",
};

function urgencyFor(c: ApiCaseWithOrg): "critical" | "high" | "medium" {
  const score = c.risk_score ?? 0;
  const level = (c.risk_level ?? "").toLowerCase();
  if (level === "critical" || score >= 85) return "critical";
  if (level === "high" || score >= 70) return "high";
  return "medium";
}

function needsDecision(c: ApiCaseWithOrg): boolean {
  const s = c.status.toLowerCase();
  return (
    s.includes("decision") ||
    s === "review" ||
    s === "in_review" ||
    s === "ready_for_review"
  );
}

export function PendingDecisionsPanel({
  className,
  cases,
}: {
  className?: string;
  cases: ApiCaseWithOrg[] | null;
}) {
  const { go } = useApp();

  const pending = React.useMemo(
    () => (cases ?? []).filter(needsDecision),
    [cases],
  );
  const awaitingCount = pending.length;

  return (
    <section className={cn("bg-white border border-divider rounded-md overflow-hidden", className)}>
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-divider">
        <div className="flex items-center gap-3">
          <AIDot size={6} tone="deep" pulse={awaitingCount > 0} />
          <span className="text-[12px] tracking-[0.08em] uppercase text-surface-deep font-medium">
            Pending KYC decisions
          </span>
        </div>
        <span
          className={cn(
            "px-2.5 py-0.5 rounded-full text-[11px] font-semibold",
            awaitingCount > 0
              ? "bg-surface-sage text-surface-deep"
              : "bg-surface-mint text-surface-deep",
          )}
        >
          {awaitingCount > 0 ? `${awaitingCount} awaiting action` : "All caught up"}
        </span>
      </header>

      {cases === null && (
        <div className="px-4 py-8 text-center text-[14px] text-mute">Loading…</div>
      )}
      {cases !== null && awaitingCount === 0 && (
        <div className="px-4 py-8 text-center text-[14px] text-mute">No cases awaiting decision.</div>
      )}

      <div className="divide-y divide-divider">
        {pending.map((c) => {
          const urgency = urgencyFor(c);
          const orgName = c.organization?.legal_name ?? "Unnamed organization";
          const sub = [
            c.organization?.business_description,
            c.risk_score != null ? `risk score ${Math.round(c.risk_score)}` : null,
          ].filter(Boolean).join(" · ") || c.customer_type;
          return (
            <article
              key={c.id}
              className="px-4 py-3.5 flex items-center justify-between gap-5 transition-colors bg-white hover:bg-surface-mint/40"
            >
              <div className="flex items-center gap-4 min-w-0">
                <span
                  className={cn(
                    "w-[88px] shrink-0 text-center px-3 py-1.5 rounded-md text-[11px] font-bold tracking-[0.08em] uppercase",
                    urgencyChip[urgency],
                  )}
                >
                  {urgency}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[12px] text-mute mb-1">
                    <span className="font-mono">{c.id.slice(0, 8)}</span>
                    <span aria-hidden>·</span>
                    <span className="text-surface-deep capitalize">{c.case_type}</span>
                    <span aria-hidden>·</span>
                    <span>{NAME_MAP[(c.jurisdiction ?? "").toUpperCase()] ?? c.jurisdiction ?? "—"}</span>
                  </div>
                  <div className="text-[15px] font-bold text-ink">{orgName}</div>
                  <div className="text-[12px] text-mute mt-0.5 truncate">{sub}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <PillButton variant="primary" arrow onClick={() => go({ kind: "case", id: c.id })}>
                  Open workspace
                </PillButton>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
