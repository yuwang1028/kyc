"""Local filesystem storage for uploaded case documents."""

from __future__ import annotations

import re
from pathlib import Path
from uuid import UUID, uuid4

from app.config import settings

_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def upload_root() -> Path:
    return _BACKEND_ROOT / settings.upload_dir_name


def _safe_filename(name: str) -> str:
    base = Path(name or "document.pdf").name
    base = re.sub(r"[^\w.\-]+", "_", base)
    return base or "document.pdf"


def save_case_pdf(case_id: UUID, original_name: str, content: bytes) -> tuple[str, Path]:
    """
    Persist PDF bytes under uploads/{case_id}/.
    Returns (relative file_url key, absolute path).
    """
    case_dir = upload_root() / str(case_id)
    case_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid4().hex}_{_safe_filename(original_name)}"
    abs_path = case_dir / stored_name
    abs_path.write_bytes(content)
    rel = f"{settings.upload_dir_name}/{case_id}/{stored_name}"
    return rel, abs_path


def resolve_upload_path(file_url: str) -> Path | None:
    """Map stored file_url to an on-disk path when using local uploads."""
    if not file_url:
        return None
    if file_url.startswith("local://"):
        rel = file_url.removeprefix("local://")
    elif file_url.startswith(f"{settings.upload_dir_name}/"):
        rel = file_url
    else:
        return None
    path = (_BACKEND_ROOT / rel).resolve()
    root = upload_root().resolve()
    if not str(path).startswith(str(root)):
        return None
    return path if path.is_file() else None
