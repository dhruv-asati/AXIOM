# AXIOM Backend API Integration

This document describes the HTTP API currently exposed by the FastAPI service. The API base path is `/api/v1`; Swagger UI is available at `/docs` and the OpenAPI document at `/openapi.json` while the backend is running.

## Local connection

Run the backend from `backend/` with `uvicorn app.main:app --reload` (default address `http://localhost:8000`). The frontend reads `VITE_API_URL`, which should be the API base URL, for example `http://localhost:8000/api/v1`. The frontend's `.env.example` already contains this value. The backend allows the configured origins in `CORS_ORIGINS`; the default development origin is `http://localhost:5173`.

The health route is a liveness check only. It confirms that the HTTP process responds; it does not check database connectivity. Database-backed endpoints need a valid `DATABASE_URL` and an initialized schema.

## Response and error conventions

Successful endpoints return JSON. Errors raised by the API use FastAPI's `{"detail": ...}` envelope. Request validation errors (including malformed UUIDs and invalid request bodies) return HTTP 422 with FastAPI's validation detail. Resource lookup failures return 404. Dataset paths escaping the repository `data/` directory return 400. Infeasible timetable input returns 422; solver timeout without a solution returns 503; an incomplete schedule export returns 409.

## Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | HTTP liveness check |
| `POST` | `/api/v1/datasets/import` | Import or re-import a dataset |
| `GET` | `/api/v1/datasets` | List imported datasets |
| `GET` | `/api/v1/datasets/{dataset_id}` | Read dataset metadata |
| `POST` | `/api/v1/datasets/{dataset_id}/schedules/generate` | Generate and persist a schedule |
| `GET` | `/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/assignments` | Read persisted assignments |
| `GET` | `/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/export` | Retrieve validator-format schedule JSON |
| `POST` | `/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/bookings/run` | Run deterministic booking decisions |
| `GET` | `/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/booking-outcomes` | Read booking decisions and pending requests |

### Health

`GET /api/v1/health`

Returns `{"status":"ok","service":"axiom-api"}`.

### Datasets

`POST /api/v1/datasets/import`

Imports a dataset file or a directory containing exactly one supported dataset JSON. Paths are relative to the repository `data/` directory and cannot escape it.

```json
{"path":"cit_public.json"}
```

The path may be omitted to use the default `cit_public.json`. A successful response contains the database dataset UUID, original source dataset ID, and per-collection record counts:

```json
{"dataset_id":"<uuid>","source_dataset_id":"cit-public-v1","counts":{"faculty":0,"courses":0,"student_groups":0,"rooms":0,"room_unavailability":0,"timetable_sessions":0,"session_groups":0,"booking_requests":0,"cancellations":0,"examinations":0}}
```

Malformed input returns 422, a missing path returns 404, and a path outside `data/` returns 400.

`GET /api/v1/datasets` lists imported dataset summaries (`id`, `source_dataset_id`, `institute`, `created_at`).

`GET /api/v1/datasets/{dataset_id}` returns metadata for one UUID (`id`, `source_dataset_id`, `institute`, `calendar`, `priority_order`, `role_category_cap`). Unknown datasets return 404.

### Timetables

`POST /api/v1/datasets/{dataset_id}/schedules/generate`

Generates and persists a complete schedule for the selected dataset:

```json
{"team":"AXIOM","time_limit_seconds":120}
```

Both fields are optional; the defaults are `AXIOM` and 120 seconds. The response includes schedule and dataset IDs, `optimal` or `feasible` status, session/exam counts, and soft-constraint scores. Infeasible data returns 422; no solution before the time limit returns 503. No partial schedule is reported as valid.

`GET /api/v1/datasets/{dataset_id}/schedules/{schedule_id}/assignments`

Returns `schedule_id`, `dataset_id`, a `complete` or `incomplete` status, and session assignments containing `session_id`, `day`, `start_period`, and `room_id`.

`GET /api/v1/datasets/{dataset_id}/schedules/{schedule_id}/export`

Returns the validator-compatible schedule document: `team`, source `dataset_id`, `sessions`, and `exams`. An incomplete schedule or missing required exam allocation returns 409. Dataset/schedule mismatch returns 404.

### Booking decisions

`POST /api/v1/datasets/{dataset_id}/schedules/{schedule_id}/bookings/run`

Runs the deterministic booking rules for requests belonging to the selected dataset, against a schedule in that same dataset. There is no request body. The response contains dataset/schedule UUIDs and approved, rejected, and pending counts. A missing or cross-dataset schedule returns 404; invalid dataset decision metadata returns 422.

Example response: `{"dataset_id":"<uuid>","schedule_id":"<uuid>","counts":{"approved":0,"rejected":0,"pending":0}}`.

`GET /api/v1/datasets/{dataset_id}/schedules/{schedule_id}/booking-outcomes`

Returns one item per booking request, ordered by submission time and source ID. Each item has `request_id`, `status`, optional `day`, `start_period`, `end_period`, `room_id`, and `reason`. A request without a persisted decision is returned as `pending` with the optional decision fields set to null.

## Example workflow

1. Start the API and import or select a dataset.
2. Generate a schedule for that dataset and retain the returned `schedule_id`.
3. Retrieve assignments or export the validator-format document.
4. Run booking decisions against that schedule and retrieve outcomes.

All timetable and booking routes take both dataset and schedule IDs where applicable. The backend verifies that schedules belong to the requested dataset; callers should retain the UUIDs returned by the API rather than infer IDs from source records.

## Current integration boundary

The API does not currently provide authentication, pagination, generated TypeScript clients, disruption routes, assistant routes, or booking-request submission routes. These require separate contracts before implementation. Do not treat the health route as a database readiness check.
