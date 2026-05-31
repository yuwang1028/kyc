import * as React from "react";
import { useApp } from "@/state";
import { TopRow } from "@/components/blocks/TopRow";
import { HeroBanner } from "@/components/blocks/HeroBanner";
import { KPIStrip, type KPI } from "@/components/blocks/KPIStrip";
import { PillButton } from "@/components/blocks/PillButton";
import { CasesPanel } from "@/components/blocks/CasesPanel";
import { AlertsPanel } from "@/components/blocks/AlertsPanel";
import { JurisdictionsTable } from "@/components/blocks/JurisdictionsTable";
import { PendingDecisionsPanel } from "@/components/blocks/PendingDecisionsPanel";
import { kycSparks } from "@/data/kyc";
import { api, type DashboardStats } from "@/lib/api";

export function Dashboard() {
  const { go } = useApp();
  const [stats, setStats] = React.useState<DashboardStats | null>(null);

  React.useEffect(() => {
    api.getDashboardStats().then(setStats).catch(() => {});
  }, []);

  const kpis: KPI[] = [
    {
      label: "Open cases",
      value: stats?.total_cases ?? 0,
      trend: { delta: "", direction: "up" },
      spark: kycSparks.openCases,
    },
    {
      label: "Need decision",
      value: stats?.pending_review ?? 0,
      trend: { delta: "", direction: "up" },
      spark: kycSparks.needDecision,
      highlight: "yellow",
    },
    {
      label: "High risk",
      value: stats?.high_risk ?? 0,
      trend: { delta: "", direction: "up" },
      spark: kycSparks.highRisk,
    },
    {
      label: "Approved (30d)",
      value: stats?.by_status?.["approved"] ?? 0,
      trend: { delta: "", direction: "up" },
      spark: kycSparks.approved,
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

      <div className="grid grid-cols-[2fr_1fr] gap-3">
        <CasesPanel />
        <AlertsPanel />
      </div>

      <JurisdictionsTable />

      <PendingDecisionsPanel />
    </div>
  );
}
