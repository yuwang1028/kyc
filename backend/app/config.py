import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(ENV_PATH)


def resolve_database_url() -> str:
    """Default local dev: SQLite (`USE_LOCAL_SQLITE=true`). Set false to use DATABASE_URL (Postgres)."""
    if os.getenv("USE_LOCAL_SQLITE", "true").strip().lower() in ("1", "true", "yes"):
        return "sqlite:///./kyc.db"
    return os.getenv("DATABASE_URL", "sqlite:///./kyc.db")


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

    llm_gateway_admin_key: str | None = os.getenv("LLM_GATEWAY_ADMIN_KEY") or None

    upload_dir_name: str = os.getenv("UPLOAD_DIR", "uploads")
    max_upload_bytes: int = int(os.getenv("MAX_UPLOAD_BYTES", str(15 * 1024 * 1024)))
    workflow_use_llm_agents: bool = os.getenv("WORKFLOW_USE_LLM_AGENTS", "true").strip().lower() in (
        "1",
        "true",
        "yes",
    )


settings = Settings()
