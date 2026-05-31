import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  delay?: number;
  className?: string;
};

/**
 * One-shot spring entrance — scale 0.94 → 1.0 with a gentle overshoot.
 * Used for decision cards, scenario picker, doc preview opens.
 */
export function SpringIn({ children, delay = 0, className }: Props) {
  return (
    <div className={cn("ai-spring", className)} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
