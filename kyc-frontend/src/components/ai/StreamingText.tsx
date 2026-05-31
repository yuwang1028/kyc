import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  /** Characters per second. Default 60. */
  cps?: number;
  /** Delay before the typewriter starts (ms). */
  startDelay?: number;
  /** Show a blinking caret while typing. */
  caret?: boolean;
  className?: string;
  /** Called once the full text has been typed. */
  onDone?: () => void;
};

/**
 * Character-by-character text reveal — used for AI summary lines, alert
 * banners and chat bubbles. Uses requestAnimationFrame so it stays smooth
 * even with long strings.
 */
export function StreamingText({
  text,
  cps = 60,
  startDelay = 0,
  caret = true,
  className,
  onDone,
}: Props) {
  const safeText = text ?? "";
  const [shown, setShown] = React.useState(0);

  React.useEffect(() => {
    setShown(0);
    let raf = 0;
    let start = 0;
    const msPerChar = 1000 / cps;

    const tick = (now: number) => {
      if (!start) start = now + startDelay;
      const elapsed = Math.max(0, now - start);
      const next = Math.min(safeText.length, Math.floor(elapsed / msPerChar));
      setShown(next);
      if (next < safeText.length) raf = requestAnimationFrame(tick);
      else onDone?.();
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [safeText, cps, startDelay, onDone]);

  const done = shown >= safeText.length;
  return (
    <span className={cn(caret && !done ? "ai-caret" : "", className)}>
      {safeText.slice(0, shown)}
    </span>
  );
}
