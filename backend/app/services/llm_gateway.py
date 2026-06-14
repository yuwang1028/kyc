"""
LLM Gateway — multi-backend (Ollama / Vertex AI / vLLM / NVIDIA NIM).

Active backend is controlled at runtime via llm_provider.set_provider().
All backends expose the same generate() / generate_json() interface.

Ollama:    local model, OpenAI-compatible, no GPU required.
Vertex AI: tier-mapped Gemini models via ADC.
vLLM:      NVIDIA GPU inference — PagedAttention + prefix caching.
NIM:       NVIDIA NIM cloud API — tier-mapped Llama 3.1 models.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

import httpx

from app.config import settings
from app.services.llm_tasks import ModelTier, tier_for_task

logger = logging.getLogger(__name__)

# ── Timeouts / retry / circuit-breaker ───────────────────────────────────────

_OLLAMA_TIMEOUT  = 180.0
_VERTEX_TIMEOUT  = 60.0
# NIM Nemotron 70B can take 60-150s per call (reasoning + JSON mode); give
# the read enough head-room so the workflow doesn't spuriously fall back to
# rules-only.
_NIM_TIMEOUT     = 180.0
_MAX_RETRIES     = 2
_RETRY_BACKOFF   = 1.0
_CB_THRESHOLD    = 5
_CB_RESET_AFTER  = 60.0

# ── Model tier mappings ───────────────────────────────────────────────────────

VERTEX_MODELS: dict[ModelTier, str] = {
    ModelTier.LITE:  "gemini-2.5-flash-lite",
    ModelTier.FLASH: "gemini-2.5-flash",
    ModelTier.PRO:   "gemini-2.5-pro",
}

# Gemini AI Studio API endpoint (used when GEMINI_API_KEY is set)
_GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# NVIDIA NIM tier mapping → currently-deployed NVIDIA Nemotron functions on
# build.nvidia.com.  The older nvidia/llama-3.1-nemotron-70b-instruct (and the
# 8B-nano + 253B-ultra variants) were retired; their function IDs return 404.
# The current Nemotron Super 49B is faster (~200 ms ping) and equally suited
# for KYC reasoning, so we use it for both FLASH and PRO until an Ultra-class
# Nemotron function is re-published.
NIM_MODELS: dict[ModelTier, str] = {
    ModelTier.LITE:  "nvidia/nemotron-mini-4b-instruct",
    ModelTier.FLASH: "nvidia/llama-3.3-nemotron-super-49b-v1",
    ModelTier.PRO:   "nvidia/llama-3.3-nemotron-super-49b-v1",
}


# ── Circuit Breaker ───────────────────────────────────────────────────────────

class _CircuitBreaker:
    def __init__(self, threshold: int = _CB_THRESHOLD, reset_after: float = _CB_RESET_AFTER):
        self._threshold   = threshold
        self._reset_after = reset_after
        self._failures    = 0
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


_ollama_cb = _CircuitBreaker()
_vertex_cb = _CircuitBreaker()
_vllm_cb   = _CircuitBreaker()
_nim_cb    = _CircuitBreaker()

# keep the old name as alias so existing callers (meta, tests) still work
_circuit_breaker = _ollama_cb


def get_circuit_breaker_state() -> dict[str, Any]:
    def _cb_info(cb: _CircuitBreaker) -> dict[str, Any]:
        return {"state": cb.state, "threshold": _CB_THRESHOLD, "reset_after_seconds": _CB_RESET_AFTER}
    return {
        "ollama": _cb_info(_ollama_cb),
        "vertex": _cb_info(_vertex_cb),
        "vllm":   _cb_info(_vllm_cb),
        "nim":    _cb_info(_nim_cb),
    }


# ── KV Prefix Cache Tracker ───────────────────────────────────────────────────

class PrefixCacheTracker:
    """
    Application-level KV cache hit rate tracker for vLLM PagedAttention prefix caching.
    Records per-task_kind cache hits from vLLM's prompt_tokens_details.cached_tokens.
    Enables monitoring whether shared agent system prompts are reused across runs.
    """

    def __init__(self) -> None:
        self._lock  = threading.Lock()
        self._stats: dict[str, dict[str, int]] = {}

    def record_hit(self, task_kind: str, cached_tokens: int, total_prompt_tokens: int) -> None:
        with self._lock:
            if task_kind not in self._stats:
                self._stats[task_kind] = {"cached_tokens": 0, "total_prompt_tokens": 0, "calls": 0}
            s = self._stats[task_kind]
            s["cached_tokens"]       += cached_tokens
            s["total_prompt_tokens"] += total_prompt_tokens
            s["calls"]               += 1

    def summary(self) -> dict[str, Any]:
        with self._lock:
            result: dict[str, Any] = {}
            for task, s in self._stats.items():
                total    = s["total_prompt_tokens"]
                hit_rate = s["cached_tokens"] / total if total > 0 else 0.0
                result[task] = {
                    "calls":               s["calls"],
                    "cached_tokens":       s["cached_tokens"],
                    "total_prompt_tokens": total,
                    "hit_rate":            round(hit_rate, 4),
                }
            return result

    def reset(self) -> None:
        with self._lock:
            self._stats.clear()


_prefix_cache_tracker = PrefixCacheTracker()


def get_prefix_cache_stats() -> dict[str, Any]:
    return _prefix_cache_tracker.summary()


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


# ── Shared JSON strip helper ──────────────────────────────────────────────────

def _strip_fences(text: str) -> str:
    if text.startswith("```"):
        lines = text.splitlines()
        start = 1
        end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
        return "\n".join(lines[start:end])
    return text


# ── Ollama Gateway ────────────────────────────────────────────────────────────

class OllamaGateway:
    """Routes every task_kind to the single local Ollama model."""

    def __init__(self) -> None:
        self._base_url = settings.ollama_base_url.rstrip("/")
        self._model    = settings.ollama_model

    @property
    def enabled(self) -> bool:
        return bool(self._base_url and self._model)

    def meta(self) -> dict[str, Any]:
        return {
            "runtime":           "ollama",
            "ollama_configured": self.enabled,
            "base_url":          self._base_url if self.enabled else None,
            "model":             self._model if self.enabled else None,
            "circuit_breaker":   get_circuit_breaker_state(),
            "models": {
                "lite":  self._model,
                "flash": self._model,
                "pro":   self._model,
            },
        }

    def resolve_model_id(
        self, task_kind: str, tier_override: Optional[ModelTier] = None
    ) -> tuple[ModelTier, str]:
        tier = tier_override or tier_for_task(task_kind)
        if not self._model:
            raise RuntimeError("No Ollama model configured. Set OLLAMA_MODEL in .env")
        return tier, self._model

    def _raw_call(self, client: httpx.Client, payload: dict[str, Any]) -> dict[str, Any]:
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
            "model": model_id, "messages": messages, "stream": False,
            "temperature": temperature, "max_tokens": max_output_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        t0 = time.perf_counter()
        with httpx.Client(timeout=_OLLAMA_TIMEOUT) as client:
            for attempt in range(_MAX_RETRIES + 1):
                if _ollama_cb.is_open():
                    raise RuntimeError("LLM circuit breaker is open (ollama).")
                try:
                    data = self._raw_call(client, payload)
                    _ollama_cb.record_success()
                    break
                except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError) as e:
                    _ollama_cb.record_failure()
                    if attempt < _MAX_RETRIES:
                        time.sleep(_RETRY_BACKOFF * (attempt + 1))
                    else:
                        raise
                except Exception:
                    _ollama_cb.record_failure()
                    raise

        latency_ms = (time.perf_counter() - t0) * 1000.0
        choice  = data["choices"][0]
        text    = (choice["message"].get("content") or "").strip()
        finish  = choice.get("finish_reason")
        usage   = data.get("usage") or {}

        logger.info("ollama task=%s model=%s latency=%.0fms", task_kind, model_id, latency_ms)
        return LLMGatewayResult(
            text=text, task_kind=task_kind, tier=tier, model_id=model_id,
            latency_ms=latency_ms,
            tokens_in=int(usage.get("prompt_tokens") or 0),
            tokens_out=int(usage.get("completion_tokens") or 0),
            raw_finish_reason=finish,
        )

    def generate_json(
        self, *, task_kind: str, user_prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.1, max_output_tokens: int = 4096,
        tier_override: Optional[ModelTier] = None,
    ) -> tuple[dict[str, Any], LLMGatewayResult]:
        raw = self.generate(
            task_kind=task_kind, user_prompt=user_prompt,
            system_instruction=system_instruction, json_mode=True,
            temperature=temperature, max_output_tokens=max_output_tokens,
            tier_override=tier_override,
        )
        text = _strip_fences(raw.text)
        try:
            return json.loads(text), raw
        except json.JSONDecodeError as e:
            raise ValueError(f"LLM returned invalid JSON: {e}\nRaw: {raw.text[:300]}") from e


# ── Vertex AI Gateway ────────────────────────────────────────────────────────

class VertexAIGateway:
    """
    Google Gemini gateway — dual auth mode:
      1. API key (GEMINI_API_KEY): uses generativelanguage.googleapis.com — simpler, no GCP setup.
      2. Vertex AI ADC: uses aiplatform.googleapis.com — requires GCP project with Gemini enabled.
    Mode 1 takes priority when GEMINI_API_KEY is set.
    Tier mapping: lite/flash → gemini-1.5-flash, pro → gemini-1.5-pro.
    """

    def __init__(self) -> None:
        self._api_key  = settings.gemini_api_key
        self._project  = settings.vertex_project_id
        self._location = settings.vertex_location
        self._creds: Any = None
        self._creds_lock = threading.Lock()

    @property
    def _use_api_key(self) -> bool:
        return bool(self._api_key)

    @property
    def enabled(self) -> bool:
        return bool(self._api_key) or bool(self._project and self._location)

    def _get_access_token(self) -> str:
        import google.auth
        import google.auth.transport.requests
        with self._creds_lock:
            if self._creds is None:
                self._creds, _ = google.auth.default(
                    scopes=["https://www.googleapis.com/auth/cloud-platform"]
                )
            auth_req = google.auth.transport.requests.Request()
            self._creds.refresh(auth_req)
            return str(self._creds.token)

    def _endpoint(self, model_id: str) -> str:
        if self._use_api_key:
            return f"{_GEMINI_API_BASE}/{model_id}:generateContent?key={self._api_key}"
        return (
            f"https://{self._location}-aiplatform.googleapis.com/v1"
            f"/projects/{self._project}/locations/{self._location}"
            f"/publishers/google/models/{model_id}:generateContent"
        )

    def meta(self) -> dict[str, Any]:
        return {
            "runtime":       "gemini-api-key" if self._use_api_key else "vertex-adc",
            "configured":    self.enabled,
            "auth_mode":     "api_key" if self._use_api_key else "vertex_adc",
            "project":       self._project,
            "location":      self._location,
            "circuit_breaker": {"state": _vertex_cb.state, "threshold": _CB_THRESHOLD, "reset_after_seconds": _CB_RESET_AFTER},
            "models":        {t.value: m for t, m in VERTEX_MODELS.items()},
        }

    def resolve_model_id(
        self, task_kind: str, tier_override: Optional[ModelTier] = None
    ) -> tuple[ModelTier, str]:
        tier = tier_override or tier_for_task(task_kind)
        return tier, VERTEX_MODELS[tier]

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
                "Gemini is not configured. Set GEMINI_API_KEY in backend/.env "
                "(get one free at https://aistudio.google.com/app/apikey)"
            )

        tier, model_id = self.resolve_model_id(task_kind, tier_override=tier_override)

        body: dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_output_tokens,
            },
        }
        if system_instruction:
            body["systemInstruction"] = {"parts": [{"text": system_instruction}]}
        if json_mode:
            body["generationConfig"]["responseMimeType"] = "application/json"

        if self._use_api_key:
            headers = {"Content-Type": "application/json"}
        else:
            try:
                token = self._get_access_token()
            except Exception as e:
                raise RuntimeError(
                    f"Failed to obtain Vertex AI credentials via ADC: {e}. "
                    "Run: gcloud auth application-default login  "
                    "OR set GEMINI_API_KEY in .env"
                ) from e
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        t0 = time.perf_counter()
        with httpx.Client(timeout=_VERTEX_TIMEOUT) as client:
            for attempt in range(_MAX_RETRIES + 1):
                if _vertex_cb.is_open():
                    raise RuntimeError("LLM circuit breaker is open (vertex).")
                try:
                    resp = client.post(self._endpoint(model_id), json=body, headers=headers)
                    # 401 → token may have expired mid-flight, refresh once and retry
                    if resp.status_code == 401 and attempt < _MAX_RETRIES:
                        token = self._get_access_token()
                        headers = {**headers, "Authorization": f"Bearer {token}"}
                        time.sleep(_RETRY_BACKOFF)
                        continue
                    # 429 / 503 → transient overload, back off and retry
                    if resp.status_code in (429, 503) and attempt < _MAX_RETRIES:
                        _vertex_cb.record_failure()
                        time.sleep(_RETRY_BACKOFF * (attempt + 1))
                        continue
                    resp.raise_for_status()
                    data = resp.json()
                    _vertex_cb.record_success()
                    break
                except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError) as e:
                    _vertex_cb.record_failure()
                    if attempt < _MAX_RETRIES:
                        time.sleep(_RETRY_BACKOFF * (attempt + 1))
                    else:
                        raise RuntimeError(
                            f"Cannot reach Vertex AI after {_MAX_RETRIES + 1} attempts: {e}"
                        ) from e
                except httpx.HTTPStatusError as e:
                    _vertex_cb.record_failure()
                    raise RuntimeError(
                        f"Vertex AI error {e.response.status_code}: {e.response.text[:400]}"
                    ) from e

        latency_ms = (time.perf_counter() - t0) * 1000.0

        try:
            candidate = data["candidates"][0]
            text = candidate["content"]["parts"][0]["text"].strip()
            finish = candidate.get("finishReason")
        except (KeyError, IndexError) as e:
            raise RuntimeError(f"Unexpected Vertex AI response shape: {data}") from e

        usage = data.get("usageMetadata") or {}
        tokens_in  = int(usage.get("promptTokenCount") or 0)
        tokens_out = int(usage.get("candidatesTokenCount") or 0)

        logger.info("vertex task=%s model=%s latency=%.0fms tokens=%d+%d",
                    task_kind, model_id, latency_ms, tokens_in, tokens_out)

        return LLMGatewayResult(
            text=text, task_kind=task_kind, tier=tier, model_id=model_id,
            latency_ms=latency_ms, tokens_in=tokens_in, tokens_out=tokens_out,
            raw_finish_reason=finish,
        )

    def generate_json(
        self, *, task_kind: str, user_prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.1, max_output_tokens: int = 4096,
        tier_override: Optional[ModelTier] = None,
    ) -> tuple[dict[str, Any], LLMGatewayResult]:
        raw = self.generate(
            task_kind=task_kind, user_prompt=user_prompt,
            system_instruction=system_instruction, json_mode=True,
            temperature=temperature, max_output_tokens=max_output_tokens,
            tier_override=tier_override,
        )
        text = _strip_fences(raw.text)
        try:
            return json.loads(text), raw
        except json.JSONDecodeError as e:
            raise ValueError(f"Vertex AI returned invalid JSON: {e}\nRaw: {raw.text[:300]}") from e


# ── vLLM Gateway (NVIDIA GPU — PagedAttention + prefix caching) ───────────────

class VLLMGateway:
    """
    NVIDIA vLLM inference server gateway (OpenAI-compatible API).

    PagedAttention splits the KV cache into fixed-size pages, eliminating
    memory fragmentation and enabling batching of variable-length sequences.
    Prefix caching (--enable-prefix-caching) reuses KV blocks for shared
    system prompts across consecutive KYC agent calls — reduces TTFT by
    30-70% on repeated agent invocations with identical prompts.

    Start: python -m vllm.entrypoints.openai.api_server \\
             --model meta-llama/Llama-3.1-8B-Instruct \\
             --enable-prefix-caching \\
             --tensor-parallel-size 1 --port 8000
    """

    def __init__(self) -> None:
        self._base_url             = settings.vllm_base_url.rstrip("/")
        self._model                = settings.vllm_model
        self._tensor_parallel_size = settings.vllm_tensor_parallel_size

    @property
    def enabled(self) -> bool:
        return bool(self._base_url and self._model)

    def meta(self) -> dict[str, Any]:
        model = self._model or "meta-llama/Llama-3.1-8B-Instruct"
        return {
            "runtime":              "vllm",
            "configured":           self.enabled,
            "base_url":             self._base_url or "http://localhost:8000",
            "model":                model if self.enabled else None,
            "tensor_parallel_size": self._tensor_parallel_size,
            "circuit_breaker":      {"state": _vllm_cb.state, "threshold": _CB_THRESHOLD, "reset_after_seconds": _CB_RESET_AFTER},
            "models": {"lite": model, "flash": model, "pro": model},
        }

    def prefix_cache_stats(self) -> dict[str, Any]:
        """Poll vLLM /metrics (Prometheus) for GPU prefix cache hit rate."""
        try:
            with httpx.Client(timeout=5.0) as client:
                resp = client.get(f"{self._base_url}/metrics")
                if resp.status_code != 200:
                    return {"available": False}
                gpu_hit_rate: float | None = None
                for line in resp.text.splitlines():
                    if line.startswith("#"):
                        continue
                    if "vllm:gpu_prefix_cache_hit_rate" in line:
                        try:
                            gpu_hit_rate = float(line.split()[-1])
                        except (ValueError, IndexError):
                            pass
                return {"available": True, "gpu_prefix_cache_hit_rate": gpu_hit_rate}
        except Exception:
            return {"available": False}

    def resolve_model_id(
        self, task_kind: str, tier_override: Optional[ModelTier] = None
    ) -> tuple[ModelTier, str]:
        tier = tier_override or tier_for_task(task_kind)
        if not self._model:
            raise RuntimeError("No vLLM model configured. Set VLLM_MODEL in .env")
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
                "vLLM is not configured. Set VLLM_BASE_URL and VLLM_MODEL in .env. "
                "Start: python -m vllm.entrypoints.openai.api_server "
                f"--model {self._model} --enable-prefix-caching"
            )

        tier, model_id = self.resolve_model_id(task_kind, tier_override=tier_override)
        messages: list[dict[str, str]] = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": user_prompt})

        payload: dict[str, Any] = {
            "model": model_id, "messages": messages, "stream": False,
            "temperature": temperature, "max_tokens": max_output_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        t0 = time.perf_counter()
        with httpx.Client(timeout=_OLLAMA_TIMEOUT) as client:
            for attempt in range(_MAX_RETRIES + 1):
                if _vllm_cb.is_open():
                    raise RuntimeError("LLM circuit breaker is open (vllm).")
                try:
                    resp = client.post(f"{self._base_url}/v1/chat/completions", json=payload)
                    if resp.status_code in (429, 503) and attempt < _MAX_RETRIES:
                        _vllm_cb.record_failure()
                        time.sleep(_RETRY_BACKOFF * (attempt + 1))
                        continue
                    resp.raise_for_status()
                    data = resp.json()
                    _vllm_cb.record_success()
                    break
                except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError) as e:
                    _vllm_cb.record_failure()
                    if attempt < _MAX_RETRIES:
                        time.sleep(_RETRY_BACKOFF * (attempt + 1))
                    else:
                        raise RuntimeError(
                            f"Cannot connect to vLLM at {self._base_url}. "
                            "Is the vLLM server running? "
                            f"Try: python -m vllm.entrypoints.openai.api_server --model {self._model} --enable-prefix-caching"
                        ) from e
                except httpx.HTTPStatusError as e:
                    _vllm_cb.record_failure()
                    raise RuntimeError(
                        f"vLLM error {e.response.status_code}: {e.response.text[:400]}"
                    ) from e

        latency_ms = (time.perf_counter() - t0) * 1000.0
        choice = data["choices"][0]
        text   = (choice["message"].get("content") or "").strip()
        finish = choice.get("finish_reason")
        usage  = data.get("usage") or {}

        # vLLM reports prefix cache hits in prompt_tokens_details.cached_tokens
        prompt_details = usage.get("prompt_tokens_details") or {}
        cached_tokens  = int(prompt_details.get("cached_tokens") or 0)
        tokens_in      = int(usage.get("prompt_tokens") or 0)
        if tokens_in > 0 and cached_tokens > 0:
            _prefix_cache_tracker.record_hit(task_kind, cached_tokens, tokens_in)

        logger.info(
            "vllm task=%s model=%s latency=%.0fms cached_tokens=%d/%d",
            task_kind, model_id, latency_ms, cached_tokens, tokens_in,
        )
        return LLMGatewayResult(
            text=text, task_kind=task_kind, tier=tier, model_id=model_id,
            latency_ms=latency_ms,
            tokens_in=tokens_in,
            tokens_out=int(usage.get("completion_tokens") or 0),
            raw_finish_reason=finish,
        )

    def generate_json(
        self, *, task_kind: str, user_prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.1, max_output_tokens: int = 4096,
        tier_override: Optional[ModelTier] = None,
    ) -> tuple[dict[str, Any], LLMGatewayResult]:
        raw = self.generate(
            task_kind=task_kind, user_prompt=user_prompt,
            system_instruction=system_instruction, json_mode=True,
            temperature=temperature, max_output_tokens=max_output_tokens,
            tier_override=tier_override,
        )
        text = _strip_fences(raw.text)
        try:
            return json.loads(text), raw
        except json.JSONDecodeError as e:
            raise ValueError(f"vLLM returned invalid JSON: {e}\nRaw: {raw.text[:300]}") from e


# ── NVIDIA NIM Gateway (cloud inference — tier-mapped Llama 3.1) ──────────────

class NIMGateway:
    """
    NVIDIA NIM (Inference Microservices) cloud API gateway.
    OpenAI-compatible endpoint at integrate.api.nvidia.com.
    Tier mapping: LITE→8B, FLASH→70B, PRO→405B Llama 3.1.
    Auth via NIM_API_KEY (https://build.nvidia.com → API Keys).
    """

    def __init__(self) -> None:
        self._base_url = settings.nim_base_url.rstrip("/")
        self._api_key  = settings.nim_api_key

    @property
    def enabled(self) -> bool:
        return bool(self._base_url and self._api_key)

    def meta(self) -> dict[str, Any]:
        return {
            "runtime":         "nim",
            "configured":      self.enabled,
            "base_url":        self._base_url,
            "circuit_breaker": {"state": _nim_cb.state, "threshold": _CB_THRESHOLD, "reset_after_seconds": _CB_RESET_AFTER},
            "models":          {t.value: m for t, m in NIM_MODELS.items()},
        }

    def resolve_model_id(
        self, task_kind: str, tier_override: Optional[ModelTier] = None
    ) -> tuple[ModelTier, str]:
        tier = tier_override or tier_for_task(task_kind)
        return tier, NIM_MODELS[tier]

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
                "NVIDIA NIM is not configured. Set NIM_API_KEY in backend/.env. "
                "Get a key at: https://build.nvidia.com"
            )

        tier, model_id = self.resolve_model_id(task_kind, tier_override=tier_override)
        messages: list[dict[str, str]] = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": user_prompt})

        payload: dict[str, Any] = {
            "model": model_id, "messages": messages, "stream": False,
            "temperature": temperature, "max_tokens": max_output_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type":  "application/json",
        }

        t0 = time.perf_counter()
        with httpx.Client(timeout=_NIM_TIMEOUT) as client:
            for attempt in range(_MAX_RETRIES + 1):
                if _nim_cb.is_open():
                    raise RuntimeError("LLM circuit breaker is open (nim).")
                try:
                    resp = client.post(
                        f"{self._base_url}/chat/completions", json=payload, headers=headers
                    )
                    if resp.status_code == 401:
                        _nim_cb.record_failure()
                        raise RuntimeError(
                            "NVIDIA NIM auth failed (401). Check NIM_API_KEY in .env."
                        )
                    if resp.status_code in (429, 503) and attempt < _MAX_RETRIES:
                        _nim_cb.record_failure()
                        time.sleep(_RETRY_BACKOFF * (attempt + 1))
                        continue
                    resp.raise_for_status()
                    data = resp.json()
                    _nim_cb.record_success()
                    break
                except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError) as e:
                    _nim_cb.record_failure()
                    if attempt < _MAX_RETRIES:
                        time.sleep(_RETRY_BACKOFF * (attempt + 1))
                    else:
                        raise RuntimeError(
                            f"Cannot reach NVIDIA NIM at {self._base_url} after {_MAX_RETRIES + 1} attempts: {e}"
                        ) from e
                except httpx.HTTPStatusError as e:
                    _nim_cb.record_failure()
                    raise RuntimeError(
                        f"NVIDIA NIM error {e.response.status_code}: {e.response.text[:400]}"
                    ) from e

        latency_ms = (time.perf_counter() - t0) * 1000.0
        choice = data["choices"][0]
        text   = (choice["message"].get("content") or "").strip()
        finish = choice.get("finish_reason")
        usage  = data.get("usage") or {}

        logger.info("nim task=%s model=%s latency=%.0fms", task_kind, model_id, latency_ms)
        return LLMGatewayResult(
            text=text, task_kind=task_kind, tier=tier, model_id=model_id,
            latency_ms=latency_ms,
            tokens_in=int(usage.get("prompt_tokens") or 0),
            tokens_out=int(usage.get("completion_tokens") or 0),
            raw_finish_reason=finish,
        )

    def generate_json(
        self, *, task_kind: str, user_prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.1, max_output_tokens: int = 4096,
        tier_override: Optional[ModelTier] = None,
    ) -> tuple[dict[str, Any], LLMGatewayResult]:
        raw = self.generate(
            task_kind=task_kind, user_prompt=user_prompt,
            system_instruction=system_instruction, json_mode=True,
            temperature=temperature, max_output_tokens=max_output_tokens,
            tier_override=tier_override,
        )
        text = _strip_fences(raw.text)
        try:
            return json.loads(text), raw
        except json.JSONDecodeError as e:
            raise ValueError(f"NVIDIA NIM returned invalid JSON: {e}\nRaw: {raw.text[:300]}") from e


# ── LLMGateway alias — backwards-compatible type used by existing code ────────

LLMGateway = OllamaGateway  # type alias kept for imports that reference LLMGateway directly


# ── Provider-aware factory ────────────────────────────────────────────────────

_ollama_instance: Optional[OllamaGateway]   = None
_vertex_instance: Optional[VertexAIGateway] = None
_vllm_instance:   Optional[VLLMGateway]     = None
_nim_instance:    Optional[NIMGateway]       = None


def get_llm_gateway() -> OllamaGateway | VertexAIGateway | VLLMGateway | NIMGateway:
    """Return the active gateway based on runtime provider config."""
    global _ollama_instance, _vertex_instance, _vllm_instance, _nim_instance
    from app.services.llm_provider import get_provider
    provider = get_provider()
    if provider == "vertex":
        if _vertex_instance is None:
            _vertex_instance = VertexAIGateway()
        return _vertex_instance
    if provider == "vllm":
        if _vllm_instance is None:
            _vllm_instance = VLLMGateway()
        return _vllm_instance
    if provider == "nim":
        if _nim_instance is None:
            _nim_instance = NIMGateway()
        return _nim_instance
    # default: ollama
    if _ollama_instance is None:
        _ollama_instance = OllamaGateway()
    return _ollama_instance


def get_ollama_http_client() -> httpx.Client:
    """Shared httpx client for direct Ollama calls (agent loop tool use)."""
    if not settings.ollama_base_url:
        raise RuntimeError("Ollama is not configured (OLLAMA_BASE_URL).")
    return httpx.Client(timeout=_OLLAMA_TIMEOUT)


# ── LLM Response Cache (Cloud SQL table) ─────────────────────────────────────
import hashlib
from datetime import datetime, timedelta

_LLM_CACHE_TTL_HOURS = int(__import__("os").getenv("LLM_CACHE_TTL_HOURS", "24"))


def _cache_key(provider: str, model: str, prompt: str) -> str:
    return hashlib.sha256(f"{provider}|{model}|{prompt}".encode()).hexdigest()


def llm_cache_get(provider: str, model: str, prompt: str) -> str | None:
    """Return cached response text or None on miss / error."""
    try:
        from app.database import engine
        from app.models import LLMCache
        from sqlmodel import Session, select
        key = _cache_key(provider, model, prompt)
        now = datetime.utcnow()
        with Session(engine) as session:
            row = session.exec(
                select(LLMCache)
                .where(LLMCache.prompt_hash == key)
                .where((LLMCache.expires_at == None) | (LLMCache.expires_at > now))  # noqa: E711
            ).first()
            if row:
                logger.debug("llm_cache HIT provider=%s model=%s", provider, model)
                return row.response_text
    except Exception as exc:
        logger.warning("llm_cache_get error: %s", exc)
    return None


def llm_cache_set(
    provider: str,
    model: str,
    agent_name: str,
    prompt: str,
    response: str,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
) -> None:
    """Write a cache entry; silently swallow errors so it never breaks a request."""
    try:
        from app.database import engine
        from app.models import LLMCache
        from sqlmodel import Session
        key = _cache_key(provider, model, prompt)
        expires = datetime.utcnow() + timedelta(hours=_LLM_CACHE_TTL_HOURS) if _LLM_CACHE_TTL_HOURS > 0 else None
        with Session(engine) as session:
            session.add(LLMCache(
                prompt_hash=key,
                provider=provider,
                model=model,
                agent_name=agent_name,
                response_text=response,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                expires_at=expires,
            ))
            session.commit()
        logger.debug("llm_cache SET provider=%s model=%s ttl=%sh", provider, model, _LLM_CACHE_TTL_HOURS)
    except Exception as exc:
        logger.warning("llm_cache_set error: %s", exc)
