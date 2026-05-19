from datetime import datetime

from app.services.agent_llm import enrich_with_llm, workflow_llm_agents_enabled
from app.services.llm_tasks import ModelTier, tier_for_task

POLICY_PACKS = {
    "v1-us-business-onboarding": {
        "required_fields": ["legal_name", "registration_number", "incorporation_country"],
        "required_documents": {
            "certificate_of_incorporation",
            "tax_id_proof",
            "ownership_chart",
        },
    }
}

_INTAKE_SYSTEM = """You are the Intake Agent for business KYC onboarding.
Review organization fields, uploaded documents, and OCR extracted_fields.
Add JSON keys: agent_reasoning (string), remediation_plan (array of strings),
document_quality_notes (array of strings).
You may comment on OCR vs declared data but must NOT alter missing_fields, missing_docs,
intake_completeness_score, or next_actions from the rule baseline."""

_VERIFICATION_SYSTEM = """You are the Verification Agent. Compare organization data with
registry/OCR verification results. Add: agent_reasoning, verification_summary (string, 2-4 sentences),
recommended_follow_ups (array). Do not alter matched_fields, mismatched_fields, anomalies, confidence_score."""

_SCREENING_SYSTEM = """You are the Screening Agent. Synthesize sanctions/PEP/watchlist results.
Add: agent_reasoning, screening_narrative (analyst-ready paragraph), disposition_recommendations (array).
Do not alter potential_hits, likely_false_positives, escalated_hits arrays."""

_OWNERSHIP_SYSTEM = """You are the Ownership/UBO Agent. Explain structure and UBO risks.
Add: agent_reasoning, ownership_narrative (string). Do not alter ubo_candidates, complexity_score,
complexity_flags, unresolved_ownership_issues, ownership_tree."""

_RISK_SYSTEM = """You are the Risk Agent. Interpret risk engine output with screening and ownership context.
Add: agent_reasoning, risk_narrative (string), key_risk_drivers (array of strings).
Do not alter risk_score, risk_level, triggered_rules, edd_required, recommended_disposition."""

_DECISION_SYSTEM = """You are the Decision Support Agent for KYC review. Produce a concise executive_summary
(3-5 sentences for a compliance manager), refine open_issues (array of strings), and optional
reviewer_notes. Do not alter recommendation from rule baseline."""


def _utc_now() -> str:
    return datetime.utcnow().isoformat()


def _normalize_name(value: str | None) -> str:
    return (value or "").strip().lower()


def _satisfied_document_types(documents: list[dict]) -> set[str]:
    latest_by_type: dict[str, dict] = {}
    for doc in documents or []:
        doc_type = doc.get("document_type")
        if not doc_type:
            continue
        current = latest_by_type.get(doc_type)
        doc_created = str(doc.get("created_at") or "")
        current_created = str(current.get("created_at") or "") if current else ""
        if current is None or doc_created >= current_created:
            latest_by_type[doc_type] = doc

    return {
        doc_type
        for doc_type, doc in latest_by_type.items()
        if (doc.get("processing_status") or "").lower() == "parsed"
    }


def _intake_rules(case_snapshot: dict) -> dict:
    policy_pack_version = case_snapshot.get("policy_pack_version") or "v1-us-business-onboarding"
    policy_pack = POLICY_PACKS.get(policy_pack_version, POLICY_PACKS["v1-us-business-onboarding"])

    required_fields = policy_pack["required_fields"]
    required_docs = policy_pack["required_documents"]

    org = case_snapshot.get("organization", {}) or {}
    missing_fields = [field for field in required_fields if not org.get(field)]
    documents = case_snapshot.get("documents", []) or []
    satisfied = _satisfied_document_types(documents)
    missing_docs = sorted(required_docs - satisfied)

    completeness = max(0, 100 - len(missing_fields) * 20 - len(missing_docs) * 20)
    next_actions = ["request_more_info"] if (missing_fields or missing_docs) else ["proceed_to_verification"]

    return {
        "policy_pack_version": policy_pack_version,
        "missing_fields": missing_fields,
        "missing_docs": missing_docs,
        "intake_completeness_score": completeness,
        "next_actions": next_actions,
        "generated_at": _utc_now(),
    }


def run_intake_agent(case_snapshot: dict) -> dict:
    baseline = _intake_rules(case_snapshot)
    preserve = [
        "policy_pack_version",
        "missing_fields",
        "missing_docs",
        "intake_completeness_score",
        "next_actions",
    ]
    return enrich_with_llm(
        "intake_completeness_check",
        system_instruction=_INTAKE_SYSTEM,
        snapshot=case_snapshot,
        baseline=baseline,
        preserve_keys=preserve,
        user_notes="Cross-check OCR extracted_fields on each document against organization fields.",
    )


def _verification_rules(snapshot: dict) -> dict:
    org = snapshot.get("organization") or {}
    verification_results = snapshot.get("verification_results") or []

    matched_fields: list[str] = []
    mismatched_fields: list[dict] = []
    anomalies: list[str] = []
    confidence_values: list[float] = []

    for result in verification_results:
        normalized = result.get("normalized_result") or {}
        provider_conf = result.get("confidence")
        if isinstance(provider_conf, (int, float)):
            confidence_values.append(float(provider_conf))

        for key in ("legal_name", "registration_number", "incorporation_country"):
            expected = _normalize_name(org.get(key))
            actual = _normalize_name(normalized.get(key))
            if expected and actual:
                if expected == actual:
                    matched_fields.append(key)
                else:
                    mismatched_fields.append(
                        {"field": key, "expected": org.get(key), "actual": normalized.get(key)}
                    )

        status = (result.get("status") or "").lower()
        if status in {"failed", "error"}:
            anomalies.append(f"{result.get('verification_type', 'unknown')} returned status {status}")

    if confidence_values:
        confidence_score = round(sum(confidence_values) / len(confidence_values), 3)
    elif mismatched_fields:
        confidence_score = 0.5
    else:
        confidence_score = 0.9

    return {
        "matched_fields": sorted(set(matched_fields)),
        "mismatched_fields": mismatched_fields,
        "anomalies": anomalies,
        "confidence_score": confidence_score,
        "verification_summary": (
            "Verification complete with "
            f"{len(mismatched_fields)} mismatch(es) and {len(anomalies)} anomaly flag(s)."
        ),
        "generated_at": _utc_now(),
    }


def run_verification_agent(snapshot: dict) -> dict:
    baseline = _verification_rules(snapshot)
    return enrich_with_llm(
        "multi_document_cross_check",
        system_instruction=_VERIFICATION_SYSTEM,
        snapshot=snapshot,
        baseline=baseline,
        preserve_keys=["matched_fields", "mismatched_fields", "anomalies", "confidence_score"],
    )


def _screening_rules(snapshot: dict) -> dict:
    results = snapshot.get("screening_results") or []
    potential_hits: list[dict] = []
    likely_false_positives: list[dict] = []
    escalated_hits: list[dict] = []

    for item in results:
        disposition = (item.get("disposition") or "unresolved").lower()
        score = float(item.get("match_score") or 0)
        rec = {
            "screening_type": item.get("screening_type"),
            "query_name": item.get("query_name"),
            "matched_name": item.get("matched_name"),
            "match_score": score,
            "disposition": disposition,
        }

        if disposition in {"true_match", "escalated"}:
            escalated_hits.append(rec)
        elif disposition == "false_positive" or score < 0.6:
            likely_false_positives.append(rec)
        elif score >= 0.6:
            potential_hits.append(rec)

    return {
        "potential_hits": potential_hits,
        "likely_false_positives": likely_false_positives,
        "escalated_hits": escalated_hits,
        "screening_narrative": (
            f"{len(results)} result(s): "
            f"{len(escalated_hits)} escalated, "
            f"{len(potential_hits)} pending analysis, "
            f"{len(likely_false_positives)} likely false positives."
        ),
        "generated_at": _utc_now(),
    }


def run_screening_agent(snapshot: dict) -> dict:
    baseline = _screening_rules(snapshot)
    return enrich_with_llm(
        "screening_hit_synthesis",
        system_instruction=_SCREENING_SYSTEM,
        snapshot=snapshot,
        baseline=baseline,
        preserve_keys=["potential_hits", "likely_false_positives", "escalated_hits"],
    )


def _ownership_rules(snapshot: dict) -> dict:
    structures = snapshot.get("ownership_structures") or []
    latest = structures[0] if structures else {}
    structure_json = latest.get("structure_json") or {}
    ubo_candidates = structure_json.get("ubo_candidates") or []
    control_person_candidates = structure_json.get("control_person_candidates") or []
    unresolved_issues = structure_json.get("unresolved_issues") or []

    complexity_score = float(latest.get("complexity_score") or 0)
    unresolved_flag = bool(latest.get("unresolved_flag") or unresolved_issues)
    complexity_flags: list[str] = []
    if complexity_score > 70:
        complexity_flags.append("complex_ownership_structure")
    if unresolved_flag:
        complexity_flags.append("unresolved_ownership")

    return {
        "ownership_tree": structure_json.get("tree") or structure_json,
        "ubo_candidates": ubo_candidates,
        "control_person_candidates": control_person_candidates,
        "complexity_score": complexity_score,
        "complexity_flags": complexity_flags,
        "unresolved_ownership_issues": unresolved_issues,
        "generated_at": _utc_now(),
    }


def run_ownership_agent(snapshot: dict) -> dict:
    baseline = _ownership_rules(snapshot)
    return enrich_with_llm(
        "ownership_structure_explain",
        system_instruction=_OWNERSHIP_SYSTEM,
        snapshot=snapshot,
        baseline=baseline,
        preserve_keys=[
            "ownership_tree",
            "ubo_candidates",
            "control_person_candidates",
            "complexity_score",
            "complexity_flags",
            "unresolved_ownership_issues",
        ],
    )


def _risk_rules(snapshot: dict) -> dict:
    risk = snapshot.get("risk") or {}
    screening = snapshot.get("screening_agent_output") or {}
    ownership = snapshot.get("ownership_agent_output") or {}

    risk_level = risk.get("risk_level", "unknown")
    total_score = risk.get("total_score", 0)
    triggered_rules = list(risk.get("triggered_rules", []) or [])
    edd_required = bool(risk.get("edd_required"))

    if screening.get("escalated_hits"):
        if "SCREENING_ESCALATED_HIT" not in triggered_rules:
            triggered_rules.append("SCREENING_ESCALATED_HIT")
        edd_required = True

    if ownership.get("complexity_flags"):
        for flag in ownership["complexity_flags"]:
            code = f"OWNERSHIP_{flag.upper()}"
            if code not in triggered_rules:
                triggered_rules.append(code)

    if risk_level in {"high", "prohibited"}:
        recommended_disposition = "escalate"
    elif risk_level == "medium":
        recommended_disposition = "pending_human_review"
    else:
        recommended_disposition = "approve_with_standard_monitoring"

    return {
        "risk_score": total_score,
        "risk_level": risk_level,
        "triggered_rules": triggered_rules,
        "edd_required": edd_required,
        "recommended_disposition": recommended_disposition,
        "structured_rationale": {
            "risk_engine_output": risk,
            "screening_summary": screening.get("screening_narrative"),
            "ownership_flags": ownership.get("complexity_flags", []),
        },
        "llm_tier_hint": tier_for_task("complex_risk_narrative").value,
        "generated_at": _utc_now(),
    }


def run_risk_agent(snapshot: dict) -> dict:
    baseline = _risk_rules(snapshot)
    return enrich_with_llm(
        "complex_risk_narrative",
        system_instruction=_RISK_SYSTEM,
        snapshot=snapshot,
        baseline=baseline,
        preserve_keys=[
            "risk_score",
            "risk_level",
            "triggered_rules",
            "edd_required",
            "recommended_disposition",
        ],
    )


def _decision_rules(snapshot: dict) -> dict:
    risk = snapshot.get("risk_agent_output") or {}
    intake = snapshot.get("intake_agent_output") or {}
    verification = snapshot.get("verification_agent_output") or {}
    screening = snapshot.get("screening_agent_output") or {}
    ownership = snapshot.get("ownership_agent_output") or {}

    missing_docs = list(intake.get("missing_docs") or [])
    missing_fields = list(intake.get("missing_fields") or [])

    open_issues: list[str] = []
    if missing_docs:
        open_issues.append(f"Missing documents: {', '.join(missing_docs)}")
    if missing_fields:
        open_issues.append(f"Missing organization fields: {', '.join(missing_fields)}")
    if verification.get("mismatched_fields"):
        open_issues.append("Verification mismatches detected; confirm source of truth.")
    if screening.get("escalated_hits"):
        open_issues.append("Escalated screening hit(s) require analyst disposition.")
    if ownership.get("complexity_flags"):
        open_issues.append("Ownership structure has complexity/unresolved flags.")

    recommendation = risk.get("recommended_disposition", "pending_human_review")

    docs_detail = f" ({', '.join(missing_docs)})" if missing_docs else ""
    fields_detail = f" ({', '.join(missing_fields)})" if missing_fields else ""
    executive_summary = (
        f"Risk {risk.get('risk_level', 'unknown')} "
        f"(score {risk.get('risk_score', 'n/a')}). "
        f"Missing docs: {len(missing_docs)}{docs_detail}; "
        f"missing fields: {len(missing_fields)}{fields_detail}; "
        f"verification mismatches: {len(verification.get('mismatched_fields', []))}; "
        f"escalated screening hits: {len(screening.get('escalated_hits', []))}."
    )

    return {
        "executive_summary": executive_summary,
        "open_issues": open_issues,
        "recommendation": recommendation,
        "reviewer_checklist": [
            "Review missing intake items and customer remediation plan",
            "Validate verification mismatches against primary evidence",
            "Confirm screening dispositions and false-positive rationale",
            "Validate ownership/UBO findings and escalation triggers",
            "Record explicit decision rationale for audit trail",
        ],
        "llm_tier_hint_decision_support": ModelTier.LITE.value,
        "generated_at": _utc_now(),
    }


def run_decision_support_agent(snapshot: dict) -> dict:
    baseline = _decision_rules(snapshot)
    return enrich_with_llm(
        "simple_case_summary",
        system_instruction=_DECISION_SYSTEM,
        snapshot=snapshot,
        baseline=baseline,
        preserve_keys=["recommendation"],
    )


def run_summary_agent(snapshot: dict) -> dict:
    """Backwards-compatible alias for existing summary endpoint."""
    return run_decision_support_agent(snapshot)


def agents_mode() -> dict:
    """Expose whether workflow agents will call Vertex."""
    return {
        "workflow_llm_agents_enabled": workflow_llm_agents_enabled(),
        "workflow_use_llm_agents_env": True,
    }
