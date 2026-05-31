/**
 * Static KYC dashboard data — mirrors the shape of valley-hr-demo's
 * data/cases.ts so the same block components (CasesPanel, AlertsPanel,
 * WorkforceTable, PendingDecisionsPanel) read the same rows.
 */

import type { View } from "@/state";

export type CaseStatusKind = "critical" | "ready" | "progress" | "resolved" | "active" | "ok" | "warn";

export type KycCaseRow = {
  id: string;
  flag: string;
  jurisdiction: string;
  title: string;
  sub: string;
  type: "Onboarding" | "Refresh" | "EDD" | "Periodic review";
  status: string;
  statusKind: CaseStatusKind;
  riskScore?: number;
  target: View;
};

export const kycCases: KycCaseRow[] = [
  {
    id: "KYC-2041",
    flag: "🇨🇳",
    jurisdiction: "China",
    title: "Beijing Hanwei Tech · onboarding",
    sub: "Semiconductor design · PEP potential match · EDD required",
    type: "EDD",
    status: "Needs decision",
    statusKind: "critical",
    riskScore: 81.2,
    target: { kind: "case", id: "kyc-2041" },
  },
  {
    id: "KYC-2039",
    flag: "🇸🇬",
    jurisdiction: "Singapore",
    title: "Singapore Trade Holdings · onboarding",
    sub: "Commodities · OFAC SDN match confirmed · reject recommended",
    type: "Onboarding",
    status: "Critical",
    statusKind: "critical",
    riskScore: 92.3,
    target: { kind: "case", id: "kyc-2039" },
  },
  {
    id: "KYC-2036",
    flag: "🇬🇧",
    jurisdiction: "United Kingdom",
    title: "Lumen Capital Partners · onboarding",
    sub: "Private credit · FCA registered · ready for analyst review",
    type: "Onboarding",
    status: "Ready to review",
    statusKind: "ready",
    riskScore: 64.0,
    target: { kind: "case", id: "kyc-2036" },
  },
  {
    id: "KYC-2034",
    flag: "🇺🇸",
    jurisdiction: "United States",
    title: "Acme Industries · onboarding",
    sub: "Industrial machinery · clean screening · pending UBO confirmation",
    type: "Onboarding",
    status: "In review",
    statusKind: "warn",
    riskScore: 58.4,
    target: { kind: "case", id: "kyc-2034" },
  },
];

export type AlertRow = {
  severity: "critical" | "warning" | "info";
  title: string;
  time: string;
};

export const kycAlerts: AlertRow[] = [
  { severity: "critical", title: "OFAC SDN match · Singapore Trade Holdings",   time: "7:14 AM today" },
  { severity: "critical", title: "PEP potential match · Beijing Hanwei Tech",    time: "11:02 AM today" },
  { severity: "warning",  title: "Lumen Capital · analyst summary ready",         time: "Yesterday" },
  { severity: "info",     title: "Acme Industries · risk score recalculated",     time: "15 May" },
];

export type JurisdictionRow = {
  jurisdiction: string;
  flag: string;
  cases: string;
  highRisk: string;
  activity: string;
  status: string;
  statusKind: "ok" | "active" | "alert" | "warn";
};

export const kycJurisdictions: JurisdictionRow[] = [
  { jurisdiction: "United States · NJ / NY",  flag: "🇺🇸", cases: "42", highRisk: "3", activity: "Acme UBO refresh · industrial pipeline", status: "On track",       statusKind: "ok" },
  { jurisdiction: "United Kingdom · London",   flag: "🇬🇧", cases: "18", highRisk: "2", activity: "Lumen Capital · FCA verification",       status: "Active",         statusKind: "active" },
  { jurisdiction: "Singapore · MAS",           flag: "🇸🇬", cases: "11", highRisk: "4", activity: "OFAC sanctions hit · escalation",       status: "Needs decision", statusKind: "alert" },
  { jurisdiction: "China · cross-border",      flag: "🇨🇳", cases: "9",  highRisk: "5", activity: "PEP + dual-use export review",          status: "Needs decision", statusKind: "alert" },
  { jurisdiction: "European Union · DE / FR",  flag: "🇪🇺", cases: "23", highRisk: "1", activity: "Nordic Maritime · documents complete",  status: "On track",       statusKind: "ok" },
  { jurisdiction: "Lithuania · VASP",          flag: "🇱🇹", cases: "6",  highRisk: "3", activity: "Crypto exchange · EDD package",         status: "Active",         statusKind: "active" },
];

export type PendingDecision = {
  urgency: "critical" | "high" | "medium";
  id: string;
  type: string;
  jurisdiction: string;
  title: string;
  sub: string;
  dueLabel: string;
  dueWhen: string;
  target: View;
};

export const kycPendingDecisions: PendingDecision[] = [
  {
    urgency: "critical",
    id: "KYC-2039",
    type: "Onboarding",
    jurisdiction: "Singapore",
    title: "Singapore Trade Holdings · OFAC match confirmed",
    sub: "True-match disposition on SDN · 1 prior screening hit · recommend reject",
    dueLabel: "Decide by",
    dueWhen: "Today, end of day",
    target: { kind: "case", id: "kyc-2039" },
  },
  {
    urgency: "critical",
    id: "KYC-2041",
    type: "EDD",
    jurisdiction: "China",
    title: "Beijing Hanwei Tech · escalate to enhanced due diligence",
    sub: "PEP potential match + dual-use semiconductor exposure · engage export-control specialist",
    dueLabel: "Decide by",
    dueWhen: "Today, end of day",
    target: { kind: "case", id: "kyc-2041" },
  },
  {
    urgency: "high",
    id: "KYC-2036",
    type: "Onboarding",
    jurisdiction: "United Kingdom",
    title: "Lumen Capital Partners · approve onboarding",
    sub: "Analyst summary memo complete · all documents verified · risk score 64",
    dueLabel: "Decide by",
    dueWhen: "Tomorrow",
    target: { kind: "case", id: "kyc-2036" },
  },
];

/* Sparkline points for the KPI strip — last 8 periods. */
export const kycSparks = {
  openCases: [42, 44, 47, 49, 52, 55, 58, 62],
  needDecision: [1, 1, 2, 1, 2, 2, 3, 3],
  highRisk: [4, 5, 5, 6, 7, 8, 9, 9],
  approved: [38, 41, 45, 49, 54, 60, 66, 72],
};
