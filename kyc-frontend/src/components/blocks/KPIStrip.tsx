import { cn } from "@/lib/utils";
import { CountUp } from "@/components/ai/CountUp";
import { Sparkline } from "@/components/ai/Sparkline";

export type KPI = {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  trend?: { delta: string; direction: "up" | "down" | "flat" };
  spark?: number[];
  highlight?: "yellow";
  onClick?: () => void;
};

const trendTone = {
  up: "text-surface-deep",
  down: "text-mark-red",
  flat: "text-mute",
};

const colsClass: Record<3 | 4 | 5 | 6, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

export function KPIStrip({
  items,
  cols = 4,
  className,
}: {
  items: KPI[];
  cols?: 3 | 4 | 5 | 6;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3", colsClass[cols], className)}>
      {items.map((k, i) => (
        <article
          key={k.label}
          onClick={k.onClick}
          role={k.onClick ? "button" : undefined}
          tabIndex={k.onClick ? 0 : undefined}
          className={cn(
            "rounded-md px-4 py-3 flex flex-col justify-between h-[92px] transition-all",
            k.highlight === "yellow"
              ? "bg-surface-sage border border-surface-sage text-surface-deep"
              : "bg-white border border-divider",
            k.onClick && "cursor-pointer hover:shadow-md hover:-translate-y-0.5",
          )}
        >
          <div
            className={cn(
              "text-[12px] tracking-[0.08em] uppercase font-medium",
              k.highlight === "yellow" ? "text-surface-deep" : "text-mute",
            )}
          >
            {k.label}
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="leading-none">
              <div className="flex items-baseline gap-2">
                <span className="text-[24px] leading-[28px] font-bold tracking-[-0.02em] text-ink">
                  <CountUp
                    to={k.value}
                    duration={1100}
                    delay={i * 90}
                    decimals={k.decimals ?? 0}
                    prefix={k.prefix}
                    suffix={k.suffix}
                    grouped
                  />
                </span>
                {k.trend && (
                  <span className={cn("text-[13px] font-medium", trendTone[k.trend.direction])}>
                    {k.trend.direction === "up" ? "↑" : k.trend.direction === "down" ? "↓" : "·"}{" "}
                    {k.trend.delta}
                  </span>
                )}
              </div>
            </div>
            {k.spark && <Sparkline points={k.spark} filled />}
          </div>
        </article>
      ))}
    </div>
  );
}
