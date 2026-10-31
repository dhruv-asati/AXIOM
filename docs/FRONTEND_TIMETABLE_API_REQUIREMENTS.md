# AXIOM Timetable Frontend API Requirements

Frontend owner: Om. Timetable generation/output owner: Niharika. API owner: Dhruv.

This is a frontend integration checklist, not an agreed endpoint or JSON schema. Resolve the items with the owners and record the approved contract in `API_CONTRACTS.md` before connecting production timetable data.

## What is documented today

- `GET /api/v1/timetables/{timetable_id}` is listed in `API_CONTRACTS.md`, but retrieval behavior, status, and response schema are TODO.
- `POST /api/v1/timetables/generate` is listed, but request, job, and result contracts are TODO. The frontend does not call it or generate schedules.
- `examples/schedule.example.json` documents an export shape but explicitly says it is not a real solution. The development preview uses only these sample placements and is visibly labelled as such.
- The official weekly schedule export identifies placements with session ID, weekday, start period, and room ID. Source dataset records provide course, session kind/duration, faculty, and group reference information. Exported regular teaching uses Monday–Friday; the UI can display Monday–Saturday when a loaded schedule contains Saturday.
- The starter guide maps periods to campus clock times and describes the lunch break. The frontend uses that documented mapping and local date arithmetic; it does not parse schedule days as UTC dates.
- The example schedule contains no conflict diagnostics. The frontend does not infer, validate, or declare timetable conflicts.

## Decisions needed before production integration

1. How the frontend identifies the timetable to retrieve, and whether it can select the current/active timetable.
2. The approved response shape and status lifecycle for `GET /timetables/{timetable_id}`.
3. Whether response sessions are only placements or include/join display metadata. At minimum the UI needs placement day/period/room plus source identifiers to join course code/title/department, session kind/duration, faculty identity/display name, and student group identity/display name.
4. Whether dates are a recurring weekly pattern or have an effective date/term range. The current starter export is a recurring weekday/period pattern; the calendar week control is therefore only a view context until the active schedule period is defined.
5. How official solver/backend diagnostics are represented: conflict category and description, affected session identity, and affected room/faculty where provided. The frontend will render supplied diagnostics only.
6. Authentication, error envelope, unavailable/empty behavior, and refresh/cache expectations.

Once agreed, add concrete request/response examples and types to `API_CONTRACTS.md`. Until then, production builds show an unavailable state. A separately loaded development preview remains gated to `import.meta.env.DEV` and never supplies production timetable data.
