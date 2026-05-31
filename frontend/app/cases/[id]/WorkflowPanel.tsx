"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { api, type WorkflowRunStatus } from "../../lib/api";

const PHASE_ORDER = ["intake", "verification", "screening", "ownership", "risk", "review"];
const POLL_INTERVAL_MS = 2000;

const STATUS_COLOR: Record<string, string> = {
  completed: "#22c55e",
  skipped: "#64748b",
  pending: "#334155",
};

const RUN_STATUS_COLOR: Record<string, string> = {
  pending: "#f59e0b",
  running: "#3b82f6",
  completed: "#22c55e",
  failed: "#ef4444",
};

export default function WorkflowPanel({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<WorkflowRunStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollRun = useCallback(
    async (caseId: string, runId: string) => {
      try {
        const status = await api.getWorkflowRun(caseId, runId);
        setRunStatus(status);

        if (status.status === "completed" || status.status === "failed") {
          stopPolling();
          setBusy(false);
          router.refresh();
        }
      } catch {
        stopPolling();
        setBusy(false);
        setError("Lost connection while polling workflow status.");
      }
    },
    [router, stopPolling]
  );

  async function runPipeline() {
    setBusy(true);
    setError(null);
    setRunStatus(null);
    stopPolling();

    try {
      const { run_id } = await api.runWorkflow(caseId);
      // Start polling immediately, then every POLL_INTERVAL_MS
      await pollRun(caseId, run_id);
      pollRef.current = setInterval(() => pollRun(caseId, run_id), POLL_INTERVAL_MS);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const result = runStatus?.result;
  const runState = runStatus?.status;

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
        Runs PRD phases 1–6 with Qwen 2.5 7B agents (rules + LLM). Upload required documents
        first; incomplete intake stops at phase 1.
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

      {/* Live status bar */}
      {runStatus && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span
              style={{
                background: `${RUN_STATUS_COLOR[runState!] ?? "#334155"}22`,
                color: RUN_STATUS_COLOR[runState!] ?? "#94a3b8",
                border: `1px solid ${RUN_STATUS_COLOR[runState!] ?? "#334155"}`,
                borderRadius: 999,
                padding: "2px 10px",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {runState}
            </span>
            {runStatus.elapsed_seconds != null && (
              <span style={{ fontSize: 12, color: "#64748b" }}>
                {runStatus.elapsed_seconds.toFixed(1)}s
              </span>
            )}
            {runStatus.slow_warning && (
              <span style={{ fontSize: 12, color: "#f59e0b" }}>⚠ slow run</span>
            )}
          </div>

          {runStatus.error && (
            <div style={{ color: "#fca5a5", fontSize: 13, marginBottom: 8 }}>
              {runStatus.error}
            </div>
          )}

          {/* Phase badges — shown once result is available */}
          {result && (
            <>
              <p style={{ margin: "0 0 8px", fontSize: 14 }}>
                Final status: <b>{result.final_status}</b>
                {result.risk_level && (
                  <> · Risk <b>{result.risk_level}</b> ({result.risk_score})</>
                )}
                {result.stopped_early && (
                  <span style={{ color: "#fbbf24" }}> — stopped early (fix intake first)</span>
                )}
              </p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PHASE_ORDER.map((name) => {
                  const phase = result.phases.find((p) => p.phase === name);
                  const status = phase?.status || "pending";
                  const color = STATUS_COLOR[status] ?? "#334155";
                  const llmUsed = (phase?.output as Record<string, unknown>)?.llm_used;
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
                      {llmUsed && (
                        <span style={{ color: "#818cf8", marginLeft: 4, fontWeight: 400 }}>
                          · LLM
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {result.phases.find((p) => p.phase === "review")?.output?.executive_summary && (
                <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5 }}>
                  {String(
                    result.phases.find((p) => p.phase === "review")?.output?.executive_summary
                  )}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
