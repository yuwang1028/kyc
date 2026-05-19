HIGH_RISK_COUNTRIES = {"IR", "KP", "SY", "RU", "CU", "VE"}


def evaluate_risk(inputs: dict) -> dict:
    score = 0
    triggered: list[str] = []

    if inputs.get("organization_country") in HIGH_RISK_COUNTRIES:
        score += 40
        triggered.append("HR_COUNTRY_EXPOSURE")

    if inputs.get("pep_true_match"):
        score += 60
        triggered.append("PEP_TRUE_MATCH")

    if inputs.get("sanctions_true_match"):
        score += 80
        triggered.append("SANCTIONS_TRUE_MATCH")

    if inputs.get("ownership_complexity_score", 0) > 70:
        score += 30
        triggered.append("OWNERSHIP_COMPLEX")

    if inputs.get("ownership_unresolved"):
        score += 25
        triggered.append("OWNERSHIP_UNRESOLVED")

    if score >= 90:
        level = "high"
    elif score >= 50:
        level = "medium"
    else:
        level = "low"

    edd_triggers = {"PEP_TRUE_MATCH", "SANCTIONS_TRUE_MATCH", "OWNERSHIP_UNRESOLVED"}
    edd_required = bool(edd_triggers.intersection(triggered))

    if level == "low":
        recommendation = "approve_with_standard_monitoring"
    elif level == "medium":
        recommendation = "pending_human_review"
    else:
        recommendation = "escalate_to_manager"

    return {
        "total_score": float(score),
        "risk_level": level,
        "triggered_rules": triggered,
        "edd_required": edd_required,
        "recommendation": recommendation,
    }
