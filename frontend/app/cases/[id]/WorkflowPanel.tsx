"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api, type WorkflowRunResult } from "../../lib/api";

const PHASE_ORDER = [
  "intake",
  "verification",
  "screening",
  "ownership",
  "risk",
  "review",
];

export default function WorkflowPanel({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkflowRunResult | null>(null);

  async function runPipeline() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.runWorkflow(caseId);
      setResult(res);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        background: "#0f1530",
        border: "1px solid #3b82f6",
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Onboarding pipeline</h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 14 }}>
        Runs PRD phases 1–6 with Vertex Gemini agents (rules + LLM). Each phase may take
        several seconds. Upload required documents first; incomplete intake stops at phase 1.
      </p>
      {error && (
        <div style={{ color: "#fecaca", marginBottom: 12, fontSize: 13 }}>{error}</div>
      )}
      <button
        onClick={runPipeline}
        disabled={busy}
        style={{
          background: busy ? "#1f2547" : "#2563eb",
          color: "white",
          border: "none",
          padding: "10px 18px",
          borderRadius: 8,
          fontWeight: 700,
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "Running pipeline…" : "Run full workflow"}
      </button>

      {result && (
        <div style={{ marginTop: 16 }}>
          <p style={{ margin: "8px 0", fontSize: 14 }}>
            Final status: <b>{result.final_status}</b>
            {result.risk_level && (
              <>
                {" "}
                · Risk <b>{result.risk_level}</b> ({result.risk_score})
              </>
            )}
            {result.stopped_early && (
              <span style={{ color: "#fbbf24" }}> — stopped early (fix intake first)</span>
            )}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PHASE_ORDER.map((name) => {
              const phase = result.phases.find((p) => p.phase === name);
              const status = phase?.status || "pending";
              const color =
                status === "completed"
                  ? "#22c55e"
                  : status === "skipped"
                    ? "#64748b"
                    : "#334155";
              return (
                <div
                  key={name}
                  style={{
                    background: `${color}33`,
                    border: `1px solid ${color}`,
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {name}: {status}
                </div>
              );
            })}
          </div>
          {result.phases.find((p) => p.phase === "review")?.output?.executive_summary && (
            <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5 }}>
              {String(result.phases.find((p) => p.phase === "review")?.output?.executive_summary)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
