"use client";

import { useEffect, useState } from "react";

export default function LlmStatusBanner() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base =
      process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "") || "http://127.0.0.1:8000";
    fetch(`${base}/healthz`, { cache: "no-store" })
      .then((r) => r.json())
      .then((h) => setError(h.workflow_llm_last_error ?? null))
      .catch(() => setError(null));
  }, []);

  if (!error) return null;

  const ollamaDown = /connect|connection|ollama|11434/i.test(error);

  return (
    <div
      style={{
        background: "#78350f33",
        border: "1px solid #f59e0b",
        color: "#fde68a",
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <strong>Ollama 未连接</strong> — workflow 正在用规则引擎兜底（结果仍然正确，但无 LLM 叙述）。
      <div style={{ marginTop: 6, color: "#fcd34d" }}>{error}</div>
      {ollamaDown ? (
        <pre
          style={{
            marginTop: 8,
            marginBottom: 0,
            fontSize: 12,
            background: "#0b1020",
            padding: 8,
            borderRadius: 6,
          }}
        >
          {`# 启动 Ollama\nollama serve\n\n# 拉取模型（首次需要）\nollama pull qwen2.5:7b`}
        </pre>
      ) : null}
    </div>
  );
}
