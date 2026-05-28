"""
LLM Gateway: local Ollama runtime (Qwen 2.5 7B by default).

No API key required — Ollama runs entirely on-prem.

Env: OLLAMA_BASE_URL (default http://localhost:11434), OLLAMA_MODEL (default qwen2.5:7b).
All model tiers (lite/flash/pro) route to the same local model; the tier field is kept for
auditability and future multi-model routing.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from app.config import settings
from app.services.llm_tasks import ModelTier, tier_for_task

logger = logging.getLogger(__name__)

_OLLAMA_TIMEOUT = 180.0  # seconds — local 7B inference can take 10-30s per call


@dataclass
class LLMGatewayResult:
    text: str
    task_kind: str
    tier: ModelTier
    model_id: str
    latency_ms: float
    raw_finish_reason: Optional[str] = None


class LLMGateway:
    """Routes every task_kind to the single local Ollama model."""

    def __init__(self) -> None:
        self._base_url = settings.ollama_base_url.rstrip("/")
        self._model = settings.ollama_model

    @property
    def enabled(self) -> bool:
        return bool(self._base_url and self._model)

    def meta(self) -> dict[str, Any]:
        return {
            "runtime": "ollama",
            "ollama_configured": self.enabled,
            "base_url": self._base_url if self.enabled else None,
            "model": self._model if self.enabled else None,
            "models": {"lite": True, "flash": True, "pro": True},
            "model_ids_preview": {
                "lite": self._model,
                "flash": self._model,
                "pro": self._model,
            },
        }

    def resolve_model_id(
        self, task_kind: str, tier_override: Optional[ModelTier] = None
    ) -> tuple[ModelTier, str]:
        tier = tier_override or tier_for_task(task_kind)
        if not self._model:
            raise RuntimeError(
                "No Ollama model configured. Set OLLAMA_MODEL in .env"
            )
        return tier, self._model

    def generate(
        self,
        *,
        task_kind: str,
        user_prompt: str,
        system_instruction: Optional[str] = None,
        json_mode: bool = False,
        temperature: float = 0.2,
        max_output_tokens: int = 2048,
        tier_override: Optional[ModelTier] = None,
    ) -> LLMGatewayResult:
        if not self.enabled:
            raise RuntimeError(
                "Ollama is not configured. Set OLLAMA_BASE_URL and OLLAMA_MODEL in .env, "
                "then run: ollama serve && ollama pull qwen2.5:7b"
            )

        tier, model_id = self.resolve_model_id(task_kind, tier_override=tier_override)

        messages: list[dict[str, str]] = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": user_prompt})

        payload: dict[str, Any] = {
            "model": model_id,
            "messages": messages,
            "stream": False,
            "temperature": temperature,
            "max_tokens": max_output_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        t0 = time.perf_counter()
        try:
            with httpx.Client(timeout=_OLLAMA_TIMEOUT) as client:
                resp = client.post(
                    f"{self._base_url}/v1/chat/completions",
                    json=payload,
                )
                resp.raise_for_status()
        except httpx.ConnectError as e:
            raise RuntimeError(
                f"Cannot connect to Ollama at {self._base_url}. "
                "Is Ollama running? Try: ollama serve"
            ) from e
        latency_ms = (time.perf_counter() - t0) * 1000.0

        data = resp.json()
        choice = data["choices"][0]
        text = (choice["message"].get("content") or "").strip()
        finish = choice.get("finish_reason")

        logger.info(
            "ollama task=%s model=%s latency=%.0fms finish=%s",
            task_kind, model_id, latency_ms, finish,
        )

        return LLMGatewayResult(
            text=text,
            task_kind=task_kind,
            tier=tier,
            model_id=model_id,
            latency_ms=latency_ms,
            raw_finish_reason=finish,
        )

    def generate_json(
        self,
        *,
        task_kind: str,
        user_prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.1,
        max_output_tokens: int = 4096,
        tier_override: Optional[ModelTier] = None,
    ) -> tuple[dict[str, Any], LLMGatewayResult]:
        raw = self.generate(
            task_kind=task_kind,
            user_prompt=user_prompt,
            system_instruction=system_instruction,
            json_mode=True,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            tier_override=tier_override,
        )
        text = raw.text
        # Strip markdown code fences that some models emit despite json_mode
        if text.startswith("```"):
            lines = text.splitlines()
            start = 1  # skip ```json or ```
            end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
            text = "\n".join(lines[start:end])
        try:
            parsed: dict[str, Any] = json.loads(text)
        except json.JSONDecodeError as e:
            raise ValueError(
                f"LLM returned invalid JSON: {e}\nRaw output: {raw.text[:300]}"
            ) from e
        return parsed, raw


_gateway: Optional[LLMGateway] = None


def get_llm_gateway() -> LLMGateway:
    global _gateway
    if _gateway is None:
        _gateway = LLMGateway()
    return _gateway


def get_ollama_http_client() -> httpx.Client:
    """Shared httpx client for direct Ollama calls (agent loop tool use)."""
    if not settings.ollama_base_url:
        raise RuntimeError("Ollama is not configured (OLLAMA_BASE_URL).")
    return httpx.Client(timeout=_OLLAMA_TIMEOUT)
