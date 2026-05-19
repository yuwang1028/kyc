# Agentic KYC Platform — MVP

Frontend ↔ FastAPI ↔ **Supabase Postgres** monorepo, built from `PRD.md`.

## Architecture

```
Next.js (frontend, :3000)
        │  fetch /api/v1/...
        ▼
FastAPI (backend, :8000)
        │  SQLAlchemy + psycopg2 (sslmode=require)
        ▼
Supabase Postgres (db.<project>.supabase.co:5432/postgres)
```

The Supabase database already has all PRD tables created (organizations,
cases, documents, screening_results, risk_assessments, agent_runs, decisions,
audit_events, …), so the backend just connects and writes/reads — no
migrations are needed for MVP.

## Backend

### 1. Configure env

```bash
cd backend
cp .env.example .env
```

Edit `.env` and set your real password (URL-encode special characters):

```
DATABASE_URL=postgresql://postgres:YOUR-PASSWORD@db.vnwslkvmfvfwbzmzvdam.supabase.co:5432/postgres
CORS_ORIGINS=http://localhost:3000
```

> If your network is **IPv4-only**, the direct `db.<project>.supabase.co:5432`
> host is IPv6-only — go to Supabase → Project Settings → Database → "Session
> Pooler" and use that connection string instead (port `5432`,
> host `aws-0-...pooler.supabase.com`).

### 2. Install & run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

- Health: <http://localhost:8000/healthz>
- Docs: <http://localhost:8000/docs>

### Endpoints

```
GET    /api/v1/cases
POST   /api/v1/cases
GET    /api/v1/cases/{id}
PATCH  /api/v1/cases/{id}
POST   /api/v1/cases/{id}/submit
POST   /api/v1/cases/{id}/documents
GET    /api/v1/cases/{id}/documents
POST   /api/v1/cases/{id}/screening/run
GET    /api/v1/cases/{id}/screening/results
POST   /api/v1/cases/{id}/risk/evaluate
GET    /api/v1/cases/{id}/risk
POST   /api/v1/cases/{id}/agents/intake
POST   /api/v1/cases/{id}/agents/summary
GET    /api/v1/cases/{id}/agent-runs
POST   /api/v1/cases/{id}/decision
GET    /api/v1/cases/{id}/audit
GET    /api/v1/tasks
PATCH  /api/v1/tasks/{id}
POST   /api/v1/refresh/run
```

## Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

- Dashboard: <http://localhost:3000>
- Intake portal: <http://localhost:3000/intake>
- Case detail (after creation): <http://localhost:3000/cases/{id}>

## End-to-End Smoke Test

```bash
# 1. Create a case
curl -X POST http://localhost:8000/api/v1/cases \
  -H 'Content-Type: application/json' \
  -d '{"organization":{"legal_name":"Acme LLC","registration_number":"REG-1","incorporation_country":"US"},"jurisdiction":"US"}'

# 2. Add a document, screening hit
# 3. Evaluate risk, run agents, record a decision (see /docs)
```
