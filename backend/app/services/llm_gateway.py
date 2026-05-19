"""
LLM Gateway: Gemini on Vertex AI via the unified Google Gen AI SDK (`google.genai`).

Auth: Application Default Credentials (ADC) or GOOGLE_APPLICATION_CREDENTIALS with
Vertex AI User on the target project.

Env: VERTEX_PROJECT_ID, VERTEX_LOCATION, VERTEX_MODEL_{LITE,FLASH,PRO}.
Model names must match Vertex / Model Garden for the chosen region.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Optional

from app.config import settings
from app.services.llm_tasks import ModelTier, tier_for_task

logger = logging.getLogger(__name__)

_genai_client: Any | None = None
_genai_client_key: tuple[str, str] | None = None


@dataclass
class LLMGatewayResult:
    text: str
    task_kind: str
    tier: ModelTier
    model_id: str
    latency_ms: float
    raw_finish_reason: Optional[str] = None


def _get_genai_client(project: str, location: str) -> Any:
    global _genai_client, _genai_client_key
    key = (project, location)
    if _genai_client is not None and _genai_client_key == key:
        return _genai_client

    from google import genai
    from google.genai import types

    _genai_client = genai.Client(
        vertexai=True,
        project=project,
        location=location,
        http_options=types.HttpOptions(api_version="v1"),
    )
    _genai_client_key = key
    logger.info("Google Gen AI client (Vertex) ready project=%s location=%s", project, location)
    return _genai_client


class LLMGateway:
    """Maps task_kind to tier, then calls Vertex Gemini through `google.genai`."""

    def __init__(self) -> None:
        self._project = settings.vertex_project_id
        self._location = settings.vertex_location
        self._models = {
            ModelTier.LITE: settings.vertex_model_lite,
            ModelTier.FLASH: settings.vertex_model_flash,
            ModelTier.PRO: settings.vertex_model_pro,
        }

    @property
    def enabled(self) -> bool:
        return bool(self._project and self._location)

    def meta(self) -> dict[str, Any]:
        """Safe to expose: no secrets."""
        return {
            "vertex_configured": self.enabled,
            "sdk": "google-genai",
            "genai_api_version": "v1",
            "location": self._location if self.enabled else None,
            "models": {
                "lite": bool(self._models[ModelTier.LITE]),
                "flash": bool(self._models[ModelTier.FLASH]),
                "pro": bool(self._models[ModelTier.PRO]),
            },
            "model_ids_preview": {
                k.value: (v[:48] + "...") if v and len(v) > 48 else v
                for k, v in self._models.items()
            },
        }

    def resolve_model_id(
        self, task_kind: str, tier_override: Optional[ModelTier] = None
    ) -> tuple[ModelTier, str]:
        tier = tier_override or tier_for_task(task_kind)
        model_id = self._models.get(tier) or ""
        if not model_id:
            raise RuntimeError(
                f"No Vertex model configured for tier {tier.value}. "
                f"Set VERTEX_MODEL_{tier.value.upper()} in .env"
            )
        return tier, model_id

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
                "Vertex AI is not configured. Set VERTEX_PROJECT_ID and VERTEX_LOCATION "
                "(and model env vars) in backend/.env"
            )

        from google.genai import types

        client = _get_genai_client(self._project, self._location)
        tier, model_id = self.resolve_model_id(task_kind, tier_override=tier_override)

        cfg_kwargs: dict[str, Any] = {
            "temperature": temperature,
            "max_output_tokens": max_output_tokens,
        }
        if system_instruction:
            cfg_kwargs["system_instruction"] = system_instruction
        if json_mode:
            cfg_kwargs["response_mime_type"] = "application/json"

        config = types.GenerateContentConfig(**cfg_kwargs)

        t0 = time.perf_counter()
        response = client.models.generate_content(
            model=model_id,
            contents=user_prompt,
            config=config,
        )
        latency_ms = (time.perf_counter() - t0) * 1000.0

        text = (getattr(response, "text", None) or "").strip()
        finish: Optional[str] = None
        try:
            cands = getattr(response, "candidates", None) or []
            if cands and getattr(cands[0], "finish_reason", None) is not None:
                finish = str(cands[0].finish_reason)
        except Exception:
            pass

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
        try:
            parsed: dict[str, Any] = json.loads(raw.text)
        except json.JSONDecodeError as e:
            raise ValueError(f"LLM returned invalid JSON: {e}") from e
        return parsed, raw


_gateway: Optional[LLMGateway] = None


def get_llm_gateway() -> LLMGateway:
    global _gateway
    if _gateway is None:
        _gateway = LLMGateway()
    return _gateway


def get_vertex_genai_client() -> Any:
    """Shared `google.genai` client for Vertex (same ADC as LLMGateway)."""
    if not settings.vertex_project_id or not settings.vertex_location:
        raise RuntimeError("Vertex AI is not configured (VERTEX_PROJECT_ID / VERTEX_LOCATION).")
    return _get_genai_client(settings.vertex_project_id, settings.vertex_location)
