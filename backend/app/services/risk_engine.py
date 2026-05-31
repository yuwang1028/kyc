"""
KYC Risk Engine v2 — 5-dimension business risk evaluation.

Dimensions:
  1. Screening / UBO (PEP, sanctions, adverse media)
  2. Country exposure (org registration, UBO nationalities)
  3. Ownership structure (complexity, unresolved UBO)
  4. Industry risk (MSO, crypto, gambling, hawala, …)
  5. Transaction risk (volume, high-risk corridors, cross-border UBO)

Score thresholds: 0–39 low | 40–69 medium | 70–89 high | 90+ prohibited
"""

from __future__ import annotations

import re
from typing import Any

# ── Country sets ──────────────────────────────────────────────────────────────

SANCTIONED_COUNTRIES: set[str] = {"IR", "KP", "SY", "CU", "VE"}
HIGH_RISK_COUNTRIES: set[str] = SANCTIONED_COUNTRIES | {
    "RU", "MM", "BY", "LY", "SS", "SD", "CF", "SO", "YE", "AF",
}

# FATF high-risk corridor keywords (lower-case for substring matching)
CORRIDOR_TOKENS: set[str] = {
    "china", "chinese", "mainland", "renminbi", "rmb", "cny",
    "iran", "iranian",
    "north korea", "dprk",
    "russia", "russian",
    "syria", "syrian",
    "myanmar", "burma",
    "cuba", "venezuela",
    "belarus", "belarusian",
    "afghanistan", "afghan",
    "somalia", "somali",
    "sudan", "south sudan",
    "yemen", "yemeni",
}

# ── Industry risk tokens (lower-case) ─────────────────────────────────────────

HIGH_RISK_INDUSTRY_TOKENS: set[str] = {
    # Money services
    "money service", "money services", "money transfer", "money changing",
    "remittance", "mso", "msb", "licensed money", "money service operator",
    "money service business",
    # FX / currency
    "forex", "foreign exchange", "currency exchange", "currency conversion",
    "fx brokerage",
    # Crypto / digital assets
    "crypto", "bitcoin", "ethereum", "digital asset", "virtual asset",
    "virtual currency", "stablecoin", "nft", "defi", "decentralized finance",
    "cryptocurrency exchange",
    # Gambling
    "gambling", "casino", "gaming", "sports betting", "online betting",
    "wagering",
    # Payments
    "payment service", "payment processing", "payment facilitator",
    "prepaid card", "stored value",
    # Other high-risk
    "hawala", "hundi",
    "precious metal", "gem dealer", "jeweler", "diamond dealer",
    "real estate agent", "estate agent",
    "arms", "weapon", "ammunition", "military equipment",
}

# ── Transaction volume thresholds (USD) ───────────────────────────────────────

VOLUME_HIGH_USD = 50_000_000     # $50M → +15, HITL
VOLUME_VERY_HIGH_USD = 500_000_000  # $500M → +25, HITL


# ── Text helpers ──────────────────────────────────────────────────────────────

def _corpus(inputs: dict) -> str:
    """Merge all available text into one lower-case searchable string."""
    parts: list[str] = [
        (inputs.get("business_description") or "").lower(),
        (inputs.get("jurisdiction") or "").lower(),
    ]
    for doc in (inputs.get("documents") or []):
        ef = doc.get("extracted_fields") or {}
        parts.append((ef.get("raw_text") or "").lower())
        parts.append((ef.get("raw_text_preview") or "").lower())
        parts.append((doc.get("document_type") or "").lower())
    return " ".join(parts)


def _detect_industry(corpus: str) -> bool:
    return any(kw in corpus for kw in HIGH_RISK_INDUSTRY_TOKENS)


def _detect_corridor(corpus: str) -> bool:
    return any(kw in corpus for kw in CORRIDOR_TOKENS)


def _detect_volume(corpus: str) -> float:
    """Return the largest plausible annual transaction volume in USD (0 if not found)."""
    patterns = [
        # "$1.2B" / "USD 1.2 billion" / "1.2 billion"
        (r"(?:usd?[\s$]*)?(\d+(?:\.\d+)?)\s*b(?:illion)?", 1_000_000_000),
        # "$120M" / "USD 120 million" / "120 million"
        (r"(?:usd?[\s$]*)?(\d+(?:\.\d+)?)\s*m(?:illion)?", 1_000_000),
        # Raw large numbers: 120,000,000 or 1200000
        (r"\b(\d{1,3}(?:,\d{3}){2,})\b", 1),
        (r"\b(\d{7,})\b", 1),
    ]
    best = 0.0
    for pat, multiplier in patterns:
        for m in re.finditer(pat, corpus, re.I):
            raw = m.group(1).replace(",", "")
            try:
                val = float(raw) * multiplier
            except ValueError:
                continue
            # Only consider plausible business volumes (>$100K, <$1T)
            if 100_000 <= val <= 1_000_000_000_000:
                best = max(best, val)
    return best


def _detect_cross_border_ubo(inputs: dict) -> bool:
    """True if any UBO/shareholder nationality differs from the org's incorporation country."""
    inc = (
        inputs.get("incorporation_country") or inputs.get("organization_country") or ""
    ).upper().strip()
    if not inc:
        return False
    for pw in inputs.get("ubo_parties") or []:
        # Accept both wrapped {party:{}, relation:{}} and flat dicts
        party = pw.get("party") or pw
        relation = pw.get("relation") or pw
        rel_type = (relation.get("relation_type") or pw.get("relation_type") or "").lower()
        if rel_type not in ("ubo_candidate", "shareholder"):
            continue
        nat = (party.get("nationality") or pw.get("nationality") or "").upper().strip()
        if nat and nat != inc:
            return True
    return False


def _detect_multi_jurisdiction(inputs: dict) -> bool:
    """True if ≥3 distinct country codes appear across org + UBO nationalities."""
    countries: set[str] = set()
    for key in ("incorporation_country", "organization_country"):
        c = (inputs.get(key) or "").upper().strip()
        if c and len(c) == 2:
            countries.add(c)
    jur = (inputs.get("jurisdiction") or "").upper().strip()
    if jur and len(jur) == 2:
        countries.add(jur)
    for pw in inputs.get("ubo_parties") or []:
        party = pw.get("party") or pw
        nat = (party.get("nationality") or pw.get("nationality") or "").upper().strip()
        if nat and len(nat) == 2:
            countries.add(nat)
    return len(countries) >= 3


# ── Main evaluator ────────────────────────────────────────────────────────────

def evaluate_risk(inputs: dict) -> dict[str, Any]:
    """
    Evaluate case risk across 5 dimensions.

    Expected keys in `inputs`:
        organization_country  str (ISO-2)
        incorporation_country str (ISO-2, optional)
        jurisdiction          str (ISO-2, optional)
        business_description  str
        pep_true_match        bool
        sanctions_true_match  bool
        adverse_media_escalated bool
        ownership_complexity_score float
        ownership_unresolved  bool
        documents             list[dict]  — Document ORM rows serialized
        ubo_parties           list[dict]  — {party:{nationality,...}, relation:{relation_type,...}}
    """
    score = 0
    triggered: list[str] = []
    edd_required = False
    hitl_required = False

    corpus = _corpus(inputs)

    # ── 1. Screening ──────────────────────────────────────────────────────────

    if inputs.get("pep_true_match"):
        score += 60
        triggered.append("PEP_TRUE_MATCH")
        edd_required = True

    if inputs.get("sanctions_true_match"):
        score += 80
        triggered.append("SANCTIONS_TRUE_MATCH")
        edd_required = True

    if inputs.get("adverse_media_escalated"):
        score += 20
        triggered.append("ADVERSE_MEDIA_HIT")
        hitl_required = True

    # ── 2. Country exposure ───────────────────────────────────────────────────

    org_country = (
        inputs.get("organization_country") or inputs.get("incorporation_country") or ""
    ).upper().strip()
    if org_country in HIGH_RISK_COUNTRIES:
        score += 40
        triggered.append("HR_COUNTRY_EXPOSURE")
        if org_country in SANCTIONED_COUNTRIES:
            edd_required = True

    # ── 3. Ownership / structural ─────────────────────────────────────────────

    if inputs.get("ownership_complexity_score", 0) > 70:
        score += 30
        triggered.append("OWNERSHIP_COMPLEX")

    if inputs.get("ownership_unresolved"):
        score += 25
        triggered.append("OWNERSHIP_UNRESOLVED")
        edd_required = True

    if _detect_cross_border_ubo(inputs):
        score += 10
        triggered.append("CROSS_BORDER_UBO")

    if _detect_multi_jurisdiction(inputs):
        score += 10
        triggered.append("MULTI_JURISDICTION_OPS")
        edd_required = True

    # ── 4. Industry risk ──────────────────────────────────────────────────────

    if _detect_industry(corpus):
        score += 25
        triggered.append("HIGH_RISK_INDUSTRY")
        edd_required = True

    # ── 5. Corridor / geographic transaction risk ──────────────────────────────

    if _detect_corridor(corpus):
        score += 20
        triggered.append("HIGH_RISK_CORRIDOR")
        hitl_required = True

    # ── 6. Transaction volume ─────────────────────────────────────────────────

    vol = _detect_volume(corpus)
    if vol >= VOLUME_VERY_HIGH_USD:
        score += 25
        triggered.append("TRANSACTION_VOLUME_VERY_HIGH")
        hitl_required = True
    elif vol >= VOLUME_HIGH_USD:
        score += 15
        triggered.append("TRANSACTION_VOLUME_HIGH")
        hitl_required = True

    # ── Derive level ──────────────────────────────────────────────────────────

    # Cap at 100 for display; keep raw for internal logic
    display_score = float(min(score, 100))

    if score >= 90:
        level = "prohibited"
    elif score >= 70:
        level = "high"
    elif score >= 40:
        level = "medium"
    else:
        level = "low"

    edd_required = edd_required or level in ("high", "prohibited")
    hitl_required = hitl_required or level in ("high", "prohibited")

    if level in ("high", "prohibited"):
        recommendation = "escalate_to_manager"
    elif level == "medium" or hitl_required:
        recommendation = "pending_human_review"
    else:
        recommendation = "approve_with_standard_monitoring"

    return {
        "total_score": display_score,
        "risk_level": level,
        "triggered_rules": triggered,
        "edd_required": edd_required,
        "hitl_required": hitl_required,
        "recommendation": recommendation,
        "rationale": {
            "raw_score": score,
            "transaction_volume_detected_usd": vol if vol > 0 else None,
            "industry_flag": _detect_industry(corpus),
            "corridor_flag": _detect_corridor(corpus),
            "cross_border_ubo": _detect_cross_border_ubo(inputs),
            "multi_jurisdiction": _detect_multi_jurisdiction(inputs),
        },
    }
