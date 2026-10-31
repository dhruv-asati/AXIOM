# API contracts

Base path: `/api/v1`. Dataset import, system, and deterministic booking decision endpoints are implemented; other contracts remain placeholders.

## System

- `GET /health` — implemented foundation check. Returns `{"status":"ok","service":"axiom-api"}`.

## Datasets

- `POST /datasets/import` — body `{"path":"cit_public.json"}`; reads only from repository `data/`, validates records and atomically upserts the dataset. A directory path must contain exactly one dataset JSON. Returns database `dataset_id`, source dataset ID and counts per imported table. Malformed records return HTTP 422; paths outside `data/` return HTTP 400.
- `GET /datasets` — list imported dataset IDs and institute names.
- `GET /datasets/{dataset_id}` — retrieve one dataset's metadata; unknown UUIDs return HTTP 404.

## Dataset and campus reference data

Owner: Dhruv (API/persistence), Niharika (solver inputs).

- `GET /campus/rooms` — TODO: filters and room response schema.
- `GET /campus/faculty` — TODO: response schema and privacy scope.
- `GET /campus/groups` — TODO: response schema.

## Timetables

Owner: Niharika.

- `POST /datasets/{dataset_id}/schedules/generate` — implemented CP-SAT generation. Body: `{"team":"AXIOM","time_limit_seconds":120}`. Returns schedule UUID/source ID, `optimal` or `feasible` status, scheduled counts and soft scores. Infeasible data returns HTTP 422 without persisting partial schedules; no solution before timeout returns HTTP 503.
- `GET /datasets/{dataset_id}/schedules/{schedule_id}/assignments` — returns persisted session assignment rows and completeness status. Dataset mismatch returns HTTP 404.
- `GET /datasets/{dataset_id}/schedules/{schedule_id}/export` — returns the validator-compatible schedule JSON, including all session assignments and required exam room allocations. Incomplete schedule or exam data returns HTTP 409.
- `POST /timetables/{timetable_id}/disruptions` — TODO: disruption input and repaired schedule response.

See [TIMETABLE_SOLVER.md](TIMETABLE_SOLVER.md) for the enforced rules and exact validator scoring weights.

## Venue bookings

Owner: Dhruv.

- `POST /datasets/{dataset_id}/schedules/{schedule_id}/bookings/run` — implemented deterministic, transactional decision run for all booking requests in the dataset, evaluated against the specified same-dataset schedule. Returns approved/rejected/pending counts. Unknown datasets or schedules return HTTP 404; invalid priority metadata returns HTTP 422.
- `GET /datasets/{dataset_id}/schedules/{schedule_id}/booking-outcomes` — implemented ordered request decisions, including `pending` when no outcome exists for that request and schedule.
- `POST /bookings/requests` — TODO: booking request and validation errors.
- `GET /bookings/requests` — TODO: filtering, pagination, and status fields.
- `POST /bookings/requests/{request_id}/decision` — TODO: approval/rejection payload and priority behavior.

## AI assistant

Owner: Siddharth.

- `POST /assistant/requests` — TODO: natural-language input, parsed intent, clarification, and action proposal schemas.

## Frontend integration

Owner: Om.

- Backend base URL is configured with `VITE_API_URL`.
- TODO: agree on authentication (if required), error envelope, pagination, and generated TypeScript types.
