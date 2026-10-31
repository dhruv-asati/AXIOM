# API contracts

Base path: `/api/v1`; interactive Swagger documentation is served at `/docs` and OpenAPI JSON at `/openapi.json`.

All dataset and schedule paths use database UUIDs. The backend verifies dataset ownership and scopes record reads and writes to the selected dataset. Errors use FastAPI's `{"detail": ...}` envelope. Database/schema availability failures return HTTP 503. `POST /api/v1/auth/login` is public and issues the HttpOnly session cookie; `GET /api/v1/auth/session` restores session and CSRF state; `POST /api/v1/auth/logout` revokes the session. `/api/v1/health` is public for hosting health checks. Other routes require an authenticated role and enforce role/dataset context. See [role access and demo account setup](ROLE_ACCESS.md).

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
- `GET /datasets/{dataset_id}/schedules/{schedule_id}/department-lab-bookings` — department coordinator's pending lab-capable requests for explicitly department-assigned labs.
- `POST /datasets/{dataset_id}/schedules/{schedule_id}/bookings/{request_source_id}/department-lab-decision` — coordinator approval or rejection; approval requires room, day and start period; rejection requires a reason.
- `POST /datasets/{dataset_id}/bookings/{request_source_id}/class-move-proposals` — requester creates a solver-backed class move proposal with `schedule_id`, `room_id`, `day`, and `start_period`.
- `GET /datasets/{dataset_id}/class-move-proposals` — Admin-only list with baseline and proposed assignments.
- `POST /datasets/{dataset_id}/class-move-proposals/{proposal_id}/decision` — Admin-only `{"decision":"approve"}` or `{"decision":"reject","reason":"..."}`. Approval revalidates then creates a derived schedule and approved booking outcome; rejection records reason and actor.
- `PUT /datasets/{dataset_id}/rooms/{room_source_id}/department` — Admin assigns or clears room department ownership. Department values must exist in this dataset.

Booking decisions stay rule-based: the route does not call an LLM. Re-running updates outcomes rather than duplicating them.
Human lab and class-move decisions are distinguished from engine outcomes and are preserved if the engine is run again. A request cannot have multiple approved booking outcomes across schedules.

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
