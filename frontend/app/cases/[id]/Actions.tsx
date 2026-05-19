"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "../../lib/api";

const DOC_TYPES = [
  "certificate_of_incorporation",
  "tax_id_proof",
  "good_standing",
  "articles",
  "ownership_chart",
  "director_list",
  "ubo_id",
  "proof_of_address",
  "business_license",
];

export default function CaseActions({ caseId }: { caseId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [screening, setScreening] = useState({
    party_name: "",
    screening_type: "sanctions",
    query_name: "",
    matched_name: "",
    match_score: 0,
    disposition: "unresolved",
  });
  const [decision, setDecision] = useState({
    decision_type: "approve",
    decision_reason: "",
    decision_notes: "",
  });
  const [party, setParty] = useState({
    legal_name: "",
    relation_type: "ubo_candidate",
    ownership_percentage: "",
  });
  const [country, setCountry] = useState("");

  async function run<T>(label: string, fn: () => Promise<T>) {
    try {
      setBusy(label);
      setError(null);
      await fn();
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file (.pdf)");
      setSelectedFile(null);
      return;
    }
    setError(null);
    setSelectedFile(file);
  }

  return (
    <div style={{ marginTop: 24 }}>
        <h2>Actions</h2>
        {error && (
          <div
            style={{
              background: "#7f1d1d33",
              border: "1px solid #ef4444",
              color: "#fecaca",
              padding: 10,
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          <Card title="Organization">
          <input
            placeholder="Incorporation country (e.g. US)"
            style={inputStyle}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
          <Btn
            disabled={busy !== null || !country.trim()}
            label="Save country"
            onClick={() =>
              run("country", () =>
                api.patchOrganization(caseId, {
                  incorporation_country: country.trim().toUpperCase(),
                })
              )
            }
          />
        </Card>

        <Card title="Quick actions">
            <Btn
              disabled={busy !== null}
              label={busy === "submit" ? "…" : "Submit for review"}
              onClick={() => run("submit", () => api.submitCase(caseId))}
            />
            <Btn
              disabled={busy !== null}
              label={busy === "intake" ? "…" : "Intake agent only"}
              onClick={() => run("intake", () => api.runIntakeAgent(caseId))}
            />
            <Btn
              disabled={busy !== null}
              label={busy === "summary" ? "…" : "Summary only"}
              onClick={() => run("summary", () => api.runSummaryAgent(caseId))}
            />
          </Card>

          <Card title="UBO / shareholder">
            <input
              placeholder="Legal name"
              style={inputStyle}
              value={party.legal_name}
              onChange={(e) => setParty({ ...party, legal_name: e.target.value })}
            />
            <select
              style={inputStyle}
              value={party.relation_type}
              onChange={(e) => setParty({ ...party, relation_type: e.target.value })}
            >
              <option value="ubo_candidate">ubo_candidate</option>
              <option value="shareholder">shareholder</option>
              <option value="director">director</option>
              <option value="control_person">control_person</option>
            </select>
            <input
              placeholder="Ownership %"
              style={inputStyle}
              type="number"
              value={party.ownership_percentage}
              onChange={(e) => setParty({ ...party, ownership_percentage: e.target.value })}
            />
            <Btn
              disabled={busy !== null || !party.legal_name}
              label="Add party"
              onClick={() =>
                run("party", () =>
                  api.addParty(caseId, {
                    legal_name: party.legal_name,
                    relation_type: party.relation_type,
                    ownership_percentage: party.ownership_percentage
                      ? Number(party.ownership_percentage)
                      : undefined,
                  })
                )
              }
            />
          </Card>

          <Card title="Upload PDF">
            <select
              style={inputStyle}
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              style={{ ...inputStyle, padding: 6 }}
              onChange={onFileChange}
            />
            {selectedFile && (
              <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
                {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
              </p>
            )}
            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
              OCR on upload: pypdf text layer; Gemini for scanned PDFs if Vertex is set.
            </p>
            <Btn
              disabled={busy !== null || !selectedFile}
              label={busy === "doc" ? "Uploading…" : "Upload PDF"}
              onClick={() =>
                run("doc", () => api.uploadDocumentPdf(caseId, docType, selectedFile!))
              }
            />
          </Card>

          <Card title="Add Screening Hit">
            <input
              placeholder="party name"
              style={inputStyle}
              value={screening.party_name}
              onChange={(e) => setScreening({ ...screening, party_name: e.target.value })}
            />
            <select
              style={inputStyle}
              value={screening.screening_type}
              onChange={(e) => setScreening({ ...screening, screening_type: e.target.value })}
            >
              <option value="sanctions">sanctions</option>
              <option value="pep">pep</option>
              <option value="adverse_media">adverse_media</option>
              <option value="watchlist">watchlist</option>
            </select>
            <input
              placeholder="query name"
              style={inputStyle}
              value={screening.query_name}
              onChange={(e) => setScreening({ ...screening, query_name: e.target.value })}
            />
            <input
              placeholder="matched name (optional)"
              style={inputStyle}
              value={screening.matched_name}
              onChange={(e) => setScreening({ ...screening, matched_name: e.target.value })}
            />
            <select
              style={inputStyle}
              value={screening.disposition}
              onChange={(e) => setScreening({ ...screening, disposition: e.target.value })}
            >
              <option value="unresolved">unresolved</option>
              <option value="false_positive">false_positive</option>
              <option value="escalated">escalated</option>
              <option value="true_match">true_match</option>
            </select>
            <Btn
              disabled={busy !== null || !screening.party_name || !screening.query_name}
              label="Add"
              onClick={() => run("screen", () => api.addScreening(caseId, screening))}
            />
          </Card>

          <Card title="Decision">
            <select
              style={inputStyle}
              value={decision.decision_type}
              onChange={(e) => setDecision({ ...decision, decision_type: e.target.value })}
            >
              <option value="approve">approve</option>
              <option value="reject">reject</option>
              <option value="request_more_info">request_more_info</option>
              <option value="escalate">escalate</option>
            </select>
            <input
              placeholder="reason"
              style={inputStyle}
              value={decision.decision_reason}
              onChange={(e) => setDecision({ ...decision, decision_reason: e.target.value })}
            />
            <textarea
              rows={3}
              placeholder="notes"
              style={{ ...inputStyle, fontFamily: "inherit" }}
              value={decision.decision_notes}
              onChange={(e) => setDecision({ ...decision, decision_notes: e.target.value })}
            />
            <Btn
              disabled={busy !== null}
              label="Record Decision"
              onClick={() => run("decision", () => api.decide(caseId, decision))}
            />
          </Card>
        </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#11162b",
        border: "1px solid #1f2547",
        borderRadius: 12,
        padding: 14,
        display: "grid",
        gap: 8,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14 }}>{title}</h3>
      {children}
    </div>
  );
}

function Btn({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#1f2547" : "#3b82f6",
        color: "white",
        border: "none",
        padding: "8px 12px",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#0b1020",
  border: "1px solid #1f2547",
  color: "#e5e7eb",
  padding: "8px 10px",
  borderRadius: 8,
  fontSize: 14,
};
