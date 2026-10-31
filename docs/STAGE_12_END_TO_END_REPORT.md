# Stage 12 integration and verification report

## Architecture and implemented workflow

The React + TypeScript + Vite frontend calls the FastAPI /api/v1 API through a shared fetch client. The selected dataset UUID is kept in shared React context and browser local storage. Dataset, schedule, request, room and proposal values are read from the backend; no campus metrics or occupancy telemetry are fabricated.

The end-user workflow is available through the application: import a JSON dataset with optional CSV supplements, choose a dataset, generate and inspect a schedule, review exams and room use, run deterministic booking decisions, use the local assistant parser to prepare a request, and create/inspect/approve/reject solver-based repair proposals. Approval creates a new schedule; it does not overwrite the baseline.

## Frontend pages

- **Overview:** dataset counts, schedule state, request counts, computed room utilisation, timetable sample, proposals and explicit no-telemetry empty state.
- **Datasets:** JSON/CSV upload, duplicate replacement confirmation, dataset selection and imported counts.
- **Timetable:** persisted schedule selection/history, generation, filters and weekly assignment view.
- **Rooms:** dataset rooms, availability filters, features and schedule-based utilisation.
- **Bookings:** requests, statuses/reasons, priority/category and explicit confirmation to run deterministic decisions.
- **Examinations:** exam schedule and all room allocations with effective capacities.
- **Assistant:** local parser; booking proposals are user-reviewed before submission. It never decides or approves.
- **Disruptions:** structured or parser-assisted proposal creation, impact/assignment preview and explicit approval/rejection.
- **Analytics:** backend-derived statistics.
- **Settings:** API/dataset connection details and authentication limitation.

All pages have loading/error/empty states as appropriate. There is no authentication or authorization layer; use only within a trusted development environment.

## API routes

System: GET /health, GET /ready.

Datasets: POST /datasets/import, POST /datasets/import/upload, GET /datasets, GET /datasets/{id}, GET /datasets/{id}/summary.

Schedules: POST /datasets/{id}/schedules/generate, GET /datasets/{id}/schedules, GET /datasets/{id}/schedule-history, GET /datasets/{id}/schedules/{schedule_id}, GET /datasets/{id}/schedules/{schedule_id}/assignments (filterable), and GET /datasets/{id}/schedules/{schedule_id}/export.

Operations: GET /datasets/{id}/rooms, GET /datasets/{id}/schedules/{schedule_id}/examinations, GET /datasets/{id}/bookings, POST /datasets/{id}/booking-requests, POST /datasets/{id}/schedules/{schedule_id}/bookings/run, GET /datasets/{id}/schedules/{schedule_id}/booking-outcomes.

Assistant and disruptions: POST /assistant/bookings/parse, POST /assistant/disruptions/parse, POST /datasets/{id}/schedules/{schedule_id}/assistant/disruptions/repair-proposals, POST /datasets/{id}/schedules/{schedule_id}/repair-proposals, GET /datasets/{id}/repair-proposals, GET /datasets/{id}/schedules/{schedule_id}/repair-proposals/{proposal_id}, plus proposal /approve and /reject routes.

Full payload and filter details are in [API_CONTRACTS.md](API_CONTRACTS.md).

## Database and migration state

The configured Supabase database was checked read-only during the integration audit: revision 415e1b5d6866. The code migration head is cd9a2f1b7e40, after 8c41d892c2aa (repair proposal persistence) and cd9a2f1b7e40 (schedule creation timestamp). These migrations are not applied to Supabase. The disruption and schedule-history database workflows therefore cannot be live-verified until the migrations are reviewed and applied by an authorized operator.

Safe checks from backend:

    python -m alembic -c alembic.ini current
    python -m alembic -c alembic.ini heads
    python -m alembic -c alembic.ini upgrade head --sql

To explicitly apply, first verify DATABASE_URL targets the intended database and review generated SQL; then run python -m alembic -c alembic.ini upgrade head. This mutates that target. It was not run during Stage 12.

## Test and validator results

- Backend suite: cd backend; .\.venv\Scripts\python.exe -m pytest -q — **211 passed**, 1 third-party Starlette/AnyIO deprecation warning.
- Alembic: one head cd9a2f1b7e40; history forms the expected single chain; upgrade head --sql generated PostgreSQL SQL successfully without applying it.
- Frontend: cd frontend; npm run build — TypeScript project build and Vite production build passed.
- Official validator: python validator.py --data data/cit_public.json --schedule exports/schedule.json — **0 hard violations**, soft penalty **145** (S1=4, S2=107, S3=15, S4=6, S5=10, S6=3), exam soft penalty **15**. Total reported penalty: **160**.
- No candidate schedule_after.json exists, so disruption validator command was not run.

## End-to-end status

| Stage | Status | Evidence / limitation |
|---|---|---|
| Import dataset and read dataset statistics | IMPLEMENTED BUT NOT LIVE-VERIFIED | API routes and SQLite test coverage exist; actual live DB is behind current schema head. |
| Generate and view persisted timetable | IMPLEMENTED BUT NOT LIVE-VERIFIED | Backend workflow tests and existing export validation pass; no live generation was run during Stage 12. |
| Review exams and rooms | IMPLEMENTED BUT NOT LIVE-VERIFIED | API and UI are connected; live routes require production schema availability. |
| Run and review bookings | IMPLEMENTED BUT NOT LIVE-VERIFIED | Deterministic engine and backend tests pass; no Stage 12 live booking mutation performed. |
| Parse booking/disruption requests | COMPLETE AND VERIFIED | Existing deterministic parser APIs are connected; proposal requires user review. |
| Create, inspect and decide disruption proposal | IMPLEMENTED BUT NOT LIVE-VERIFIED | Backend tests cover proposal workflows; Supabase lacks the repair-proposal migration. |
| Preserve baseline and switch schedules | IMPLEMENTED BUT NOT LIVE-VERIFIED | Service creates a separate approved schedule; live proof awaits migration application. |
| Authentication / production authorization | NOT IMPLEMENTED | No auth system exists; deployment beyond a trusted environment is not recommended. |

## Startup

Backend (from repository root):

    cd backend
    .\.venv\Scripts\Activate.ps1
    uvicorn app.main:app --reload

Frontend in a second terminal:

    cd frontend
    npm install
    Copy-Item .env.example .env.local
    npm run dev

Set the backend DATABASE_URL and CORS_ORIGINS in backend/.env; set frontend VITE_API_URL in frontend/.env.local. Then open http://localhost:5173, import/select a dataset, and use the workflow described above.
