"""
Async workflow runner: wraps run_onboarding_workflow in a FastAPI BackgroundTask.

Flow:
  POST /workflow/run
    → create WorkflowRun(status=pending) → commit → return {run_id}
    → background: execute_workflow_task updates status as it runs

Idempotency:
  If a run is already pending/running for this case, return the existing run_id.

Slow query detection:
  Logs a warning and sets slow_warning=True if elapsed > SLOW_THRESHOLD_SECONDS.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from uuid import UUID

from sqlmodel import Session, select

from app.database import engine
from app.models import Case, WorkflowRun
from app.services.workflow import run_onboarding_workflow

logger = logging.getLogger(__name__)

SLOW_THRESHOLD_SECONDS = 120.0
_ACTIVE_STATUSES = ("pending", "running")


def get_or_create_workflow_run(
    session: Session,
    case_id: UUID,
    *,
    stop_on_incomplete_intake: bool = True,
) -> tuple[WorkflowRun, bool]:
    """Return (run, is_new). If an active run exists, return it (idempotency)."""
    existing = session.exec(
        select(WorkflowRun)
        .where(WorkflowRun.case_id == case_id)
        .where(WorkflowRun.status.in_(list(_ACTIVE_STATUSES)))
        .order_by(WorkflowRun.created_at.desc())
    ).first()

    if existing:
        return existing, False

    run = WorkflowRun(
        case_id=case_id,
        status="pending",
        stop_on_incomplete_intake=stop_on_incomplete_intake,
    )
    session.add(run)
    session.commit()
    session.refresh(run)
    return run, True


def execute_workflow_task(run_id: UUID) -> None:
    """Background task: runs the full workflow and updates WorkflowRun."""
    with Session(engine) as session:
        run = session.get(WorkflowRun, run_id)
        if not run:
            logger.error("execute_workflow_task: WorkflowRun %s not found", run_id)
            return

        run.status = "running"
        run.started_at = datetime.utcnow()
        session.add(run)
        session.commit()

        t0 = time.perf_counter()
        try:
            result = run_onboarding_workflow(
                session,
                run.case_id,
                stop_on_incomplete_intake=run.stop_on_incomplete_intake,
            )
            session.commit()

            elapsed = time.perf_counter() - t0
            run.status = "completed"
            run.result_payload = result
            run.finished_at = datetime.utcnow()
            run.elapsed_seconds = round(elapsed, 2)
            run.slow_warning = elapsed > SLOW_THRESHOLD_SECONDS
            if run.slow_warning:
                logger.warning(
                    "Slow workflow: case=%s run=%s elapsed=%.1fs (threshold=%.0fs)",
                    run.case_id, run_id, elapsed, SLOW_THRESHOLD_SECONDS,
                )

        except ValueError as e:
            elapsed = time.perf_counter() - t0
            run.status = "failed"
            run.error = str(e)
            run.finished_at = datetime.utcnow()
            run.elapsed_seconds = round(elapsed, 2)
            logger.error("Workflow failed (ValueError): case=%s run=%s error=%s", run.case_id, run_id, e)

        except Exception as e:
            elapsed = time.perf_counter() - t0
            run.status = "failed"
            run.error = str(e)[:500]
            run.finished_at = datetime.utcnow()
            run.elapsed_seconds = round(elapsed, 2)
            logger.exception("Workflow failed (unexpected): case=%s run=%s", run.case_id, run_id)

        finally:
            session.add(run)
            session.commit()
