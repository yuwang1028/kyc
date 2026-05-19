"""
Per-run todo list the model updates via the `todo` tool (s03_todo_write pattern).

State lives only in memory for one agent loop; returned in `AgentLoopResult` for visibility.
"""

from __future__ import annotations

from typing import Any


class TodoManager:
    """Structured task list written by the LLM; validated server-side."""

    def __init__(self) -> None:
        self.items: list[dict[str, Any]] = []

    def update(self, items: list[Any]) -> str:
        if len(items) > 20:
            raise ValueError("Max 20 todos allowed")
        validated: list[dict[str, Any]] = []
        in_progress_count = 0
        for i, raw in enumerate(items):
            if not isinstance(raw, dict):
                raise ValueError(f"Item {i}: expected object")
            text = str(raw.get("text", "")).strip()
            status = str(raw.get("status", "pending")).lower()
            item_id = str(raw.get("id", str(i + 1)))
            if not text:
                raise ValueError(f"Item {item_id}: text required")
            if status not in ("pending", "in_progress", "completed"):
                raise ValueError(f"Item {item_id}: invalid status '{status}'")
            if status == "in_progress":
                in_progress_count += 1
            validated.append({"id": item_id, "text": text, "status": status})
        if in_progress_count > 1:
            raise ValueError("Only one task can be in_progress at a time")
        self.items = validated
        return self.render()

    def render(self) -> str:
        if not self.items:
            return "No todos."
        lines: list[str] = []
        for item in self.items:
            marker = {"pending": "[ ]", "in_progress": "[>]", "completed": "[x]"}[item["status"]]
            lines.append(f"{marker} #{item['id']}: {item['text']}")
        done = sum(1 for t in self.items if t["status"] == "completed")
        lines.append(f"\n({done}/{len(self.items)} completed)")
        return "\n".join(lines)

    def snapshot(self) -> list[dict[str, Any]]:
        return [dict(x) for x in self.items]
