# Valley KYC Concierge (frontend demo)

A Vite + React + Tailwind v4 frontend for the
[yuwang1028/kyc](https://github.com/yuwang1028/kyc) FastAPI backend,
re-skinned in the Valley design system from the sibling `valley-hr-demo`.

## What's in it

- **Dashboard** — KPIs (open / decision-pending / high-risk / approved), hero, recent cases.
- **Cases** — searchable + status-filterable list, opens detail view.
- **Case detail** — header card with risk score + status pills, tabs for:
  - Overview (organization fields)
  - Documents (list + register)
  - Screening (run + view sanctions / PEP / adverse-media hits)
  - Risk (evaluate rules engine + see triggered rules)
  - AI agents (run intake / summary, history of `agent_runs`)
  - Decision (approve / reject / EDD / request info)
  - Audit (event trail)
- **New intake** — organization form that calls `POST /api/v1/cases`.
- **Tasks** — global task queue from `/api/v1/tasks`.

## Run

```bash
cd kyc-frontend
npm install
npm run dev
```

Frontend at <http://localhost:5174>. The Vite dev server proxies `/api/*`
to `http://localhost:8000` — start the backend first per
`yuwang1028/kyc` README.

To point at a different backend:

```bash
VITE_API_BASE=https://your-api.example/api/v1 npm run dev
```

## Design system

Tokens (DM Sans, navy `#002c4e`, yellow `#f3d01c`, fog `#f2f3f4`, mint
hero surface) lifted from `../valley-hr-demo/src/index.css`. Component
shapes (pill CTAs, flat cards, uppercase eyebrow + bold heading, chip
pills, KPI tile with trend) ported from `../valley-hr-demo/src/components`.
