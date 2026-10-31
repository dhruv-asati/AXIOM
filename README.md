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

Vite prints the local app URL (normally `http://localhost:5173`). `VITE_API_URL` in `frontend/.env.local` controls the backend base URL. The public landing page is available at `/`; sign-in at `/login` uses the backend's HttpOnly session cookie. Protected navigation is based on the role returned by the server. See [frontend setup](frontend/README.md) and [role access and demo account setup](docs/ROLE_ACCESS.md).

## Render deployment preparation

The repository includes a root Dockerfile and Render Blueprint for one Docker web service. FastAPI serves the production-built React app and API from the same origin. Review [the Render deployment guide](docs/DEPLOYMENT_RENDER.md) before building or creating a Render service. Authentication and booking approvals require the pending migrations to be reviewed and applied before use. Database migrations remain manual and are never run at application startup.

## Authentication and demo accounts

AXIOM supports exactly four roles: `admin`, `department_coordinator`, `faculty`, and `club_representative`. There are no bundled usernames or passwords. Create four unique, strong credentials and provision them from a protected environment variable after applying the pending auth migration. Do not commit the values or place them in frontend configuration. Full steps and the per-role account context are in [docs/ROLE_ACCESS.md](docs/ROLE_ACCESS.md).

| Demo account | Required account context |
| --- | --- |
| Admin | Campus-wide; no dataset or department assignment. |
| Department coordinator | Imported dataset source ID and an existing department in that dataset. |
| Faculty | Imported dataset source ID and a faculty source ID from that dataset; department is derived from the faculty record. |
| Club representative | Imported dataset source ID and a club identifier. |

After migrations and dataset import, set `AXIOM_DEMO_ACCOUNTS_JSON` to a JSON array containing exactly one object for each role (with unique username and password, plus that role's context), then run `python -m app.commands.provision_demo_accounts` from `backend/`. The command enforces 14-character minimum passwords, stores scrypt hashes, and does not print credentials. It is idempotent only when existing usernames, passwords and contexts match; it refuses to reset or overwrite an existing account. Assign department ownership to lab rooms in Room Management before using coordinator lab approvals. In Render, set the JSON as a protected secret, run the same command from the Render Shell, then privately share each account's username and initial password with judges. Never put populated JSON in the repository. See the linked guide for the exact JSON shape and PowerShell command.

## Database migrations

Alembic is configured in `backend/alembic.ini`; authentication and booking approvals use revisions `31c4d6a2f809` and `4a92d6c1e7b0`. Review generated SQL before applying. Run from `backend/`:

```powershell
alembic revision --autogenerate -m "describe schema"
alembic upgrade head
```

Neither migration is applied automatically. Applying them adds authentication/session and booking-approval data; downgrading removes that new data, room ownership assignments, and recorded human decisions. Confirm `DATABASE_URL` and back up the database before any intentional apply or downgrade. Never use application startup to migrate a database.

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

## Campus operations workflow

The application now includes dataset management, timetable generation and review, room directory and utilisation, examination allocations, booking review and deterministic booking decisions, a review-only request assistant, and disruption repair proposals. From the UI, use **Datasets** to import JSON plus optional CSV supplements, select the dataset in the top bar, generate a schedule in **Timetable**, then review bookings, examinations and rooms. Disruption proposals are solver-generated previews; approving one explicitly creates a new schedule and preserves the baseline.

The assistant is a deterministic parser and proposal handoff. It does not approve bookings or disruptions. Authentication and four-role authorization are implemented, but the role-auth migration must be reviewed/applied and demo accounts provisioned before public use. Dashboard and analytics values are read from the backend. Live room occupancy is intentionally shown as unavailable because no check-in telemetry source is connected.

### Import through the application

Open `http://localhost:5173/datasets`. Select the dataset JSON and, if applicable, its CSV supplement files. Replacing a dataset with an existing source ID requires a separate confirmation. The API accepts one JSON file and CSV files through `POST /api/v1/datasets/import/upload` and validates the import before commit.

### Migration safety

Current database environments may not have the Stage 11 and Stage 12 migrations. Check the configured target first with `alembic current` from `backend/`. To preview SQL without applying it, use:

```powershell
python -m alembic -c alembic.ini upgrade head --sql
```

After confirming `DATABASE_URL` points to the intended environment and reviewing the SQL, apply migrations explicitly with `python -m alembic -c alembic.ini upgrade head`. This command mutates that configured database; it is not run automatically by AXIOM. Stage 12 adds repair-proposal persistence and `schedules.created_at` for schedule history.

### Backend tests and frontend build

```powershell
cd backend
python -m pytest -q
cd ..\frontend
npm run build
```

See [docs/API_INTEGRATION.md](docs/API_INTEGRATION.md), [docs/TIMETABLE_SOLVER.md](docs/TIMETABLE_SOLVER.md), and [docs/STAGE_12_END_TO_END_REPORT.md](docs/STAGE_12_END_TO_END_REPORT.md) for endpoint details and verified limitations.



