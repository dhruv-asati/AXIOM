# AXIOM Examination Frontend API Requirements

Frontend owner: Om. Examination solver/output owner: Niharika. API owner: Dhruv.

This checklist does not define an endpoint or response schema. The frontend currently makes no examination data request because `API_CONTRACTS.md` has no examination schedule retrieval contract.

## Data inspected

- `data/csv/exams.csv` and `data/cit_public.json` contain solver input definitions: exam ID, course IDs, student groups, expected source size, and duration. They do not contain assigned dates, times, rooms, invigilators, examination types, allocations, or solver conflict diagnostics.
- `examples/schedule.example.json` shows the export shape for an exam assignment (`exam_id`, `day`, `session`, and `rooms`) and is explicitly marked as not a valid solution. It is not used as frontend data.
- `docs/STARTER_PACK_README.md` describes a six-day Monday–Saturday exam week with AM and PM slots in `calendar.exam_week`; it does not provide actual calendar dates or a solver output file.
- No generated `schedule.json` or `exports/` output is present in the repository.
- `API_CONTRACTS.md` documents no examination endpoint. Existing timetable routes are TODO for retrieval/status/response schemas and do not define examination data.

Until an agreed schedule response is documented, the production and development page both show an honest unavailable state. The source input CSV and shape-only schedule example are not treated as scheduled examinations or room assignments.

## Decisions needed before production integration

1. Approved retrieval route and how the active exam schedule/solver run is identified; whether generation is synchronous or job-based.
2. Exam record identity, display name, course IDs/names, department derivation, student groups, exam type, expected attendance, duration, and invigilator/privacy fields.
3. Actual examination calendar dates, timezone, session/start/end representation, schedule lifecycle/status, and whether unscheduled exam definitions are returned separately from placed examinations.
4. Room allocation semantics for multi-room exams: room identity/name/building, exam-effective capacity, assigned attendance per room, and allocation status. Missing assignment must not imply availability.
5. Conflict diagnostic schema: type, affected examination/resource, explanation, and severity if defined. The UI will render only supplied diagnostics.
6. Search/filter query semantics, pagination/order, empty and error behavior, authentication, refresh/freshness behavior, and privacy rules.

Add the approved endpoint, request/response examples, lifecycle, and error contract to `API_CONTRACTS.md` before wiring the frontend service. The frontend must not allocate rooms, infer conflicts, or judge schedule validity.
