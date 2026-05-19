"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "../lib/api";

export default function IntakePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    legal_name: "",
    registration_number: "",
    incorporation_country: "",
    website: "",
    business_description: "",
    jurisdiction: "",
    customer_type: "business",
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm({ ...form, [key]: value });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.createCase({
        organization: {
          legal_name: form.legal_name,
          registration_number: form.registration_number || undefined,
          incorporation_country: form.incorporation_country || undefined,
          website: form.website || undefined,
          business_description: form.business_description || undefined,
        },
        customer_type: form.customer_type,
        jurisdiction: form.jurisdiction || undefined,
      });
      router.push(`/cases/${res.case.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1>External Intake</h1>
      <p style={{ color: "#94a3b8" }}>
        Use Case 1 (new business onboarding): create the case, upload required documents on the case
        page, add UBO/shareholders, then run the full workflow for automated verification,
        screening, risk, and summary.
      </p>
      <p style={{ color: "#64748b", fontSize: 13 }}>
        Required for US pack: certificate_of_incorporation, tax_id_proof, ownership_chart · fields:
        legal_name, registration_number, incorporation_country
      </p>

      {error && (
        <div
          style={{
            background: "#7f1d1d33",
            border: "1px solid #ef4444",
            color: "#fecaca",
            padding: 12,
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        style={{
          display: "grid",
          gap: 12,
          background: "#11162b",
          border: "1px solid #1f2547",
          padding: 18,
          borderRadius: 12,
        }}
      >
        <Field label="Legal Name *" required>
          <input
            value={form.legal_name}
            onChange={(e) => update("legal_name", e.target.value)}
            required
            style={inputStyle}
          />
        </Field>
        <Field label="Registration Number">
          <input
            value={form.registration_number}
            onChange={(e) => update("registration_number", e.target.value)}
            style={inputStyle}
          />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Incorporation Country (ISO)">
            <input
              value={form.incorporation_country}
              onChange={(e) => update("incorporation_country", e.target.value.toUpperCase())}
              maxLength={2}
              placeholder="US"
              style={inputStyle}
            />
          </Field>
          <Field label="Jurisdiction">
            <input
              value={form.jurisdiction}
              onChange={(e) => update("jurisdiction", e.target.value.toUpperCase())}
              placeholder="US"
              style={inputStyle}
            />
          </Field>
        </div>
        <Field label="Customer Type">
          <select
            value={form.customer_type}
            onChange={(e) => update("customer_type", e.target.value)}
            style={inputStyle}
          >
            <option value="business">business</option>
            <option value="merchant">merchant</option>
            <option value="vendor">vendor</option>
            <option value="partner">partner</option>
          </select>
        </Field>
        <Field label="Website">
          <input
            value={form.website}
            onChange={(e) => update("website", e.target.value)}
            placeholder="https://..."
            style={inputStyle}
          />
        </Field>
        <Field label="Business Description">
          <textarea
            value={form.business_description}
            onChange={(e) => update("business_description", e.target.value)}
            rows={3}
            style={{ ...inputStyle, fontFamily: "inherit" }}
          />
        </Field>
        <button
          type="submit"
          disabled={submitting || !form.legal_name}
          style={{
            background: submitting ? "#1f2547" : "#3b82f6",
            color: "white",
            border: "none",
            padding: "10px 16px",
            borderRadius: 8,
            fontWeight: 600,
            cursor: submitting ? "not-allowed" : "pointer",
            justifySelf: "start",
          }}
        >
          {submitting ? "Submitting…" : "Create Case"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, color: "#94a3b8" }}>
        {label}
        {required ? "" : ""}
      </span>
      {children}
    </label>
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
