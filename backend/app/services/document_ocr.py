"""
Extract text and structured fields from uploaded PDFs.

1. pypdf — text layer on digital PDFs (no extra system deps)
2. Ollama/Qwen — field extraction from extracted text when pypdf gets little content
   (Note: local models cannot accept raw PDF bytes; we pass the extracted text instead)
"""

from __future__ import annotations

import io
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from app.services.document_storage import resolve_upload_path
from app.services.llm_gateway import get_llm_gateway

logger = logging.getLogger(__name__)

_MIN_TEXT_CHARS = 80
_PREVIEW_LEN = 600

_FIELD_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "registration_number",
        re.compile(
            r"(?:registration|company|file|document)\s*(?:no|number|#)?[:\s]+([A-Z0-9\-]{4,20})",
            re.I,
        ),
    ),
    (
        "tax_id",
        re.compile(
            r"(?:EIN|TIN|tax\s*id|federal\s*tax)[:\s#]*(\d{2}[-\s]?\d{7})",
            re.I,
        ),
    ),
    (
        "legal_name",
        re.compile(
            r"(?:legal\s*name|company\s*name|name\s*of\s*(?:company|corporation|entity))[:\s]+(.{2,120})",
            re.I,
        ),
    ),
    (
        "incorporation_country",
        re.compile(
            r"(?:country|jurisdiction|state\s*of\s*incorporation)[:\s]+([A-Za-z][A-Za-z\s]{1,40})",
            re.I,
        ),
    ),
]


def _utc_now() -> str:
    return datetime.utcnow().isoformat()


def extract_text_from_pdf_bytes(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        if text.strip():
            parts.append(text)
    return "\n".join(parts).strip()


def _heuristic_fields(text: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, pattern in _FIELD_PATTERNS:
        m = pattern.search(text)
        if m:
            val = m.group(1).strip()
            if key == "legal_name":
                val = val.split("\n")[0].strip(" .,")
            out[key] = val
    ein = re.search(r"\b(\d{2}-\d{7})\b", text)
    if ein and "tax_id" not in out:
        out["tax_id"] = ein.group(1)
    return out


def _llm_extract_from_text(text: str, document_type: str) -> dict[str, Any]:
    """Use local Ollama model to extract structured fields from PDF text."""
    gateway = get_llm_gateway()
    if not gateway.enabled:
        raise RuntimeError("ollama_not_configured")

    system = (
        "You are a KYC document OCR assistant. Extract structured fields from the document text. "
        "Return JSON only with keys: legal_name, registration_number, tax_id, "
        "incorporation_country (ISO-2 if possible). Use null for unknown fields."
    )
    user = (
        f"Document category: {document_type}\n\n"
        f"Document text:\n{text[:3000]}\n\n"
        "Extract the structured fields as JSON."
    )

    parsed, _ = gateway.generate_json(
        task_kind="ocr_field_normalization",
        system_instruction=system,
        user_prompt=user,
        temperature=0.1,
        max_output_tokens=512,
    )
    if not isinstance(parsed, dict):
        raise ValueError("llm_ocr_invalid_json")
    return parsed


def _llm_extract_ubo_parties(text: str) -> list[dict[str, Any]]:
    """Extract all UBO/party entries from a UBO declaration using the local LLM."""
    gateway = get_llm_gateway()
    if not gateway.enabled:
        return []
    system = (
        "You are a KYC compliance specialist. Extract every Ultimate Beneficial Owner (UBO) "
        "listed in this declaration, including those referenced in ownership summary tables. "
        "Return JSON with a single key 'parties' whose value is an array of objects, each with: "
        "full_name (string), nationality (ISO-2 code, e.g. 'US'), "
        "ownership_percentage (float or null), is_managing_member (bool), pep (bool). "
        "Include ALL individuals — do not skip any row from ownership tables."
    )
    user = f"UBO Declaration document text:\n\n{text[:4000]}\n\nReturn JSON only."
    try:
        parsed, _ = gateway.generate_json(
            task_kind="ocr_field_normalization",
            system_instruction=system,
            user_prompt=user,
            temperature=0.1,
            max_output_tokens=1024,
        )
        if not isinstance(parsed, dict):
            return []
        parties = parsed.get("parties", [])
        return parties if isinstance(parties, list) else []
    except Exception as exc:
        logger.warning("UBO party extraction failed: %s", exc)
        return []


def process_pdf_file(
    *,
    abs_path: Path,
    document_type: str,
    file_name: str,
) -> dict[str, Any]:
    """Run OCR / extraction pipeline on a stored PDF."""
    data = abs_path.read_bytes()
    if not data.startswith(b"%PDF"):
        raise ValueError("not_a_pdf")

    text = extract_text_from_pdf_bytes(data)
    ocr_method = "pypdf"
    llm_fields: dict[str, Any] = {}

    if len(text) < _MIN_TEXT_CHARS:
        try:
            llm_fields = _llm_extract_from_text(text or "(no text extracted)", document_type)
            ocr_method = "ollama"
        except Exception as exc:
            logger.warning("Ollama PDF field extraction skipped: %s", exc)
            ocr_method = "pypdf_only"

    heuristics = _heuristic_fields(text)
    merged: dict[str, Any] = {
        "document_type": document_type,
        "file_name": file_name,
        "extracted_at": _utc_now(),
        "ocr_method": ocr_method,
        "raw_text": text,
        "raw_text_preview": text[:_PREVIEW_LEN] if text else "",
        "legal_name": heuristics.get("legal_name") or llm_fields.get("legal_name"),
        "registration_number": heuristics.get("registration_number")
        or llm_fields.get("registration_number"),
        "tax_id": heuristics.get("tax_id") or llm_fields.get("tax_id"),
        "incorporation_country": heuristics.get("incorporation_country")
        or llm_fields.get("incorporation_country"),
    }

    if document_type == "ubo_declaration" and text:
        ubo_parties = _llm_extract_ubo_parties(text)
        if ubo_parties:
            merged["ubo_parties"] = ubo_parties

    return merged


def process_document_record(doc: Any) -> dict[str, Any]:
    """Process a Document ORM row if it points at a local PDF."""
    path = resolve_upload_path(doc.file_url or "")
    if not path:
        return {
            "document_id": str(doc.id),
            "status": "skipped",
            "reason": "no_local_file",
        }
    extracted = process_pdf_file(
        abs_path=path,
        document_type=doc.document_type,
        file_name=doc.file_name,
    )
    return {"document_id": str(doc.id), "status": "parsed", "extracted_fields": extracted}
