import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(ENV_PATH)


def resolve_database_url() -> str:
    """
    Priority:
    1. USE_LOCAL_SQLITE=true  → SQLite (local dev default)
    2. DATABASE_URL env var   → use as-is (Cloud SQL, Supabase, etc.)
    3. CLOUD_SQL_CONNECTION_NAME → build Cloud SQL Unix socket URL for Cloud Run
    """
    if os.getenv("USE_LOCAL_SQLITE", "true").strip().lower() in ("1", "true", "yes"):
        return "sqlite:///./kyc.db"

    db_url = os.getenv("DATABASE_URL")
    if db_url:
        return db_url

    # Cloud Run + Cloud SQL (Unix socket via Cloud SQL Auth Proxy sidecar)
    conn_name = os.getenv("CLOUD_SQL_CONNECTION_NAME")  # e.g. project:region:instance
    db_user   = os.getenv("DB_USER", "kyc")
    db_pass   = os.getenv("DB_PASSWORD", "")
    db_name   = os.getenv("DB_NAME", "kyc")
    if conn_name:
        socket_dir = f"/cloudsql/{conn_name}"
        return (
            f"postgresql+psycopg2://{db_user}:{db_pass}@/{db_name}"
            f"?host={socket_dir}"
        )

    return "sqlite:///./kyc.db"


class Settings(BaseModel):
    app_name: str = "Agentic KYC Platform"
    app_version: str = "0.1.0"
    api_prefix: str = "/api/v1"
    database_url: str = resolve_database_url()
    cors_origins: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:3000,http://localhost:3001"
        ).split(",")
        if origin.strip()
    ]

    # Ollama (local model runtime) — no API key needed
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")

    # Google Gemini — two auth modes (prefer API key; falls back to Vertex AI ADC)
    # Mode 1: API key from https://aistudio.google.com/app/apikey  (recommended for local dev)
    gemini_api_key: str | None = os.getenv("GEMINI_API_KEY") or None
    # Mode 2: Vertex AI ADC — requires `gcloud auth application-default login`
    #          AND Generative AI enabled in your GCP project
    vertex_project_id: str = os.getenv("VERTEX_PROJECT_ID", "just-site-493900-d9")
    vertex_location: str = os.getenv("VERTEX_LOCATION", "us-central1")

    # vLLM — local NVIDIA GPU inference server (OpenAI-compatible)
    # Start: python -m vllm.entrypoints.openai.api_server \
    #   --model meta-llama/Llama-3.1-8B-Instruct --enable-prefix-caching \
    #   --tensor-parallel-size 1 --port 8000
    vllm_base_url: str = os.getenv("VLLM_BASE_URL", "")
    vllm_model: str = os.getenv("VLLM_MODEL", "")
    vllm_tensor_parallel_size: int = int(os.getenv("VLLM_TENSOR_PARALLEL_SIZE", "1"))

    # NVIDIA NIM — cloud inference API (OpenAI-compatible, api.nvidia.com)
    nim_api_key: str | None = os.getenv("NIM_API_KEY") or None
    nim_base_url: str = os.getenv("NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")

    llm_gateway_admin_key: str | None = os.getenv("LLM_GATEWAY_ADMIN_KEY") or None

    upload_dir_name: str = os.getenv("UPLOAD_DIR", "uploads")
    max_upload_bytes: int = int(os.getenv("MAX_UPLOAD_BYTES", str(15 * 1024 * 1024)))

    # Storage backend: "local" (default dev) or "gcs" (production)
    storage_mode: str = os.getenv("STORAGE_MODE", "local")
    gcs_bucket_name: str = os.getenv("GCS_BUCKET_NAME", "")
    gcs_signed_url_expiry: int = int(os.getenv("GCS_SIGNED_URL_EXPIRY", "3600"))

    workflow_use_llm_agents: bool = os.getenv("WORKFLOW_USE_LLM_AGENTS", "true").strip().lower() in (
        "1",
        "true",
        "yes",
    )


settings = Settings()
