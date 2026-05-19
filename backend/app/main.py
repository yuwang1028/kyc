from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import settings
from app.database import check_db_connection, init_db
from app.services.agent_llm import get_last_llm_failure, workflow_llm_agents_enabled

app = FastAPI(title=settings.app_name, version=settings.app_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix=settings.api_prefix)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/healthz")
def healthz():
    ok, detail = check_db_connection()
    using_sqlite = settings.database_url.startswith("sqlite")
    payload = {
        "status": "ok" if ok else "degraded",
        "database": detail,
        "database_url_backend": "sqlite" if using_sqlite else "postgresql",
        "storage_mode": "local_sqlite" if using_sqlite else "postgres",
    }
    if ok and using_sqlite:
        payload["db_file"] = "kyc.db"
    elif not ok:
        payload["hint"] = (
            "Database unreachable. For local dev set USE_LOCAL_SQLITE=true in backend/.env"
        )
    payload["workflow_llm_agents"] = workflow_llm_agents_enabled()
    failure = get_last_llm_failure()
    if failure:
        payload["workflow_llm_last_error"] = failure
    return payload


@app.get("/")
def root():
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "api_prefix": settings.api_prefix,
    }
