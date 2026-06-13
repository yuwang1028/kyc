import * as React from "react";
import { StatusPill } from "./StatusPill";
import { AIDot } from "@/components/ai/AIDot";
import { type ApiCaseWithOrg } from "@/lib/api";

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸", UK: "🇬🇧", SG: "🇸🇬", CN: "🇨🇳", EU: "🇪🇺", HK: "🇭🇰",
  DE: "🇩🇪", FR: "🇫🇷", JP: "🇯🇵", AU: "🇦🇺", LT: "🇱🇹",
};

const NAME_MAP: Record<string, string> = {
  US: "United States", UK: "United Kingdom", SG: "Singapore", CN: "China",
  EU: "European Union", HK: "Hong Kong", DE: "Germany", FR: "France",
  JP: "Japan", AU: "Australia", LT: "Lithuania",
};

const headers = [
  { label: "Jurisdiction",       width: "w-[34%]" },
  { label: "Active cases",       width: "w-[18%]" },
  { label: "High risk",          width: "w-[18%]" },
  { label: "Status",             width: "w-[30%]" },
];

type Row = {
  code: string;
  flag: string;
  label: string;
  cases: number;
  highRisk: number;
  status: string;
  statusKind: "ok" | "active" | "alert" | "warn";
};

function aggregate(cases: ApiCaseWithOrg[]): Row[] {
  const buckets = new Map<string, ApiCaseWithOrg[]>();
  for (const c of cases) {
    const code = (c.jurisdiction ?? "—").toUpperCase();
    if (!buckets.has(code)) buckets.set(code, []);
    buckets.get(code)!.push(c);
  }
  const rows: Row[] = [];
  for (const [code, items] of buckets.entries()) {
    const highRisk = items.filter((c) =>
      (c.risk_level ?? "").toLowerCase() === "high" ||
      (c.risk_level ?? "").toLowerCase() === "critical" ||
      (c.risk_score ?? 0) >= 70,
    ).length;
    const needsDecision = items.some((c) => {
      const s = c.status.toLowerCase();
      return s.includes("decision") || s.includes("rejected") || s.includes("review");
    });
    rows.push({
      code,
      flag: FLAG_MAP[code] ?? "🏳️",
      label: NAME_MAP[code] ?? code,
      cases: items.length,
      highRisk,
      status: needsDecision ? "Needs decision" : "On track",
      statusKind: needsDecision ? "alert" : "ok",
    });
  }
  return rows.sort((a, b) => b.cases - a.cases);
}

export function JurisdictionsTable({ cases }: { cases: ApiCaseWithOrg[] | null }) {
  const rows = React.useMemo(() => (cases ? aggregate(cases) : []), [cases]);

  return (
    <section className="bg-white border border-divider rounded-md overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-divider">
        <div className="flex items-center gap-3">
          <AIDot size={6} tone="deep" />
          <span className="text-[12px] tracking-[0.08em] uppercase text-surface-deep font-medium">
            Global KYC pipeline by jurisdiction
          </span>
        </div>
        <span className="text-[12px] text-mute">{cases?.length ?? 0} cases tracked</span>
      </header>
      <div className="grid grid-cols-[34%_18%_18%_30%] bg-surface-deep text-ink-inverse">
        {headers.map((h) => (
          <div
            key={h.label}
            className="px-4 py-2.5 text-[11px] tracking-[0.08em] uppercase font-medium"
          >
            {h.label}
          </div>
        ))}
      </div>
      {cases === null && (
        <div className="px-4 py-8 text-center text-[14px] text-mute">Loading…</div>
      )}
      {cases !== null && rows.length === 0 && (
        <div className="px-4 py-8 text-center text-[14px] text-mute">No cases in pipeline yet.</div>
      )}
      {rows.map((r) => (
        <div
          key={r.code}
          className="grid grid-cols-[34%_18%_18%_30%] items-center px-0 border-t border-divider first:border-t-0 hover:bg-surface-mint/40 transition-colors"
        >
          <div className="px-4 py-2.5 flex items-center gap-2.5 text-[14px] text-ink whitespace-nowrap">
            <span aria-hidden>{r.flag}</span>
            <span className="truncate">{r.label}</span>
          </div>
          <div className="px-4 py-2.5 text-[14px] text-ink">{r.cases}</div>
          <div className="px-4 py-2.5 text-[14px] text-ink">{r.highRisk}</div>
          <div className="px-4 py-2.5">
            <StatusPill label={r.status} kind={r.statusKind} />
          </div>
        </div>
      ))}
    </section>
  );
}
