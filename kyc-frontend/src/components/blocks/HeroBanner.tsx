import * as React from "react";
import { Sparkles } from "lucide-react";
import { StreamingText } from "@/components/ai/StreamingText";
import { SpringIn } from "@/components/ai/SpringIn";

export function HeroBanner({
  eyebrow,
  summary,
  cta,
  meta,
}: {
  eyebrow: string;
  summary: string;
  cta?: React.ReactNode;
  meta?: string;
}) {
  return (
    <SpringIn>
      <section className="bg-surface-deep text-ink-inverse rounded-md px-5 py-3.5 flex items-center justify-between gap-5">
        <div className="flex items-center gap-3.5 min-w-0">
          <Sparkles
            size={28}
            strokeWidth={1.6}
            className="text-surface-sage shrink-0 hr-pulse"
            aria-hidden
          />
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Sparkles
                size={11}
                strokeWidth={2}
                className="text-ink-inverse shrink-0"
                aria-hidden
              />
              <span className="text-[11px] tracking-[0.08em] uppercase text-ink-inverse font-medium">
                {eyebrow}
              </span>
            </div>
            <div className="text-[14px] text-ink-inverse">
              <StreamingText text={summary} cps={75} caret={false} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {meta && <span className="text-[12px] text-ink-inverse/70">{meta}</span>}
          {cta}
        </div>
      </section>
    </SpringIn>
  );
}
