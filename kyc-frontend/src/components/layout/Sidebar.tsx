import * as React from "react";
import { cn } from "@/lib/utils";
import { useApp, type View } from "@/state";
import {
  LayoutDashboard,
  TrendingUp,
  Radar,
  Folder,
  FileText,
  ClipboardList,
  Settings,
  ShieldCheck,
  FilePlus,
} from "lucide-react";

type NavItem = {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  view?: View;
  badge?: { kind: "star" } | { kind: "count"; value: number } | { kind: "soon" };
  comingSoon?: boolean;
};

type Section = { title: string; items: NavItem[] };

const sections: Section[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, view: { kind: "dashboard" } },
      { label: "AI insights", icon: TrendingUp, comingSoon: true, badge: { kind: "soon" } },
    ],
  },
  {
    title: "KYC operations",
    items: [
      { label: "Cases", icon: Folder, view: { kind: "cases" }, badge: { kind: "count", value: 4 } },
      { label: "New intake", icon: FilePlus, view: { kind: "intake" }, badge: { kind: "star" } },
      { label: "Screening watch", icon: Radar, comingSoon: true, badge: { kind: "soon" } },
    ],
  },
  {
    title: "Tasks",
    items: [
      { label: "Tasks", icon: ClipboardList, view: { kind: "tasks" }, badge: { kind: "count", value: 4 } },
      { label: "Audit log", icon: FileText, comingSoon: true, badge: { kind: "soon" } },
    ],
  },
  {
    title: "System",
    items: [{ label: "Settings", icon: Settings, comingSoon: true }],
  },
];

export function Sidebar() {
  const { view, go } = useApp();
  const activeKind = view.kind;

  return (
    <aside className="flex flex-col w-[240px] shrink-0 h-screen bg-white border-r border-divider sticky top-0">
      <div className="px-5 pt-6 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-surface-deep flex items-center justify-center">
            <ShieldCheck className="text-ink-inverse w-4 h-4" />
          </div>
          <div className="leading-tight">
            <div className="text-[14px] font-bold text-ink">KYC concierge</div>
            <div className="text-[12px] text-mute">Agentic AI for compliance</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto pt-3">
        {sections.map((section) => (
          <div key={section.title} className="pb-3">
            <div className="px-5 pb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-mute">
              {section.title}
            </div>
            <ul>
              {section.items.map((item) => {
                const isActive =
                  item.view !== undefined &&
                  (item.view.kind === activeKind ||
                    (item.view.kind === "cases" && activeKind === "case"));
                const Icon = item.icon;
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      disabled={item.comingSoon}
                      onClick={() => item.view && go(item.view)}
                      className={cn(
                        "ui-pill w-full flex items-center gap-2.5 px-5 py-1.5 text-[13px] text-left",
                        "border-l-4 border-transparent",
                        isActive && "bg-surface-mint border-surface-deep text-surface-deep font-medium",
                        !isActive && !item.comingSoon && "text-ink hover:bg-surface-mint/40",
                        item.comingSoon && "text-mute cursor-not-allowed",
                      )}
                    >
                      <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
                      <span className="flex-1">{item.label}</span>
                      {item.badge?.kind === "star" && (
                        <span className="text-surface-deep text-[12px]">★</span>
                      )}
                      {item.badge?.kind === "count" && (
                        <span className="text-[11px] rounded-full bg-surface-fog text-mute px-1.5 py-0.5">
                          {item.badge.value}
                        </span>
                      )}
                      {item.badge?.kind === "soon" && (
                        <span className="text-[11px] text-mute">Soon</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-divider flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-surface-sage flex items-center justify-center text-[12px] font-bold text-surface-deep">
          KY
        </div>
        <div className="leading-tight flex-1 min-w-0">
          <div className="text-[13px] text-ink truncate">Compliance analyst</div>
          <button type="button" className="text-[11px] text-mute hover:text-ink">
            Switch role · Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
