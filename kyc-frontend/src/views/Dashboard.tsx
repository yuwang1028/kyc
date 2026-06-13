import * as React from "react";
import { useApp } from "@/state";
import { TopRow } from "@/components/blocks/TopRow";
import { HeroBanner } from "@/components/blocks/HeroBanner";
import { KPIStrip, type KPI } from "@/components/blocks/KPIStrip";
import { PillButton } from "@/components/blocks/PillButton";
import { CasesPanel } from "@/components/blocks/CasesPanel";
import { JurisdictionsTable } from "@/components/blocks/JurisdictionsTable";
import { PendingDecisionsPanel } from "@/components/blocks/PendingDecisionsPanel";
import { api, type DashboardStats, type ApiCaseWithOrg } from "@/lib/api";

export function Dashboard() {
  const { go } = useApp();
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [cases, setCases] = React.useState<ApiCaseWithOrg[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getDashboardStats().catch(() => null),
      api.listCasesWithOrg(100).catch(() => [] as ApiCaseWithOrg[]),
    ]).then(([s, c]) => {
      if (cancelled) return;
      setStats(s);
      setCases(c);
    });
    return () => { cancelled = true; };
  }, []);

  const kpis: KPI[] = [
    {
      label: "Open cases",
      value: stats?.total_cases ?? 0,
    },
    {
      label: "Need decision",
      value: stats?.pending_review ?? 0,
      highlight: "yellow",
    },
    {
      label: "High risk",
      value: stats?.high_risk ?? 0,
    },
    {
      label: "Approved",
      value: stats?.by_status?.["approved"] ?? 0,
    },
  ];

  const needDecision = stats?.pending_review ?? 0;
  const highRisk = stats?.high_risk ?? 0;

  return (
    <div className="pl-5 pr-6 pt-4 pb-8 space-y-3 min-h-screen bg-[color-mix(in_srgb,var(--surface-mint)_18%,var(--surface-fog))]">
      <TopRow breadcrumb={{ label: "KYC dashboard", chip: "Compliance" }} />

      <HeroBanner
        eyebrow="AI-powered KYC operations"
        summary={
          stats
            ? `${needDecision} case${needDecision !== 1 ? "s" : ""} need your decision · ${highRisk} high-risk · ${stats.total_cases} total open cases.`
            : "Loading pipeline status…"
        }
        cta={
          <PillButton variant="mint" size="sm" onClick={() => go({ kind: "intake" })}>
            + New intake
          </PillButton>
        }
        meta="Live · refreshes on load"
      />

      <KPIStrip items={kpis} />

      <CasesPanel cases={cases} />

      <JurisdictionsTable cases={cases} />

      <PendingDecisionsPanel cases={cases} />
    </div>
  );
}
