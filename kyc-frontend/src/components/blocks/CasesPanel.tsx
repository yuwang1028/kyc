import { cn } from "@/lib/utils";
import { useApp } from "@/state";
import { kycCases } from "@/data/kyc";
import { StatusPill } from "./StatusPill";
import { StaggerList } from "@/components/ai/StaggerList";
import { AIDot } from "@/components/ai/AIDot";

const showCount = 4;

export function CasesPanel({ className }: { className?: string }) {
  const { go } = useApp();
  const visible = kycCases.slice(0, showCount);

  return (
    <section className={cn("bg-white border border-divider rounded-md overflow-hidden", className)}>
      <header className="px-4 py-2.5 border-b border-divider flex items-center gap-3">
        <AIDot size={6} tone="deep" />
        <span className="text-[12px] tracking-[0.08em] uppercase text-surface-deep font-medium">
          Active KYC cases
        </span>
        <span className="text-[12px] text-mute">Open the workspace from any row</span>
      </header>
      <StaggerList step={70}>
        {visible.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => go(c.target)}
            className="ui-pill w-full px-4 py-3 border-b border-divider last:border-b-0 flex items-center justify-between gap-4 text-left hover:bg-surface-mint/40"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-8 h-8 rounded-full bg-surface-fog flex items-center justify-center text-[16px] shrink-0"
                aria-hidden
              >
                {c.flag}
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-medium text-ink truncate">{c.title}</div>
                <div className="text-[12px] text-mute truncate">{c.sub}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <StatusPill label={c.status} kind={c.statusKind} />
              <span className="text-ink" aria-hidden>→</span>
            </div>
          </button>
        ))}
      </StaggerList>
      <button
        type="button"
        onClick={() => go({ kind: "cases" })}
        className="ui-pill w-full px-4 py-2.5 flex items-center justify-between text-[13px] text-surface-deep font-medium hover:bg-surface-mint/40"
      >
        <span>View all {kycCases.length} cases</span>
        <span aria-hidden>→</span>
      </button>
    </section>
  );
}
