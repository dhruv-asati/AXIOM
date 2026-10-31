# AXIOM

AXIOM is an Intelligent Campus Scheduling and Venue Management Platform built for the Crunch Week hackathon. This repository preserves the official starter pack and provides a runnable foundation for the team. The application reads the supplied dataset as input; it does not embed dataset records in code.

The starter pack guide is preserved at [docs/STARTER_PACK_README.md](docs/STARTER_PACK_README.md).

## Repository contents

- `backend/` — FastAPI, SQLAlchemy, Alembic, Pydantic settings, and service boundaries.
- `frontend/` — React, TypeScript, and Vite starter workspace.
- `data/` — official CIT dataset and CSV copies from the starter pack.
- `examples/` — official schedule, disruption, and sample request examples.
- `validator.py` — unmodified official validator.
- `docs/` — team ownership, API contracts, and database schema notes.

## Requirements

- Python 3.10 or newer (3.8+ is sufficient for the official validator).
- Node.js 20.19+ or 22.12+ and npm.
- PostgreSQL 14+; configure `DATABASE_URL` for the API and dataset importer.

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

On macOS/Linux, activate with `source .venv/bin/activate`. Configure `DATABASE_URL` in `backend/.env`. API docs are at `http://localhost:8000/docs`; health check: `http://localhost:8000/api/v1/health`.

### Import a dataset

The dataset import runs in one database transaction and can be repeated safely. The default source is `data/cit_public.json`; use the API request body to select another JSON file or a directory containing exactly one dataset JSON. File paths must stay under the repository `data/` directory.

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/v1/datasets/import `
  -ContentType 'application/json' -Body '{"path":"cit_public.json"}'
Invoke-RestMethod http://localhost:8000/api/v1/datasets
Invoke-RestMethod http://localhost:8000/api/v1/datasets/<dataset-uuid>
```

`GET /api/v1/datasets` lists imported datasets; `GET /api/v1/datasets/{dataset_id}` returns dataset metadata. The import response includes per-table input counts. CSV collections can supplement dataset JSON when a collection is absent.

### Run the deterministic booking engine

Booking decisions are evaluated against a `Schedule` belonging to the same dataset. The schedule supplies regular timetable room and student-group occupancy; the engine does not create or solve a timetable. After a schedule exists, run decisions with:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/v1/datasets/<dataset-uuid>/schedules/<schedule-uuid>/bookings/run
Invoke-RestMethod http://localhost:8000/api/v1/datasets/<dataset-uuid>/schedules/<schedule-uuid>/booking-outcomes
```

The run endpoint applies dataset priority order and role caps, checks cancellations, room constraints, unavailability, timetable/group conflicts and earlier approvals, then transactionally upserts one outcome per request. The outcomes endpoint includes requests without a decision as `pending`. See [docs/BOOKING_ENGINE.md](docs/BOOKING_ENGINE.md) for the rules.

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

Alembic is configured in `backend/alembic.ini`. Review migrations before applying; run from `backend/`:

```powershell
alembic revision --autogenerate -m "describe schema"
alembic upgrade head
```

## Generate and validate a timetable

The timetable solver uses OR-Tools CP-SAT and reads all inputs from the selected imported dataset. It writes a complete schedule and exam room allocations to PostgreSQL. The generated JSON export includes weekly sessions and exams in the official validator format:

```powershell
$datasetId = '<dataset-uuid>'
$result = Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/v1/datasets/$datasetId/schedules/generate" `
  -ContentType 'application/json' -Body '{"team":"AXIOM","time_limit_seconds":120}'
$scheduleId = $result.schedule_id
Invoke-RestMethod "http://localhost:8000/api/v1/datasets/$datasetId/schedules/$scheduleId/assignments"
Invoke-RestMethod "http://localhost:8000/api/v1/datasets/$datasetId/schedules/$scheduleId/export" |
  ConvertTo-Json -Depth 30 | Set-Content ..\exports\schedule.json
python ..\validator.py --data ..\data\cit_public.json --schedule ..\exports\schedule.json
```

`status` is `optimal` only when CP-SAT proves the best soft score, and `feasible` when it finds a complete hard-valid timetable but has not proved optimality within the time limit. Infeasible inputs return HTTP 422 without persisting a partial schedule. See [docs/TIMETABLE_SOLVER.md](docs/TIMETABLE_SOLVER.md) for constraints and scoring weights.

## Team workflow and exports

See [Team structure](docs/TEAM_STRUCTURE.md), [API contracts](docs/API_CONTRACTS.md), and the implemented [backend API integration guide](docs/API_INTEGRATION.md). Keep generated judge-format outputs under `exports/`. Use the official validator exactly as described in the starter README:

```powershell
python validator.py --data data/cit_public.json --schedule exports/schedule.json
```

The booking engine and timetable solver are implemented as backend foundations. The AI assistant, disruption management, and production dashboard remain future work.



