import { cn } from "@/lib/utils";
import { useApp } from "@/state";
import { kycPendingDecisions } from "@/data/kyc";
import { PillButton } from "./PillButton";
import { AIDot } from "@/components/ai/AIDot";

const urgencyChip: Record<"critical" | "high" | "medium", string> = {
  critical: "bg-mark-red text-ink-inverse",
  high: "bg-surface-sage text-surface-deep",
  medium: "bg-surface-fog text-ink",
};

export function PendingDecisionsPanel({ className }: { className?: string }) {
  const { go } = useApp();
  const awaitingCount = kycPendingDecisions.length;

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
      <div className="divide-y divide-divider">
        {kycPendingDecisions.map((p) => (
          <article
            key={p.id}
            className="px-4 py-3.5 flex items-center justify-between gap-5 transition-colors bg-white hover:bg-surface-mint/40"
          >
            <div className="flex items-center gap-4 min-w-0">
              <span
                className={cn(
                  "w-[88px] shrink-0 text-center px-3 py-1.5 rounded-md text-[11px] font-bold tracking-[0.08em] uppercase",
                  urgencyChip[p.urgency],
                )}
              >
                {p.urgency}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[12px] text-mute mb-1">
                  <span>{p.id}</span>
                  <span aria-hidden>·</span>
                  <span className="text-surface-deep">{p.type}</span>
                  <span aria-hidden>·</span>
                  <span>{p.jurisdiction}</span>
                </div>
                <div className="text-[15px] font-bold text-ink">{p.title}</div>
                <div className="text-[12px] text-mute mt-0.5">{p.sub}</div>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right leading-tight">
                <div className="text-[11px] tracking-[0.06em] uppercase text-mute">{p.dueLabel}</div>
                <div
                  className={cn(
                    "text-[14px] font-medium",
                    p.urgency === "critical" ? "text-mark-red" : "text-ink",
                  )}
                >
                  {p.dueWhen}
                </div>
              </div>
              <PillButton variant="primary" arrow onClick={() => go(p.target)}>
                Open workspace
              </PillButton>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
