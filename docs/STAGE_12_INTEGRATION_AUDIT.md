# Stage 12 integration audit

Audit date: 2026-10-31. This is a code and database-state inventory before Stage 12 implementation.

## Existing working features

- FastAPI routes cover health, dataset import/list/detail, schedule generation/assignments/export, booking execution/outcomes, and Stage 11 disruption proposals and approval/rejection.
- The dataset importer reads JSON with CSV supplements, validates inputs, preserves source IDs, and is transactionally idempotent.
- The deterministic booking engine and CP-SAT schedule/exam solver use selected-dataset records. The solver persists complete schedules, supports warm starts, and exports the official validator format.
- Deterministic booking and disruption parsers provide structured proposals/clarifications; disruption proposals run through CP-SAT and require explicit approval.
- SQLAlchemy models include 17 registered tables. The base migration is `415e1b5d6866`; the Stage 11 migration adds `schedule_repair_proposals`.
- React has dashboard and timetable pages plus shared navigation/layout. The dashboard reads health and dataset-list APIs. The timetable still includes a development-preview path; other nav destinations render generic placeholders.

## Missing API and frontend integration

- No schedule list/detail/history endpoint; clients cannot discover persisted schedules through the API.
- Assignment reads return only IDs and period/room placement, not course/faculty/group display data.
- No examination allocation, room directory/availability/utilisation, booking request listing/intake, or booking parse endpoint.
- Dataset import accepts server-side `data/` paths only; browser file upload is unavailable.
- Dashboard statistics, schedule cards, booking activity, occupancy/utilisation and recent activity are placeholders/unavailable.
- Timetable selection/generation and persisted schedule display are not connected. Rooms, bookings, exams, assistant and disruption routes are placeholders.
- No frontend test runner or browser integration test suite is configured. Backend has pytest coverage for importer, booking, solver, parser, model, and Stage 11 repair behavior.

## Broken or incomplete workflow

The backend can import and schedule data, but there is no frontend path for uploading a dataset, selecting a persisted schedule, triggering a solve, and reviewing its results. Booking request outcomes exist, but the UI cannot list requests or initiate a booking parse/intake. Exam allocations and rooms are persisted but not readable in display-ready API responses. Stage 11 repair is available via HTTP, but no UI presents the diff or approval workflow.

## Database migration requirement and live state

Read-only inspection of the configured external PostgreSQL database reported revision `415e1b5d6866`; `public.schedule_repair_proposals` is absent. The current Alembic head is `8c41d892c2aa`, which creates only that proposal table, two indexes, constraints, and composite dataset-scoped schedule foreign keys. The migration is additive and its downgrade drops only the new table/indexes. Models are registered with Alembic metadata. The live migration was **not** applied; this task has no approved deployment step. Exact command for a separately approved environment: from `backend/`, `.\.venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head` (targets the `DATABASE_URL` from that environment's `.env`).

## Existing test and environment coverage

- Stage 11 baseline was 209 backend tests; current Stage 12 implementation will rerun the full suite.
- Backend tests use isolated SQLite fixtures. They do not mutate Supabase.
- This audit verified the configured PostgreSQL revision read-only; no credentials or host were printed.
- Frontend production build and production API connectivity will be checked after implementation. No authentication provider or role enforcement exists; the application is not production-secure for multiple users.

## Architectural considerations

- `GET /health` is process liveness, not database readiness.
- A recurring weekly schedule is represented by day and period, not calendar dates/timezone. UI must label it as a weekly pattern.
- Room utilisation needs an explicit denominator. Stage 12 will define teaching-room utilisation as assigned session period-hours divided by available teaching room period-hours, excluding periods marked unavailable and respecting room `allowed_uses`.
- Supabase migration application must remain a manual deployment action. A successful local build or SQLite test is not live feature verification.
- Dataset imports replace/reconcile records for an identical source dataset ID; the UI must warn before re-importing an existing dataset and make that action intentional.
