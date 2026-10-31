# API contracts

Base path: `/api/v1`; interactive Swagger documentation is served at `/docs` and OpenAPI JSON at `/openapi.json`.

All dataset and schedule paths use database UUIDs. The backend verifies dataset ownership and scopes record reads and writes to the selected dataset. Errors use FastAPI's `{"detail": ...}` envelope. Database/schema availability failures return HTTP 503. No route provides authentication or authorization in this version.

## System

- `GET /health` — HTTP liveness only.
- `GET /ready` — executes a database check and reports database readiness.

## Datasets

- `POST /datasets/import` — imports a JSON dataset from the configured repository data directory. `replace_existing` must be true to replace an existing source dataset ID.
- `POST /datasets/import/upload` — multipart `files` containing exactly one JSON dataset and optional CSV supplements; `replace_existing` is a form field. Uploads are limited to CSV/JSON and bounded size/count.
- `GET /datasets` and `GET /datasets/{dataset_id}` — catalog and metadata.
- `GET /datasets/{dataset_id}/summary` — source counts, schedules, bookings, room utilization, weekly assignment preview and recent repair proposals.

## Timetable and exams

- `POST /datasets/{dataset_id}/schedules/generate` — CP-SAT generation and persistence. Supports optional warm-start schedule ID; returns solver status and counts.
- `GET /datasets/{dataset_id}/schedules` — schedule list.
- `GET /datasets/{dataset_id}/schedule-history` — ordered schedule history.
- `GET /datasets/{dataset_id}/schedules/{schedule_id}` — schedule status and counts.
- `GET /datasets/{dataset_id}/schedules/{schedule_id}/assignments` — assignment details; optional `day`, `faculty_id`, `room_id`, `course_id`, and `group_id` filters.
- `GET /datasets/{dataset_id}/schedules/{schedule_id}/examinations` — exam slots and all room allocations with effective capacities.
- `GET /datasets/{dataset_id}/schedules/{schedule_id}/export` — official validator-compatible JSON.

Infeasibility returns 422; solver timeout without a complete solution returns 503; incomplete export returns 409. A generated schedule is persisted as a separate record.

## Venues and bookings

- `GET /datasets/{dataset_id}/rooms` — room characteristics and schedule utilization; filters include `schedule_id`, `room_type`, `min_capacity`, `accessible`, `day`, `period`, and `available_only`.
- `GET /datasets/{dataset_id}/bookings?schedule_id=...` — requests and status for a schedule (omitting schedule ID returns requests as pending).
- `POST /datasets/{dataset_id}/booking-requests` — add a validated request to the selected dataset; duplicate source IDs return 409.
- `POST /datasets/{dataset_id}/schedules/{schedule_id}/bookings/run` — deterministic booking decision run.
- `GET /datasets/{dataset_id}/schedules/{schedule_id}/booking-outcomes` — persisted outcomes and pending requests.

Booking decisions stay rule-based: the route does not call an LLM. Re-running updates outcomes rather than duplicating them.

## Assistant and disruptions

- `POST /assistant/bookings/parse` — deterministic, review-only booking interpretation.
- `POST /assistant/disruptions/parse` — deterministic disruption interpretation only.
- `POST /datasets/{dataset_id}/schedules/{schedule_id}/assistant/disruptions/repair-proposals` — parses a request, then creates a CP-SAT review proposal only when the parse is complete.
- `POST /datasets/{dataset_id}/schedules/{schedule_id}/repair-proposals` — create a proposal from structured `changes`.
- `GET /datasets/{dataset_id}/repair-proposals` and `GET /datasets/{dataset_id}/schedules/{schedule_id}/repair-proposals/{proposal_id}` — list/read proposals.
- `POST .../{proposal_id}/approve` — explicit approval creates a new schedule; baseline remains intact.
- `POST .../{proposal_id}/reject` — explicit rejection (body `{"reason":"..."}`).

Proposal creation is a preview and never mutates the baseline. Stale proposals are rejected at approval. These routes require migration `8c41d892c2aa`; schedule history requires `cd9a2f1b7e40`.

## Frontend connection

Set `VITE_API_URL` to the API base URL, for example `http://localhost:8000/api/v1`. The backend `CORS_ORIGINS` setting must include the frontend origin. See [API_INTEGRATION.md](API_INTEGRATION.md) for setup and workflow examples.
