# AXIOM API integration

The FastAPI service exposes `/api/v1`; Swagger UI is at `http://localhost:8000/docs`. Run backend commands from `backend/`. Set `DATABASE_URL` and `CORS_ORIGINS` in `backend/.env` (copy the root `.env.example` first). `GET /health` is liveness; `GET /api/v1/ready` checks the database.

## Start locally

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

In another terminal:

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Use `VITE_API_URL=http://localhost:8000/api/v1`. Configure the backend CORS allow-list to include `http://localhost:5173`.

## Integrated workflow and routes

The application supports dataset upload/import and selection; schedule generation, history, assignment filtering and export; exam allocation review; room availability/utilization; booking request review and deterministic booking execution; parser-assisted request intake; and disruption repair proposal review. The complete route inventory and request contracts are in [API_CONTRACTS.md](API_CONTRACTS.md).

Typical sequence:

1. Import a dataset from `/datasets` (JSON and optional CSV supplements), then select it in the top bar.
2. Generate a schedule from `/timetable`; retrieve persisted assignments and examinations using the returned schedule ID.
3. Run deterministic booking decisions from `/bookings` and review outcomes and reasons.
4. In `/disruptions`, submit a natural language or structured change, inspect the solver candidate, then approve or reject explicitly.
5. Approval persists the source change and a new schedule. The baseline is preserved and remains selectable in timetable history.

## Operational behavior

- API errors return `{"detail": ...}`. Missing dataset/schedule/proposal is 404; invalid data is 422; infeasible solve is 422; timeout without a complete result is 503; stale or invalid proposal transitions are 409.
- SQLAlchemy errors return a generic 503 message. Server logs include only the exception class, not connection details.
- Upload supports one JSON plus CSV files, with path validation, file-type checks, and bounded file count/size. Dataset replacement requires explicit `replace_existing` confirmation.
- Schedule and booking operations are dataset-scoped. Composite PostgreSQL constraints add integrity enforcement.
- No authentication or authorization is configured. Keep this app on a trusted network until access control is implemented.

## Migrations

Check the target revision with `python -m alembic -c alembic.ini current`. Preview the pending SQL with `python -m alembic -c alembic.ini upgrade head --sql`. Only after checking `DATABASE_URL` and reviewing the SQL, apply with `python -m alembic -c alembic.ini upgrade head`. That command mutates its configured database. AXIOM does not run migrations on startup.
