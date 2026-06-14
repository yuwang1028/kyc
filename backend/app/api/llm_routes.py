"""HTTP surface for the LLM Gateway (debug / integration testing)."""

from typing import Annotated, Any, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.services.llm_gateway import get_llm_gateway
from app.services.llm_router import route_description
from app.services.llm_tasks import TASK_TO_TIER, ModelTier

router = APIRouter(prefix="/llm", tags=["llm-gateway"])


def require_llm_admin(
    x_llm_gateway_key: Annotated[Optional[str], Header(alias="X-LLM-Gateway-Key")] = None,
) -> bool:
    expected = settings.llm_gateway_admin_key
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="LLM gateway invoke is disabled: set LLM_GATEWAY_ADMIN_KEY in backend/.env",
        )
    if not x_llm_gateway_key or x_llm_gateway_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-LLM-Gateway-Key header")
    return True


class LLMRouteRequest(BaseModel):
    description: str = Field(
        ...,
        description="Free-form user or system description of what you want the LLM to do.",
    )
    extra_context: Optional[str] = Field(
        default=None,
        description="Optional structured hints (case id, channel, locale, etc.).",
    )


class LLMRunRequest(BaseModel):
    """Route with Lite, then run the main prompt on the tier implied by the chosen task_kind."""

    description: str = Field(..., description="Text used only by the Lite router to pick task_kind.")
    main_prompt: Optional[str] = Field(
        default=None,
        description="Prompt sent to the worker model; defaults to `description` if omitted.",
    )
    extra_context: Optional[str] = None
    system_instruction: Optional[str] = None
    json_mode: bool = False
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_output_tokens: int = Field(default=2048, ge=64, le=8192)


class LLMCompleteRequest(BaseModel):
    task_kind: str = Field(
        ...,
        description="Logical task; gateway maps to lite/flash/pro tier.",
        examples=["simple_case_summary"],
    )
    prompt: str
    system_instruction: Optional[str] = None
    json_mode: bool = False
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_output_tokens: int = Field(default=2048, ge=64, le=8192)
    tier_override: Optional[Literal["lite", "flash", "pro"]] = Field(
        default=None,
        description="Optional: bypass task_kind→tier map and call this tier's model.",
    )


@router.get("/meta")
def llm_meta() -> dict[str, Any]:
    return get_llm_gateway().meta()


@router.get("/routing")
def llm_routing() -> dict[str, Any]:
    return {
        "task_to_tier": {k: v.value for k, v in TASK_TO_TIER.items()},
        "tiers": [t.value for t in ModelTier],
        "router_task_kind": "llm_task_router",
    }


@router.get("/infra")
def llm_infra() -> dict[str, Any]:
    """
    Full AI infrastructure status — all 4 providers, circuit breakers,
    tier-to-model mapping, and vLLM KV prefix cache hit rates.
    No auth required (read-only telemetry for the dashboard).
    """
    from app.services.llm_gateway import (
        OllamaGateway, VertexAIGateway, VLLMGateway, NIMGateway,
        VERTEX_MODELS, NIM_MODELS,
        get_circuit_breaker_state, get_prefix_cache_stats,
    )
    from app.services.llm_provider import get_provider, is_vllm_configured

    ollama = OllamaGateway()
    vertex = VertexAIGateway()
    vllm   = VLLMGateway()
    nim    = NIMGateway()
    cb     = get_circuit_breaker_state()

    vllm_model = vllm._model or "meta-llama/Llama-3.1-8B-Instruct"

    return {
        "active_provider": get_provider(),
        "providers": {
            "ollama": {
                "configured":    ollama.enabled,
                "model":         ollama._model,
                "circuit_breaker": cb["ollama"]["state"],
                "runtime":       "local · CPU/GPU",
            },
            "vertex": {
                "configured":    vertex.enabled,
                "project":       vertex._project,
                "location":      vertex._location,
                "circuit_breaker": cb["vertex"]["state"],
                "runtime":       "Google Cloud · Gemini",
            },
            "vllm": {
                "configured":          is_vllm_configured(),
                "base_url":            vllm._base_url or "http://localhost:8000",
                "model":               vllm_model,
                "tensor_parallel_size": vllm._tensor_parallel_size,
                "circuit_breaker":     cb["vllm"]["state"],
                "runtime":             "local GPU · PagedAttention",
                "server_metrics":      vllm.prefix_cache_stats() if is_vllm_configured() else {"available": False},
            },
            "nim": {
                "configured":    nim.enabled,
                "base_url":      nim._base_url,
                "circuit_breaker": cb["nim"]["state"],
                "runtime":       "NVIDIA Cloud · Nemotron",
            },
        },
        "tier_routing": {
            "lite": {
                "description": "Simple tasks — fast, low cost",
                "ollama":  ollama._model or "—",
                "vertex":  VERTEX_MODELS[ModelTier.LITE],
                "vllm":    vllm_model,
                "nim":     NIM_MODELS[ModelTier.LITE],
            },
            "flash": {
                "description": "Standard KYC analysis",
                "ollama":  ollama._model or "—",
                "vertex":  VERTEX_MODELS[ModelTier.FLASH],
                "vllm":    vllm_model,
                "nim":     NIM_MODELS[ModelTier.FLASH],
            },
            "pro": {
                "description": "Complex risk narratives, EDD",
                "ollama":  ollama._model or "—",
                "vertex":  VERTEX_MODELS[ModelTier.PRO],
                "vllm":    vllm_model,
                "nim":     NIM_MODELS[ModelTier.PRO],
            },
        },
        "prefix_cache": {
            "tracker": get_prefix_cache_stats(),
            "note": (
                "Hit rate per KYC task — populated when vLLM runs with --enable-prefix-caching. "
                "Shared system prompts across agent invocations are reused from GPU KV cache."
            ),
        },
    }


@router.post("/route")
def llm_route(
    body: LLMRouteRequest,
    _: bool = Depends(require_llm_admin),
) -> dict[str, Any]:
    """
    Lite-only router: returns `task_kind` + `resolved_tier` for use with `/llm/complete` or `LLMGateway.generate`.
    """
    return route_description(body.description, extra_context=body.extra_context)


@router.post("/run")
def llm_run(
    body: LLMRunRequest,
    _: bool = Depends(require_llm_admin),
) -> dict[str, Any]:
    """Route (Lite) then invoke the worker model once with the resolved task_kind."""
    gw = get_llm_gateway()
    if not gw.enabled:
        raise HTTPException(
            status_code=503,
            detail="Vertex is not configured (VERTEX_PROJECT_ID / VERTEX_LOCATION).",
        )
    routed = route_description(body.description, extra_context=body.extra_context)
    task_kind = routed["task_kind"]
    worker_prompt = (body.main_prompt or body.description).strip()
    if not worker_prompt:
        raise HTTPException(status_code=400, detail="main_prompt and description cannot both be empty")

    try:
        result = gw.generate(
            task_kind=task_kind,
            user_prompt=worker_prompt,
            system_instruction=body.system_instruction,
            json_mode=body.json_mode,
            temperature=body.temperature,
            max_output_tokens=body.max_output_tokens,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vertex/Gemini error: {e}") from e

    return {
        "route": routed,
        "main": {
            "text": result.text,
            "task_kind": result.task_kind,
            "tier": result.tier.value,
            "model_id": result.model_id,
            "latency_ms": round(result.latency_ms, 2),
            "finish_reason": result.raw_finish_reason,
        },
    }


@router.post("/complete")
def llm_complete(
    body: LLMCompleteRequest,
    _: bool = Depends(require_llm_admin),
) -> dict[str, Any]:
    gw = get_llm_gateway()
    if not gw.enabled:
        raise HTTPException(
            status_code=503,
            detail="Vertex is not configured (VERTEX_PROJECT_ID / VERTEX_LOCATION).",
        )
    tier_ov = ModelTier(body.tier_override) if body.tier_override else None
    try:
        result = gw.generate(
            task_kind=body.task_kind,
            user_prompt=body.prompt,
            system_instruction=body.system_instruction,
            json_mode=body.json_mode,
            temperature=body.temperature,
            max_output_tokens=body.max_output_tokens,
            tier_override=tier_ov,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vertex/Gemini error: {e}") from e

    return {
        "text": result.text,
        "task_kind": result.task_kind,
        "tier": result.tier.value,
        "model_id": result.model_id,
        "latency_ms": round(result.latency_ms, 2),
        "finish_reason": result.raw_finish_reason,
    }


@router.post("/complete-json")
def llm_complete_json(
    body: LLMCompleteRequest,
    _: bool = Depends(require_llm_admin),
) -> dict[str, Any]:
    """Forces JSON MIME type on the model; returns parsed object in `json`."""
    gw = get_llm_gateway()
    if not gw.enabled:
        raise HTTPException(
            status_code=503,
            detail="Vertex is not configured (VERTEX_PROJECT_ID / VERTEX_LOCATION).",
        )
    tier_ov = ModelTier(body.tier_override) if body.tier_override else None
    try:
        parsed, raw = gw.generate_json(
            task_kind=body.task_kind,
            user_prompt=body.prompt,
            system_instruction=body.system_instruction,
            temperature=body.temperature,
            max_output_tokens=body.max_output_tokens,
            tier_override=tier_ov,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vertex/Gemini error: {e}") from e

    return {
        "json": parsed,
        "task_kind": raw.task_kind,
        "tier": raw.tier.value,
        "model_id": raw.model_id,
        "latency_ms": round(raw.latency_ms, 2),
        "finish_reason": raw.raw_finish_reason,
    }
