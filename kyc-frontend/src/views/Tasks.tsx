import { TopRow } from "@/components/blocks/TopRow";
import { StatusPill } from "@/components/blocks/StatusPill";
import { AIDot } from "@/components/ai/AIDot";
import { StaggerList } from "@/components/ai/StaggerList";

const tasks = [
  { id: "T-1041", title: "Request ownership chart from Beijing Hanwei",          case: "KYC-2041", status: "Open",        kind: "warn" as const,  due: "Today, 6:00pm" },
  { id: "T-1039", title: "Confirm OFAC sanctions match · Singapore Trade",       case: "KYC-2039", status: "Open",        kind: "alert" as const, due: "Today, 5:00pm" },
  { id: "T-1036", title: "Verify Lumen Capital FCA registration",                 case: "KYC-2036", status: "In progress", kind: "active" as const,due: "Tomorrow" },
  { id: "T-1034", title: "Request UBO declaration from Acme Industries",          case: "KYC-2034", status: "Open",        kind: "warn" as const,  due: "Fri 31 May" },
  { id: "T-1029", title: "Annual periodic review · Nordic Maritime",              case: "KYC-1987", status: "Done",        kind: "ok" as const,    due: "Closed" },
];

export function Tasks() {
  return (
    <div className="pl-5 pr-6 pt-4 pb-8 space-y-3 min-h-screen bg-[color-mix(in_srgb,var(--surface-mint)_18%,var(--surface-fog))]">
      <TopRow breadcrumb={{ label: "Tasks", chip: `${tasks.filter(t => t.status !== "Done").length} open` }} />

      <section className="bg-white border border-divider rounded-md overflow-hidden">
        <header className="px-4 py-2.5 border-b border-divider flex items-center gap-3">
          <AIDot size={6} tone="deep" />
          <span className="text-[12px] tracking-[0.08em] uppercase text-surface-deep font-medium">
            Analyst task queue
          </span>
        </header>
        <div className="grid grid-cols-[100px_3fr_120px_140px_160px] bg-surface-deep text-ink-inverse text-[11px] uppercase tracking-[0.08em] font-medium">
          <div className="px-4 py-2.5">Task</div>
          <div className="px-4 py-2.5">Title</div>
          <div className="px-4 py-2.5">Case</div>
          <div className="px-4 py-2.5">Status</div>
          <div className="px-4 py-2.5">Due</div>
        </div>
        <StaggerList step={50}>
          {tasks.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-[100px_3fr_120px_140px_160px] items-center border-t border-divider text-[13px] hover:bg-surface-mint/40"
            >
              <div className="px-4 py-3 font-mono text-mute">{t.id}</div>
              <div className="px-4 py-3 font-medium">{t.title}</div>
              <div className="px-4 py-3 text-mute">{t.case}</div>
              <div className="px-4 py-3"><StatusPill label={t.status} kind={t.kind} /></div>
              <div className="px-4 py-3 text-mute">{t.due}</div>
            </div>
          ))}
        </StaggerList>
      </section>
    </div>
  );
}
