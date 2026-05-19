"""
ReAct-style agent loop: Gemini proposes function calls; we execute KYC tools and feed results back.

Same structural pattern as a generic coding agent (e.g. Anthropic `stop_reason == "tool_use"`):
call the LLM with tools, append the model turn, and if it requested tools, execute them and append
tool results to the conversation until the model returns text without further tool calls (or
`max_turns` is hit). Manual execution (`automatic_function_calling` off) keeps every tool call
auditable.

Tool execution is delegated to `execute_kyc_tool` → `KYC_TOOL_HANDLERS[name]` (dispatch map in
`agent_tools`).

Planning (s03_todo_write): a per-run `TodoManager` backs the `todo` tool. If the model issues tool
calls for three consecutive rounds without calling `todo`, we inject a short user reminder so it
updates progress (same idea as `rounds_since_todo >= 3` in the harness).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from google.genai import types
from sqlmodel import Session

from app.models import Case
from app.services.agent_todo import TodoManager
from app.services.agent_tools import AgentToolContext, execute_kyc_tool, kyc_case_toolset
from app.services.llm_gateway import get_llm_gateway, get_vertex_genai_client

logger = logging.getLogger(__name__)

# Match s03 harness: nudge after this many consecutive tool rounds without `todo`.
TODO_NAG_AFTER_ROUNDS = 3

_TODO_NAG_TEXT = (
    "<reminder>Update your todos with the todo tool to track multi-step progress.</reminder>"
)


def _extract_function_calls(response: Any) -> list[Any]:
    """Prefer SDK `response.function_calls`; fall back to parsing candidate parts."""
    raw = getattr(response, "function_calls", None)
    if raw:
        return list(raw)
    cands = getattr(response, "candidates", None) or []
    if not cands:
        return []
    content = getattr(cands[0], "content", None)
    if not content:
        return []
    out: list[Any] = []
    for part in getattr(content, "parts", None) or []:
        fc = getattr(part, "function_call", None)
        if fc is not None:
            out.append(fc)
    return out


@dataclass
class AgentLoopStep:
    turn: int
    role: str
    detail: str
    tool_name: str | None = None
    tool_result: dict[str, Any] | None = None


@dataclass
class AgentLoopResult:
    final_text: str
    steps: list[AgentLoopStep] = field(default_factory=list)
    model_rounds: int = 0
    stopped_reason: str = ""
    # Snapshot when the run ends (empty if the model never called `todo`).
    todos_final: list[dict[str, Any]] = field(default_factory=list)
    todo_reminders_injected: int = 0


def run_kyc_case_agent_loop(
    session: Session,
    case_id: UUID,
    goal: str,
    *,
    max_turns: int = 10,
    temperature: float = 0.2,
) -> AgentLoopResult:
    case = session.get(Case, case_id)
    if not case:
        raise ValueError("case_not_found")

    gw = get_llm_gateway()
    if not gw.enabled:
        raise RuntimeError("Vertex AI is not configured.")
    _, model_id = gw.resolve_model_id("kyc_agent_loop")

    client = get_vertex_genai_client()
    tool = kyc_case_toolset()
    todo_manager = TodoManager()
    tool_ctx = AgentToolContext(
        session=session,
        case_id=case_id,
        case=case,
        todo_manager=todo_manager,
    )

    system = (
        "You are a KYC analyst assistant. For multi-step goals, use the todo tool first to plan, "
        "then set one item in_progress before working on it and completed when done. "
        "Use the case tools to gather facts; do not invent screening or document details. "
        "The active case is fixed; case tools do not accept a case_id parameter."
    )

    user_text = f"User goal:\n{goal.strip()}\n\nActive case_id (reference only): {case_id}"
    contents: list[Any] = [
        types.Content(role="user", parts=[types.Part.from_text(text=user_text)]),
    ]

    steps: list[AgentLoopStep] = []
    final_text = ""
    stopped_reason = "max_turns"
    model_rounds = 0
    rounds_since_todo = 0
    todo_reminders_injected = 0

    config = types.GenerateContentConfig(
        temperature=temperature,
        max_output_tokens=4096,
        system_instruction=system,
        tools=[tool],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        tool_config=types.ToolConfig(
            function_calling_config=types.FunctionCallingConfig(mode="AUTO"),
        ),
    )

    for turn in range(max_turns):
        model_rounds += 1
        response = client.models.generate_content(
            model=model_id,
            contents=contents,
            config=config,
        )

        cand = response.candidates[0] if getattr(response, "candidates", None) else None
        if not cand or not getattr(cand, "content", None):
            stopped_reason = "empty_candidate"
            break

        contents.append(cand.content)

        fcalls = _extract_function_calls(response)
        if not fcalls:
            final_text = (getattr(response, "text", None) or "").strip()
            stopped_reason = "model_done"
            steps.append(AgentLoopStep(turn=turn, role="model", detail=final_text[:500]))
            break

        tool_parts: list[types.Part] = []
        for fc in fcalls:
            name = fc.name or ""
            raw_args = dict(fc.args or {})
            logger.info("agent_loop tool call case=%s tool=%s args=%s", case_id, name, raw_args)
            try:
                result = execute_kyc_tool(tool_ctx, name, raw_args)
            except Exception as e:
                logger.exception("agent_loop tool error case=%s tool=%s", case_id, name)
                result = {"error": "tool_execution_failed", "message": str(e)}
            steps.append(
                AgentLoopStep(
                    turn=turn,
                    role="tool",
                    detail=name,
                    tool_name=name,
                    tool_result=result,
                )
            )
            tool_parts.append(types.Part.from_function_response(name=name, response=result))

        contents.append(types.Content(role="tool", parts=tool_parts))

        used_todo = any((fc.name or "") == "todo" for fc in fcalls)
        rounds_since_todo = 0 if used_todo else rounds_since_todo + 1
        if rounds_since_todo >= TODO_NAG_AFTER_ROUNDS:
            todo_reminders_injected += 1
            steps.append(
                AgentLoopStep(turn=turn, role="reminder", detail=_TODO_NAG_TEXT[:200]),
            )
            contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=_TODO_NAG_TEXT)],
                )
            )

    return AgentLoopResult(
        final_text=final_text,
        steps=steps,
        model_rounds=model_rounds,
        stopped_reason=stopped_reason,
        todos_final=todo_manager.snapshot(),
        todo_reminders_injected=todo_reminders_injected,
    )
