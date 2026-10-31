# AXIOM

AXIOM is an Intelligent Campus Scheduling and Venue Management Platform built for the Crunch Week hackathon. This repository preserves the official starter pack and provides a runnable foundation for the team. The application reads the supplied dataset as input; it does not embed dataset records in code.

The starter pack guide is preserved at [docs/STARTER_PACK_README.md](docs/STARTER_PACK_README.md).

## Repository contents

- `backend/` — FastAPI, SQLAlchemy, Alembic, Pydantic settings, and service boundaries.
- `frontend/` — React, TypeScript, and Vite starter workspace.
- `data/` — official CIT dataset and CSV copies from the starter pack.
- `examples/` — official schedule, disruption, and sample request examples.
- `validator.py` — unmodified official validator.
- `docs/` — team ownership and API contract placeholders.

## Requirements

- Python 3.10 or newer (3.8+ is sufficient for the official validator).
- Node.js 20.19+ or 22.12+ and npm.
- PostgreSQL 14+ for future database-backed features. The API health check can run without a live database connection.

## Backend setup

From the repository root, create and activate a virtual environment, then install dependencies:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item ..\.env.example .env
uvicorn app.main:app --reload
```

On macOS/Linux, activate with `source .venv/bin/activate`. Configure `DATABASE_URL` in `backend/.env` for your local PostgreSQL instance. The connection is initialized but no domain tables are defined yet. API docs are at `http://localhost:8000/docs`; health check: `http://localhost:8000/api/v1/health`.

## Frontend setup

In another terminal from the repository root:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Vite prints the local app URL (normally `http://localhost:5173`). `VITE_API_URL` in `frontend/.env.local` controls the backend base URL. The dashboard uses the documented health endpoint as a liveness check; operational data remains unavailable until its API contracts are implemented. See [frontend setup and module status](frontend/README.md) and the [demo readiness guide](docs/FRONTEND_DEMO_READINESS.md).

## Database migrations

Alembic is configured in `backend/alembic.ini`. Once models and an initial migration are added, run from `backend/`:

```powershell
alembic revision --autogenerate -m "describe schema"
alembic upgrade head
```

## Team workflow and exports

See [Team structure](docs/TEAM_STRUCTURE.md) and [API contracts](docs/API_CONTRACTS.md). Keep generated judge-format outputs under `exports/`. Use the official validator exactly as described in the starter README:

```powershell
python validator.py --data data/cit_public.json --schedule exports/schedule.json
```

The booking engine, timetable optimizer, AI assistant, domain schema, and production dashboard are intentionally not implemented in this foundation.



