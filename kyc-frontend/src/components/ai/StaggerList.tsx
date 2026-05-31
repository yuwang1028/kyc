import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  /** Delay between siblings in ms. */
  step?: number;
  /** Initial delay before the first child appears. */
  initialDelay?: number;
  className?: string;
};

/**
 * Stagger-reveal container. Wraps each child with a fade + slide-up animation
 * offset by `step` ms. Used for activity log rows, auto-action queues, and
 * the per-row reveal of cases / alerts on the dashboard.
 */
export function StaggerList({ children, step = 80, initialDelay = 0, className }: Props) {
  const arr = React.Children.toArray(children);
  return (
    <div className={cn("flex flex-col", className)}>
      {arr.map((child, i) => (
        <div
          key={i}
          className="ai-stream"
          style={{ animationDelay: `${initialDelay + i * step}ms` }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
