import { cn } from "@/lib/utils";
import { kycAlerts } from "@/data/kyc";
import { StaggerList } from "@/components/ai/StaggerList";
import { AIDot } from "@/components/ai/AIDot";

const dotTone: Record<"critical" | "warning" | "info", string> = {
  critical: "bg-mark-red",
  warning: "bg-surface-deep",
  info: "bg-mute",
};

export function AlertsPanel({ className }: { className?: string }) {
  const active = kycAlerts.filter((a) => a.severity !== "info").length;
  return (
    <section className={cn("bg-white border border-divider rounded-md overflow-hidden", className)}>
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-divider">
        <div className="flex items-center gap-3">
          <AIDot size={6} tone="deep" />
          <span className="text-[12px] tracking-[0.08em] uppercase text-surface-deep font-medium">
            Live alerts
          </span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-surface-sage text-surface-deep text-[11px] font-semibold">
          {active} active
        </span>
      </header>
      <StaggerList step={80} initialDelay={200}>
        {kycAlerts.map((a) => (
          <div
            key={a.title + a.time}
            className="px-4 py-3 border-b border-divider last:border-b-0 flex items-start gap-3 hover:bg-surface-mint/40 transition-colors"
          >
            <span
              className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", dotTone[a.severity])}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="text-[13px] text-ink leading-[18px]">{a.title}</div>
              <div className="text-[12px] text-mute mt-0.5">{a.time}</div>
            </div>
          </div>
        ))}
      </StaggerList>
    </section>
  );
}
