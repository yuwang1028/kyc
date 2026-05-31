"""
ReAct-style agent loop: Qwen 2.5 7B (via Ollama) proposes tool calls; we execute KYC tools
and feed results back until the model stops calling tools or max_turns is hit.

Uses Ollama's OpenAI-compatible endpoint (/v1/chat/completions) with the `tools` parameter.
Manual tool execution keeps every call auditable. Same structural pattern as the Claude/Gemini
agent loop: append model turn → execute tools → append tool results → repeat.

Planning: a per-run TodoManager backs the `todo` tool. After TODO_NAG_AFTER_ROUNDS consecutive
tool rounds without a `todo` call we inject a reminder.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

import httpx
from sqlmodel import Session, select

from app.config import settings
from app.models import AgentWorkingMemory, Case
from app.services.agent_todo import TodoManager
from app.services.agent_tools import AgentToolContext, execute_kyc_tool, kyc_tools_as_openai
from app.services.llm_gateway import get_llm_gateway

logger = logging.getLogger(__name__)

TODO_NAG_AFTER_ROUNDS = 3
_OLLAMA_TIMEOUT = 180.0

_TODO_NAG_TEXT = (
    "<reminder>Update your todos with the todo tool to track multi-step progress.</reminder>"
)

_SYSTEM = (
    "You are a KYC analyst assistant. For multi-step goals, use the todo tool first to plan, "
    "then set one item in_progress before working on it and completed when done. "
    "Use the case tools to gather facts; do not invent screening or document details. "
    "The active case is fixed; case tools do not accept a case_id parameter."
)


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
        raise RuntimeError(
            "Ollama is not configured. Set OLLAMA_BASE_URL / OLLAMA_MODEL in .env "
            "and run: ollama serve && ollama pull qwen2.5:7b"
        )
    _, model_id = gw.resolve_model_id("kyc_agent_loop")

    base_url = settings.ollama_base_url.rstrip("/")
    tools = kyc_tools_as_openai()
    todo_manager = TodoManager()
    tool_ctx = AgentToolContext(
        session=session,
        case_id=case_id,
        case=case,
        todo_manager=todo_manager,
    )

    # Working memory: one row per session, upserted on every todo call
    session_id = uuid4()
    _working_memory = AgentWorkingMemory(
        id=session_id,
        case_id=case_id,
        session_id=session_id,
        todos=[],
        turn=0,
    )
    session.add(_working_memory)
    session.commit()

    def _persist_todos(turn_num: int) -> None:
        _working_memory.todos = todo_manager.snapshot()
        _working_memory.turn = turn_num
        _working_memory.updated_at = datetime.utcnow()
        session.add(_working_memory)
        session.commit()

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": _SYSTEM},
        {
            "role": "user",
            "content": (
                f"User goal:\n{goal.strip()}\n\nActive case_id (reference only): {case_id}"
            ),
        },
    ]

    steps: list[AgentLoopStep] = []
    final_text = ""
    stopped_reason = "max_turns"
    model_rounds = 0
    rounds_since_todo = 0
    todo_reminders_injected = 0

    with httpx.Client(timeout=_OLLAMA_TIMEOUT) as client:
        for turn in range(max_turns):
            model_rounds += 1

            resp = client.post(
                f"{base_url}/v1/chat/completions",
                json={
                    "model": model_id,
                    "messages": messages,
                    "tools": tools,
                    "tool_choice": "auto",
                    "stream": False,
                    "temperature": temperature,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            choice = data["choices"][0]
            assistant_msg = choice["message"]
            finish_reason = choice.get("finish_reason", "")

            # Append the full assistant message (may contain tool_calls or content)
            messages.append(assistant_msg)

            tool_calls: list[dict[str, Any]] = assistant_msg.get("tool_calls") or []

            if not tool_calls:
                final_text = (assistant_msg.get("content") or "").strip()
                stopped_reason = "model_done"
                steps.append(
                    AgentLoopStep(turn=turn, role="model", detail=final_text[:500])
                )
                break

            # Execute all requested tool calls
            tool_result_msgs: list[dict[str, Any]] = []
            used_todo = False

            for tc in tool_calls:
                name = tc["function"]["name"]
                raw_args = tc["function"].get("arguments") or "{}"
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except json.JSONDecodeError:
                    args = {}

                logger.info(
                    "agent_loop tool call case=%s tool=%s args=%s", case_id, name, args
                )

                try:
                    result = execute_kyc_tool(tool_ctx, name, args)
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

                tool_result_msgs.append({
                    "role": "tool",
                    "tool_call_id": tc.get("id", f"call_{turn}_{name}"),
                    "content": json.dumps(result, default=str),
                })

                if name == "todo":
                    used_todo = True
                    _persist_todos(turn)

            messages.extend(tool_result_msgs)

            rounds_since_todo = 0 if used_todo else rounds_since_todo + 1
            if rounds_since_todo >= TODO_NAG_AFTER_ROUNDS:
                todo_reminders_injected += 1
                rounds_since_todo = 0
                messages.append({"role": "user", "content": _TODO_NAG_TEXT})
                steps.append(
                    AgentLoopStep(turn=turn, role="reminder", detail=_TODO_NAG_TEXT[:200])
                )

    return AgentLoopResult(
        final_text=final_text,
        steps=steps,
        model_rounds=model_rounds,
        stopped_reason=stopped_reason,
        todos_final=todo_manager.snapshot(),
        todo_reminders_injected=todo_reminders_injected,
    )
