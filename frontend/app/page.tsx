import Link from "next/link";

import { api, type Case } from "./lib/api";

function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    approved: "#16a34a",
    rejected: "#dc2626",
    pending_human_review: "#f59e0b",
    pending_manager_approval: "#a855f7",
    awaiting_documents: "#0ea5e9",
    intake_review: "#0ea5e9",
    verification_in_progress: "#38bdf8",
    screening_in_progress: "#38bdf8",
    risk_assessment_in_progress: "#38bdf8",
    refresh_due: "#f97316",
  };
  const color = palette[status] || "#64748b";
  return (
    <span
      style={{
        background: `${color}22`,
        color,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        background: "#11162b",
        border: "1px solid #1f2547",
        borderRadius: 12,
        padding: "14px 18px",
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 12, color: "#94a3b8" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default async function Dashboard() {
  let cases: Case[] = [];
  let stats: Awaited<ReturnType<typeof api.getDashboardStats>> | null = null;
  let error: string | null = null;
  try {
    [cases, stats] = await Promise.all([api.listCases(), api.getDashboardStats()]);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ marginBottom: 6 }}>Analyst Console</h1>
        <Link
          href="/intake"
          style={{
            background: "#3b82f6",
            color: "white",
            padding: "8px 14px",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          + New Onboarding
        </Link>
      </div>
      <p style={{ color: "#94a3b8", marginTop: 0 }}>
        PRD flow: intake → verification → screening → ownership → risk → human review.
      </p>

      {error && (
        <div
          style={{
            background: "#7f1d1d33",
            border: "1px solid #ef4444",
            color: "#fecaca",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          API error: {error}
        </div>
      )}

      {stats && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <StatCard label="Total cases" value={stats.total_cases} />
          <StatCard label="Pending review" value={stats.pending_review} />
          <StatCard label="High risk" value={stats.high_risk} />
        </div>
      )}

      <div
        style={{
          background: "#11162b",
          border: "1px solid #1f2547",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#0f1530", textAlign: "left" }}>
              <th style={{ padding: 12, fontSize: 12, color: "#94a3b8" }}>Case</th>
              <th style={{ padding: 12, fontSize: 12, color: "#94a3b8" }}>Type</th>
              <th style={{ padding: 12, fontSize: 12, color: "#94a3b8" }}>Jurisdiction</th>
              <th style={{ padding: 12, fontSize: 12, color: "#94a3b8" }}>Status</th>
              <th style={{ padding: 12, fontSize: 12, color: "#94a3b8" }}>Risk</th>
              <th style={{ padding: 12, fontSize: 12, color: "#94a3b8" }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 && !error && (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
                  No cases yet. Start from External Intake.
                </td>
              </tr>
            )}
            {cases.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid #1f2547" }}>
                <td style={{ padding: 12 }}>
                  <Link href={`/cases/${c.id}`} style={{ color: "#93c5fd" }}>
                    {c.id.slice(0, 8)}…
                  </Link>
                </td>
                <td style={{ padding: 12 }}>{c.case_type}</td>
                <td style={{ padding: 12 }}>{c.jurisdiction || "—"}</td>
                <td style={{ padding: 12 }}>
                  <StatusBadge status={c.status} />
                </td>
                <td style={{ padding: 12 }}>
                  {c.risk_level ? `${c.risk_level} (${c.risk_score ?? "n/a"})` : "—"}
                </td>
                <td style={{ padding: 12, color: "#94a3b8" }}>
                  {new Date(c.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
