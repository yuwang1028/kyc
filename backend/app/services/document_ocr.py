"""
Extract text and structured fields from uploaded PDFs.

1. pypdf — text layer on digital PDFs (no extra system deps)
2. Vertex Gemini — fallback when little text (scanned PDFs), if configured
"""

from __future__ import annotations

import io
import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from app.config import settings
from app.services.document_storage import resolve_upload_path
from app.services.llm_gateway import get_llm_gateway, get_vertex_genai_client
from app.services.llm_tasks import tier_for_task

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


def _gemini_extract_from_pdf(pdf_bytes: bytes, document_type: str) -> dict[str, Any]:
    gateway = get_llm_gateway()
    if not gateway.enabled:
        raise RuntimeError("vertex_not_configured")

    tier = tier_for_task("document_pdf_ocr")
    _, model_id = gateway.resolve_model_id("document_pdf_ocr", tier_override=tier)

    from google.genai import types

    client = get_vertex_genai_client()
    prompt = (
        "You are a KYC document OCR assistant. Read this PDF and extract structured data. "
        f"Document category: {document_type}. "
        "Return JSON only with keys: raw_text (full visible text), legal_name, "
        "registration_number, tax_id, incorporation_country (ISO-2 if possible). "
        "Use null for unknown fields."
    )
    response = client.models.generate_content(
        model=model_id,
        contents=[
            types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
            types.Part.from_text(text=prompt),
        ],
        config=types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=4096,
            response_mime_type="application/json",
        ),
    )
    raw = (getattr(response, "text", None) or "").strip()
    parsed: dict[str, Any] = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("gemini_ocr_invalid_json")
    return parsed


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
    gemini_fields: dict[str, Any] = {}

    if len(text) < _MIN_TEXT_CHARS:
        try:
            gemini_fields = _gemini_extract_from_pdf(data, document_type)
            ocr_method = "gemini"
            text = (gemini_fields.get("raw_text") or text or "").strip()
        except Exception as exc:
            logger.warning("Gemini PDF OCR skipped: %s", exc)
            ocr_method = "pypdf_only"

    heuristics = _heuristic_fields(text)
    merged: dict[str, Any] = {
        "document_type": document_type,
        "file_name": file_name,
        "extracted_at": _utc_now(),
        "ocr_method": ocr_method,
        "raw_text": text,
        "raw_text_preview": text[:_PREVIEW_LEN] if text else "",
        "legal_name": heuristics.get("legal_name") or gemini_fields.get("legal_name"),
        "registration_number": heuristics.get("registration_number")
        or gemini_fields.get("registration_number"),
        "tax_id": heuristics.get("tax_id") or gemini_fields.get("tax_id"),
        "incorporation_country": heuristics.get("incorporation_country")
        or gemini_fields.get("incorporation_country"),
    }
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
