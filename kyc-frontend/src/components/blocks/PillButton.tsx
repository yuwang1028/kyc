import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "deep" | "mint";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent-green text-ink-inverse hover:bg-accent-green-deep focus-visible:ring-2 focus-visible:ring-[var(--surface-sage)] focus-visible:ring-offset-1 outline-none",
  secondary: "bg-white text-ink border border-ink/80 hover:bg-surface-fog hover:border-accent-green",
  ghost: "bg-transparent text-ink hover:bg-surface-fog hover:text-accent-green",
  deep: "bg-surface-deep text-ink-inverse hover:bg-accent-green focus-visible:ring-2 focus-visible:ring-[var(--surface-sage)] outline-none",
  mint: "bg-surface-sage text-surface-deep hover:bg-accent-green hover:text-ink-inverse",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[13px]",
  md: "px-4 py-2 text-[14px]",
  lg: "px-5 py-3 text-[15px]",
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
};

export function PillButton({
  variant = "primary",
  size = "md",
  arrow,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={cn(
        "ui-pill inline-flex items-center gap-2 rounded-full font-bold whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
      {arrow && <span aria-hidden>→</span>}
    </button>
  );
}
