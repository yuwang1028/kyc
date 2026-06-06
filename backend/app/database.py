import logging

from sqlalchemy import text
from sqlalchemy.engine.url import make_url
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

logger = logging.getLogger(__name__)


def _build_engine():
    url = make_url(settings.database_url)

    is_sqlite = url.get_backend_name() == "sqlite"
    is_postgres = url.get_backend_name() in {"postgresql", "postgres"}

    connect_args: dict = {}
    if is_sqlite:
        # Allow background threads (workflow runner) to share connections.
        # WAL mode is set via event hook below.
        connect_args["check_same_thread"] = False

    if is_postgres and "supabase" in (url.host or "") and "sslmode" not in url.query:
        connect_args["sslmode"] = "require"

    engine = create_engine(
        settings.database_url,
        echo=False,
        pool_pre_ping=not is_sqlite,
        connect_args=connect_args,
    )

    if is_sqlite:
        # WAL mode: concurrent reads + single writer, eliminates "database is locked"
        # when background tasks write while HTTP handlers read.
        from sqlalchemy import event

        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(conn, _rec):
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA busy_timeout=5000")  # 5s retry on lock instead of instant fail

    return engine


engine = _build_engine()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    backend = make_url(settings.database_url).get_backend_name()
    logger.info("Database ready backend=%s", backend)


def check_db_connection() -> tuple[bool, str]:
    try:
        with Session(engine) as session:
            session.exec(text("SELECT 1"))
        return True, "connected"
    except Exception as e:
        return False, str(e).split("\n")[0][:240]


def get_session():
    with Session(engine) as session:
        yield session
