# AXIOM Stage 13B — Live Supabase backend verification

Verification date: 2026-10-31

## 1. Database connectivity and revision

The configured PostgreSQL connection was reached using the existing backend configuration. The target hostname resolved to a Supabase pooler in eu-west-2 and database name postgres; credentials and the complete database URL were not printed.

- Alembic revision: cd9a2f1b7e40 (head).
- GET /api/v1/ready: HTTP 200, {"status":"ready","database":"available"}.
- Read-only catalog queries confirmed the proposal table, schedule timestamp, related tables, and data counts were accessible.
- No migration was run or reapplied.

The earlier known revision at 415e1b5d6866 was stale for the database configured during this verification.

## 2. Existing CIT records

Identifiers were discovered from the live database, not guessed:

- Dataset source ID: cit-public-v1
- Dataset UUID: 954250b0-bec8-411b-9ee4-9b8b25d80446
- Schedule UUID: 8f616fff-abac-4154-b3e8-631ee8b7945b

Direct read-only database counts for that schedule/dataset:

- Schedule assignments: 189
- Distinct examinations with room allocations: 41
- Rooms: 27
- Booking requests: 25
- Booking outcomes: 25
- Repair proposals: 0

Booking outcome status distribution was approved 21, rejected 4. The API returned the same distribution. The booking engine was not rerun.

## 3. Live GET endpoint verification

The backend server was already listening on localhost:8000. Endpoints below were called over HTTP; successful responses passed FastAPI response-model serialization. No endpoint returned an unexpected 500.

| Endpoint | HTTP | Result |
|---|---:|---|
| GET /health | 404 | Expected: router is mounted under /api/v1; no root-level health route exists. |
| GET /api/v1/health | 200 | liveness status ok |
| GET /api/v1/ready | 200 | database available |
| GET /api/v1/datasets | 200 | CIT dataset listed |
| GET /api/v1/datasets/{dataset_id} | 200 | source ID matched cit-public-v1 |
| GET /api/v1/datasets/{dataset_id}/summary | 200 | summary returned |
| GET /api/v1/datasets/{dataset_id}/schedules | 200 | one schedule |
| GET /api/v1/datasets/{dataset_id}/schedule-history | 200 | one schedule; created_at returned |
| GET /api/v1/datasets/{dataset_id}/schedules/{schedule_id} | 200 | detail returned |
| GET /api/v1/datasets/{dataset_id}/schedules/{schedule_id}/assignments | 200 | 189 assignments |
| GET /api/v1/datasets/{dataset_id}/schedules/{schedule_id}/export | 200 | 189 sessions and 41 exams |
| GET /api/v1/datasets/{dataset_id}/rooms?schedule_id={schedule_id} | 200 | 27 rooms |
| GET /api/v1/datasets/{dataset_id}/schedules/{schedule_id}/examinations | 200 | 41 examinations |
| GET /api/v1/datasets/{dataset_id}/bookings?schedule_id={schedule_id} | 200 | 25 requests |
| GET /api/v1/datasets/{dataset_id}/schedules/{schedule_id}/booking-outcomes | 200 | 25 outcomes: 21 approved, 4 rejected |
| GET /api/v1/datasets/{dataset_id}/repair-proposals | 200 | empty list for CIT |
| GET dataset with unknown UUID | 404 | expected not found response |
| GET schedule detail with unknown UUID | 404 | expected not found response |
| GET proposal detail with unknown UUID | 404 | expected not found response |

The first assignment returned by the API matched a direct database query for its source session ID, day, start period, and room. API counts matched database counts for assignments, rooms, exams, bookings, and outcomes.

## 4. Migration-dependent reads

The proposal list for CIT was empty, so there was no existing proposal object to deserialize in the original dataset. The isolated test below created two proposals and verified proposal creation, list retrieval, individual detail retrieval, status fields, changes and approved schedule reference.

The CIT history API returned the live schedule timestamp. The live timestamp matched the database value. History ordering was additionally checked with two isolated test schedules; the approved schedule was returned before its baseline.

## 5. Isolated live write workflow

The importer supports an isolated source dataset, so a small dataset was uploaded with a unique source ID. This did not replace or modify CIT. Per the instruction not to delete records, the test dataset and its resulting records remain in Supabase:

- Source ID: axiom-stage13b-live-smoke-65c40d957f
- Dataset UUID: 9465a575-d2c2-43e2-8860-52ebe28435b0
- Baseline schedule UUID: 653b5f07-fec0-4191-8ddc-714fe6780c29
- Approved schedule UUID: 75c12931-17b1-4773-aa17-007e51858f85

Verified live operations:

1. Uploaded/imported the isolated dataset and retrieved its metadata: HTTP 200.
2. Generated a one-session timetable: HTTP 200, solver status optimal.
3. Retrieved the complete baseline assignment: HTTP 200.
4. Created a room-unavailability repair proposal: HTTP 200.
5. Retrieved the proposal list and individual proposal details: HTTP 200.
6. Rejected the first proposal: HTTP 200; baseline assignment remained unchanged.
7. Created a second proposal and approved it: HTTP 200.
8. Approval created a distinct schedule using the alternate room; the baseline assignment remained unchanged.
9. Schedule history returned both schedules in newest-first order.
10. Final isolated database counts: 2 schedules, 2 assignments, 2 proposals (one rejected and one approved), and 1 room-unavailability record.

No CIT schedule, assignment, booking request, booking outcome, or export was written or changed. Read-only counts after the isolated workflow remained: 1 CIT schedule, 189 assignments, 25 requests, and 25 outcomes. No production proposal was approved or rejected.

## 6. Application behavior and errors

- Pydantic response validation succeeded for all successful GET calls.
- Unknown dataset, schedule, and proposal IDs returned expected 404 responses.
- Root-level /health returns 404 because the actual route is /api/v1/health; the documented API health path works.
- SQLAlchemy get_db uses a session context manager, commits successful requests with an active transaction, and rolls back exceptions.
- configure_mappers() completed with SAWarning treated as an error; no mapper warning occurred.
- No unexpected 500 response was observed.

## 7. Regression tests and validator

- Backend: from backend, .\.venv\Scripts\python.exe -m pytest -q — **211 passed**, one Starlette/AnyIO deprecation warning.
- Official baseline validator: from repository root, python validator.py --data data/cit_public.json --schedule exports/schedule.json — **0 hard violations**; soft penalty 145 (S1=4, S2=107, S3=15, S4=6, S5=10, S6=3); exam soft penalty 15.
- exports/schedule.json and exports/schedule_after.json were not modified.

The live Supabase GET checks and isolated live writes above are distinct from the SQLite-backed backend tests. SQLite tests remain useful for regression coverage, but were not treated as proof of live behavior.

## 8. Remaining limitations

- There were no pre-existing CIT repair proposals, so proposal read behavior was verified on newly created isolated records instead.
- The isolated test dataset and records are intentionally retained; no cleanup or deletion was performed.
- No booking engine run was performed against CIT.
- No authentication/authorization verification was possible; the application has no authentication layer.
- No frontend browser-driven end-to-end run was part of this backend verification.
- The API's health route is mounted at /api/v1/health, not /health.

No unresolved backend connectivity or migration-schema blocker was found for the configured database.
