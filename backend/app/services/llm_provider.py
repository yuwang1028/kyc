"""
Runtime LLM provider configuration.
Stores the active provider (ollama | vertex | vllm | nim) in memory,
persisted to .llm_config.json next to the backend root so the choice survives restarts.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

_CONFIG_FILE = Path(__file__).resolve().parents[2] / ".llm_config.json"
_lock = threading.Lock()
_state: dict[str, Any] = {"provider": "ollama"}


def _load() -> None:
    global _state
    if _CONFIG_FILE.exists():
        try:
            data = json.loads(_CONFIG_FILE.read_text())
            # migrate legacy "gemini" → "vertex"
            if data.get("provider") == "gemini":
                data["provider"] = "vertex"
            _state = {"provider": "ollama", **data}
        except Exception:
            pass


def _save() -> None:
    try:
        _CONFIG_FILE.write_text(json.dumps(_state, indent=2))
    except Exception:
        pass


_load()


def get_provider() -> str:
    with _lock:
        return str(_state.get("provider") or "ollama")


VALID_PROVIDERS = ("ollama", "vertex", "vllm", "nim")


def is_vertex_configured() -> bool:
    from app.config import settings
    # Configured if API key is set OR Vertex ADC project is set
    return bool(settings.gemini_api_key) or bool(settings.vertex_project_id and settings.vertex_location)


def is_vllm_configured() -> bool:
    from app.config import settings
    return bool(settings.vllm_base_url and settings.vllm_model)


def is_nim_configured() -> bool:
    from app.config import settings
    return bool(settings.nim_api_key and settings.nim_base_url)


def set_provider(provider: str) -> None:
    with _lock:
        _state["provider"] = provider
        _save()


def provider_summary() -> dict[str, Any]:
    with _lock:
        return {
            "active":            _state.get("provider", "ollama"),
            "vertex_configured": is_vertex_configured(),
            "vllm_configured":   is_vllm_configured(),
            "nim_configured":    is_nim_configured(),
        }
