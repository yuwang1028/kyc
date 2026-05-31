import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: number;
  pulse?: boolean;
  tone?: "deep" | "green" | "mint" | "red" | "mute" | "ink-inverse" | "yellow";
};

const toneClass: Record<NonNullable<Props["tone"]>, string> = {
  deep: "bg-surface-deep",
  green: "bg-accent-green",
  mint: "bg-surface-mint",
  red: "bg-mark-red",
  mute: "bg-mute",
  "ink-inverse": "bg-ink-inverse",
  yellow: "bg-surface-sage",
};

/**
 * Animated agent-state dot. Optionally pulses to signal "agent is thinking".
 */
export function AIDot({ className, size = 8, pulse = false, tone = "deep" }: Props) {
  return (
    <span
      className={cn(
        "inline-block rounded-full shrink-0",
        toneClass[tone],
        pulse && "ai-pulse",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
