"""Document storage — local filesystem (dev) or GCS (production).

Switch via env var:  STORAGE_MODE=local | gcs
GCS also requires:   GCS_BUCKET_NAME=<your-bucket>
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from pathlib import Path
from uuid import UUID, uuid4

from app.config import settings

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _safe_filename(name: str) -> str:
    base = Path(name or "document.pdf").name
    base = re.sub(r"[^\w.\-]+", "_", base)
    return base or "document.pdf"


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------
class DocumentStorage(ABC):
    @abstractmethod
    def save(self, case_id: UUID, original_name: str, content: bytes) -> str:
        """Persist bytes and return a storage key used as file_url in DB."""

    @abstractmethod
    def resolve(self, file_url: str) -> bytes | None:
        """Return raw bytes for file_url, or None if not found."""

    @abstractmethod
    def public_url(self, file_url: str) -> str | None:
        """Return a URL for redirect/stream, or None (local serves inline)."""


# ---------------------------------------------------------------------------
# Local filesystem implementation (dev / SQLite)
# ---------------------------------------------------------------------------
class LocalDocumentStorage(DocumentStorage):
    def _upload_root(self) -> Path:
        return _BACKEND_ROOT / settings.upload_dir_name

    def save(self, case_id: UUID, original_name: str, content: bytes) -> str:
        case_dir = self._upload_root() / str(case_id)
        case_dir.mkdir(parents=True, exist_ok=True)
        stored_name = f"{uuid4().hex}_{_safe_filename(original_name)}"
        abs_path = case_dir / stored_name
        abs_path.write_bytes(content)
        return f"{settings.upload_dir_name}/{case_id}/{stored_name}"

    def resolve(self, file_url: str) -> bytes | None:
        path = self._path_from_url(file_url)
        return path.read_bytes() if path and path.is_file() else None

    def public_url(self, file_url: str) -> str | None:
        return None  # served inline by FastAPI route

    def _path_from_url(self, file_url: str) -> Path | None:
        if not file_url:
            return None
        if file_url.startswith("local://"):
            rel = file_url.removeprefix("local://")
        elif file_url.startswith(f"{settings.upload_dir_name}/"):
            rel = file_url
        else:
            return None
        path = (_BACKEND_ROOT / rel).resolve()
        root = self._upload_root().resolve()
        if not str(path).startswith(str(root)):
            return None
        return path


# ---------------------------------------------------------------------------
# GCS implementation (Cloud Run / production)
# ---------------------------------------------------------------------------
class GCSDocumentStorage(DocumentStorage):
    def __init__(self) -> None:
        from google.cloud import storage as gcs  # type: ignore[import-untyped]
        self._client = gcs.Client()
        self._bucket = self._client.bucket(settings.gcs_bucket_name)

    def _blob_name(self, case_id: UUID, original_name: str) -> str:
        return f"uploads/{case_id}/{uuid4().hex}_{_safe_filename(original_name)}"

    def save(self, case_id: UUID, original_name: str, content: bytes) -> str:
        blob_name = self._blob_name(case_id, original_name)
        blob = self._bucket.blob(blob_name)
        blob.upload_from_string(content, content_type="application/pdf")
        return f"gcs://{settings.gcs_bucket_name}/{blob_name}"

    def resolve(self, file_url: str) -> bytes | None:
        blob_name = self._blob_name_from_url(file_url)
        if not blob_name:
            return None
        blob = self._bucket.blob(blob_name)
        return blob.download_as_bytes() if blob.exists() else None

    def public_url(self, file_url: str) -> str | None:
        import datetime
        blob_name = self._blob_name_from_url(file_url)
        if not blob_name:
            return None
        blob = self._bucket.blob(blob_name)

        # On Cloud Run the default credentials only carry an access token, not a
        # private key, so generate_signed_url() needs to delegate signing to the
        # IAM signBlob API. Refresh the token, then pass service_account_email +
        # access_token so the SDK does an IAM-signed URL.
        from google.auth import default as google_default
        from google.auth.transport import requests as g_requests

        credentials, _ = google_default()
        if not credentials.valid:
            credentials.refresh(g_requests.Request())

        return blob.generate_signed_url(
            expiration=datetime.timedelta(seconds=settings.gcs_signed_url_expiry),
            method="GET",
            version="v4",
            service_account_email=getattr(credentials, "service_account_email", None),
            access_token=getattr(credentials, "token", None),
        )

    def _blob_name_from_url(self, file_url: str) -> str | None:
        prefix = f"gcs://{settings.gcs_bucket_name}/"
        if file_url.startswith(prefix):
            return file_url.removeprefix(prefix)
        return None


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------
_storage: DocumentStorage | None = None


def _get() -> DocumentStorage:
    global _storage
    if _storage is None:
        _storage = GCSDocumentStorage() if settings.storage_mode == "gcs" else LocalDocumentStorage()
    return _storage


# ---------------------------------------------------------------------------
# Public API — backwards-compatible with routes.py
# ---------------------------------------------------------------------------
def save_case_pdf(case_id: UUID, original_name: str, content: bytes) -> tuple[str, None]:
    """Persist file, return (file_url_key, None).  None replaces the old abs Path."""
    return _get().save(case_id, original_name, content), None


def resolve_upload_path(file_url: str) -> Path | None:
    """Legacy local-only helper used by existing download route."""
    store = _get()
    if isinstance(store, LocalDocumentStorage):
        return store._path_from_url(file_url)
    return None


def resolve_upload_bytes(file_url: str) -> bytes | None:
    """Works for both local and GCS."""
    return _get().resolve(file_url)


def resolve_public_url(file_url: str) -> str | None:
    """GCS signed URL (production) or None (local, served by FastAPI)."""
    return _get().public_url(file_url)


# Legacy: upload_root() used nowhere else but keep for safety
def upload_root() -> Path:
    return _BACKEND_ROOT / settings.upload_dir_name
