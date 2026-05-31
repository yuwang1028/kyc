import { cn } from "@/lib/utils";

type Props = {
  searchPlaceholder?: string;
  breadcrumb: { label: string; chip?: string };
  className?: string;
};

export function TopRow({
  searchPlaceholder = "Search cases, parties, alerts…",
  breadcrumb,
  className,
}: Props) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="px-4 py-2 rounded-full bg-white border border-divider text-[14px] text-mute w-[420px] max-w-full">
        <span className="mr-2">🔍</span>
        {searchPlaceholder}
      </div>
      <div className="flex items-center gap-3 text-[13px]">
        <span className="text-mute">{breadcrumb.label}</span>
        {breadcrumb.chip && (
          <>
            <span className="w-px h-4 bg-divider" />
            <span className="px-2.5 py-1 rounded-full bg-surface-fog text-ink text-[11px] font-medium tracking-[0.08em] uppercase">
              {breadcrumb.chip}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
