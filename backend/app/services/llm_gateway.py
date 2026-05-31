"""
LLM Gateway: local Ollama runtime (Qwen 2.5 7B by default).

Reliability features:
- Retry with exponential backoff (network / timeout errors only, max 2 retries)
- Circuit breaker (opens after 5 consecutive failures, resets after 60s)
- Token usage capture from Ollama response

Env: OLLAMA_BASE_URL (default http://localhost:11434), OLLAMA_MODEL (default qwen2.5:7b).
All model tiers (lite/flash/pro) route to the same local model.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

from app.config import settings
from app.services.llm_tasks import ModelTier, tier_for_task

logger = logging.getLogger(__name__)

_OLLAMA_TIMEOUT = 180.0
_MAX_RETRIES = 2
_RETRY_BACKOFF = 1.0   # seconds × attempt number
_CB_THRESHOLD = 5      # failures before circuit opens
_CB_RESET_AFTER = 60.0 # seconds until circuit half-opens


# ── Circuit Breaker ──────────────────────────────────────────────────────────

class _CircuitBreaker:
    def __init__(self, threshold: int = _CB_THRESHOLD, reset_after: float = _CB_RESET_AFTER):
        self._threshold = threshold
        self._reset_after = reset_after
        self._failures = 0
        self._opened_at: float | None = None
        self._lock = threading.Lock()

    @property
    def state(self) -> str:
        with self._lock:
            if self._opened_at is None:
                return "closed"
            if time.time() - self._opened_at >= self._reset_after:
                return "half-open"
            return "open"

    def is_open(self) -> bool:
        with self._lock:
            if self._opened_at is None:
                return False
            if time.time() - self._opened_at >= self._reset_after:
                # Half-open: reset and allow one probe
                self._failures = 0
                self._opened_at = None
                return False
            return True

    def record_success(self) -> None:
        with self._lock:
            self._failures = 0
            self._opened_at = None

    def record_failure(self) -> None:
        with self._lock:
            self._failures += 1
            if self._failures >= self._threshold and self._opened_at is None:
                self._opened_at = time.time()
                logger.warning(
                    "LLM circuit breaker OPENED after %d consecutive failures. "
                    "Pausing LLM calls for %.0fs.",
                    self._failures, self._reset_after,
                )


_circuit_breaker = _CircuitBreaker()


def get_circuit_breaker_state() -> dict[str, Any]:
    return {
        "state": _circuit_breaker.state,
        "threshold": _CB_THRESHOLD,
        "reset_after_seconds": _CB_RESET_AFTER,
    }


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class LLMGatewayResult:
    text: str
    task_kind: str
    tier: ModelTier
    model_id: str
    latency_ms: float
    tokens_in: int = 0
    tokens_out: int = 0
    raw_finish_reason: Optional[str] = None


# ── Gateway ───────────────────────────────────────────────────────────────────

class LLMGateway:
    """Routes every task_kind to the single local Ollama model with retry + circuit breaker."""

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
            "circuit_breaker": get_circuit_breaker_state(),
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
            raise RuntimeError("No Ollama model configured. Set OLLAMA_MODEL in .env")
        return tier, self._model

    def _call_ollama(
        self,
        client: httpx.Client,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Single Ollama HTTP call — raises on error, returns parsed JSON."""
        try:
            resp = client.post(f"{self._base_url}/v1/chat/completions", json=payload)
            resp.raise_for_status()
        except httpx.ConnectError as e:
            raise RuntimeError(
                f"Cannot connect to Ollama at {self._base_url}. "
                "Is Ollama running? Try: ollama serve"
            ) from e
        return resp.json()

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

        last_exc: Exception | None = None
        t0 = time.perf_counter()

        with httpx.Client(timeout=_OLLAMA_TIMEOUT) as client:
            for attempt in range(_MAX_RETRIES + 1):
                if _circuit_breaker.is_open():
                    raise RuntimeError(
                        f"LLM circuit breaker is open (>{_CB_THRESHOLD} consecutive failures). "
                        f"Resets after {_CB_RESET_AFTER:.0f}s of no calls."
                    )
                try:
                    data = self._call_ollama(client, payload)
                    _circuit_breaker.record_success()
                    break
                except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError) as e:
                    _circuit_breaker.record_failure()
                    last_exc = e
                    if attempt < _MAX_RETRIES:
                        wait = _RETRY_BACKOFF * (attempt + 1)
                        logger.warning(
                            "Ollama call attempt %d/%d failed (%s) — retrying in %.1fs",
                            attempt + 1, _MAX_RETRIES + 1, type(e).__name__, wait,
                        )
                        time.sleep(wait)
                    else:
                        raise
                except Exception:
                    _circuit_breaker.record_failure()
                    raise

        latency_ms = (time.perf_counter() - t0) * 1000.0

        choice = data["choices"][0]
        text = (choice["message"].get("content") or "").strip()
        finish = choice.get("finish_reason")

        usage = data.get("usage") or {}
        tokens_in = int(usage.get("prompt_tokens") or 0)
        tokens_out = int(usage.get("completion_tokens") or 0)

        logger.info(
            "ollama task=%s model=%s latency=%.0fms tokens=%d+%d finish=%s",
            task_kind, model_id, latency_ms, tokens_in, tokens_out, finish,
        )

        return LLMGatewayResult(
            text=text,
            task_kind=task_kind,
            tier=tier,
            model_id=model_id,
            latency_ms=latency_ms,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
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
            start = 1
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
