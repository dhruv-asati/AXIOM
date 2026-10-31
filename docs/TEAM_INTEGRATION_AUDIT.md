# AXIOM Team Integration Audit — 31 October 2026

## Scope and evidence

Audit of the checked-out `main` branch, merged Git history, current application source, tests, API contracts, and read-only local service checks. Classification is based on executable code and tests, not team assignment or file names alone. No Supabase writes, imports, migrations, booking runs, or timetable generation were performed.

The visible history includes Dhruv's foundation/backend work (`ebf976d`, `5eee7fc`), Siddharth's assistant parser work (`933c6f7`), Om's frontend work (`05317ed`), and the backend integration hardening merge (`c009cb4`); `main` includes the frontend merge (`4762c72`). The checked history contains no commit authored by Niharika. The timetable solver is present and tested, but its implementation is in Dhruv-attributed `5eee7fc`; the repository history does not establish a separate Niharika implementation contribution. This is a provenance finding, not a judgment about work outside Git.

## Contribution audit and feature matrix

| Owner / area | Feature | Classification | Evidence and current boundary |
|---|---|---|---|
| Dhruv — backend/database | SQLAlchemy models, dataset isolation constraints, Alembic initial migration | Complete and tested | Models and migration are present; backend model tests run without Supabase. Live schema was not queried in this audit. |
| Dhruv — backend/database | Dynamic dataset importer | Complete and tested locally | JSON/CSV loading, validation, transactional upsert and re-import behavior have backend tests. Live database import was deliberately not repeated. |
| Dhruv — backend/database | Dataset list/detail/import APIs | Implemented and contract-defined | `GET /datasets`, `GET /datasets/{id}`, `POST /datasets/import`; live health/OpenAPI work, but the dataset-list read timed out at the database connection. |
| Dhruv — backend/database | Booking engine and outcome APIs | Implemented and tested in isolated DB | Deterministic rules and transactional outcome upserts have tests. No live booking run was made; persisted outcomes could not be independently queried because Supabase timed out. |
| Dhruv — backend/database | Schedule persistence/export APIs | Implemented and tested in isolated DB | Generate, assignments, export and dataset scoping have tests. This audit did not call the mutating generation endpoint. |
| Om — frontend/dashboard | AXIOM layout, navigation, responsive workspace UI | Implemented | React Router pages and shared layout are present, with responsive CSS breakpoints. The current package uses CSS files rather than Tailwind; there is no Tailwind dependency/configuration. Dashboard aggregates still have unavailable placeholders where data contracts are missing. |
| Om — frontend/dashboard | Dashboard API integration | Partially integrated | Health check existed; this audit connected the existing dataset-list contract and added loading/empty/error states. Live dataset display remains unverified due to database timeout. |
| Om — frontend/dashboard | Timetable interface | UI implemented; live data not integrated | Week/day views, filters, session details and calendar navigation operate on a visibly labeled development fixture only. No selected persisted schedule is loaded. |
| Om — frontend/dashboard | Rooms, bookings, examinations, disruptions, analytics, settings | UI-only placeholders | Routes render “workspace in progress”; they do not fetch backend records. |
| Niharika — timetable optimisation (assigned) | CP-SAT timetable and exam solver | Implemented and tested; attribution unverified | Solver includes hard constraints, objective scoring, persistence and export. Its current Git commit is attributed to Dhruv, not Niharika. The checked tests cover conflicts, combined groups, elective baskets, labs, fixed slots, capacity/accessibility, infeasibility, score and isolation. |
| Niharika — timetable optimisation | Rescheduling / disruption repair | Not implemented | No repair/alternative schedule service is present under `backend/app/services/disruptions/`; it is empty apart from package initialization. |
| Siddharth — AI/NLP | Intent classification, normalization, entity extraction, follow-up and booking/disruption parsing | Partially implemented; unit tested | Deterministic parsers produce clarification or reviewable proposals; English and some Hinglish examples are tested. They do not resolve all context or take actions. |
| Siddharth — AI/NLP | Assistant API and frontend interface | Not implemented/integrated | No assistant route appears in FastAPI OpenAPI; no assistant UI or frontend client exists. |
| Siddharth — disruption | Disruption parsing | Partially implemented | Parser can form structured proposals from supported text/JSON; proposals are not validated against a selected dataset or persisted. |
| Siddharth + Niharika — disruption repair | Apply changes, invoke solver, persist alternatives, show results | Not implemented | No disruption API, mutation service, solver repair path, or frontend workflow. |

### Classification summary

- **Complete and tested:** database/model foundation, dynamic importer, deterministic booking service, CP-SAT generation and export in isolated backend tests.
- **Implemented but not integrated:** assistant parsers and timetable solver results in the React application.
- **Partially implemented:** assistant interpretation/proposal behavior and dashboard dataset metadata integration (live data blocked during this audit).
- **UI-only:** room, booking, examination, disruption, analytics and settings pages; timetable visualization currently uses a dev-only example.
- **Not implemented:** assistant HTTP/UI integration, booking UI, disruption application/repair, and persisted timetable selection/display in the frontend.

## End-to-end workflow status

| Step | Status | Finding |
|---|---|---|
| 1. Import a dataset dynamically | Complete in code/tests; live state unverified | Importer supports source files dynamically. This audit made no import. |
| 2. Show dataset information in dashboard | Partial | Dashboard now reads the existing dataset-list API and has loading, empty and error states; live DB read timed out. |
| 3. Generate a valid timetable | Complete in code/tests | CP-SAT endpoint and constraints are implemented. The existing checked-in export validates with zero hard violations. No live generation was run. |
| 4. Persist schedule and assignments | Complete in code/tests; live state unverified | Solver persists within a transaction; live schedules could not be read. |
| 5. Display persisted timetable in frontend | Blocked | Frontend shows the development fixture only. There is no schedule-list/active-schedule selection contract to locate persisted schedule IDs. |
| 6. Inspect sessions, rooms, faculty and groups | Partial / preview-only | Development timetable supports filtering/search/detail UI, but those details come from a sample fixture, not persisted API data. |
| 7. Process booking requests deterministically | Complete in code/tests; live state unverified | Booking service and run API exist; no live run was performed to avoid overwriting outcomes. |
| 8. Show booking decisions in frontend | Not implemented | Bookings page is a placeholder; no outcome client or view exists. |
| 9. Interpret natural-language requests | Partial | Tested deterministic parser services produce clarifications/proposals. |
| 10. Pass interpretation into deterministic services | Not implemented | No assistant route, proposal review endpoint, or service handoff exists. |
| 11. Process disruptions and propose feasible alternatives | Not implemented | There is parsing only; no apply/repair/persistence workflow. |
| 12. Inspect/export schedules and booking details | Partial | Backend assignment/export and outcome reads exist; frontend integration is missing. Existing local export passes the validator. |

## Live system and build verification

The configured API base is `http://localhost:8000/api/v1`; Vite is served at `http://localhost:5173`.

- Both ports were listening during the audit.
- `GET /api/v1/health`: HTTP 200, `{"status":"ok","service":"axiom-api"}`.
- `GET /openapi.json`: HTTP 200; OpenAPI identifies `AXIOM API` version `0.1.0` and lists 9 paths (the existing routes only; no assistant/disruption routes).
- `GET /api/v1/datasets`: timed out. A separate SQLAlchemy read-only connection to the configured Supabase pooler also timed out (`ConnectionTimeout`, port 5432). No credentials were printed. Consequently dataset IDs, current schedules, assignments, exports and persisted booking outcomes could not be verified from the live database.
- `GET http://localhost:5173`: HTTP 200 and the AXIOM app HTML title was served. The desktop browser tool stopped before UI inspection because it could not determine the open Chrome URL with sufficient confidence. Visual navigation, browser console and network-panel checks therefore remain unverified.
- Backend tests: `python -m pytest -q` from `backend/` — **198 passed, 1 warning**. The warning is Starlette TestClient's deprecation use of `anyio.abc.BlockingPortal`.
- Frontend build: `npm run build` from `frontend/` — **passed** (`tsc -b` and Vite production build).
- Frontend test script: no test script is configured; `npm run` lists only `dev`, `build`, and `preview`.
- Official validator: `python validator.py --data data/cit_public.json --schedule exports/schedule.json` — **0 hard violations**. Reported soft penalty 145 (`S1=4, S2=107, S3=15, S4=6, S5=10, S6=3`) and exam soft penalty 15.
- `git diff --check`: run after the audit integration change; no whitespace errors.

## Safe integration work in this audit

`frontend/src/api/datasets.ts` now calls the already documented `GET /datasets` route with the actual response fields (`id`, `source_dataset_id`, `institute`, `created_at`). The dashboard reports API reachability separately from dataset request status and renders loading, empty, error, or returned dataset rows. It does not assume that health means the database is ready. No new endpoint or mock campus metrics were added.

## Remaining work before demonstration

### Dhruv — backend/API and integration coordination

1. Restore Supabase network/pooler connectivity, then verify dataset listing, dataset details, existing schedule assignment/export reads, and persisted booking outcomes with actual IDs.
2. Agree with Om/Niharika on a read-only active/latest schedule discovery contract; do not force generation from the dashboard merely to obtain an ID.
3. Add or approve a booking outcome retrieval contract for the UI; keep booking execution an explicit action and protect it from accidental reruns/overwrites.
4. Review the dashboard's live dataset list once the database is reachable.

### Om — frontend/dashboard

1. Complete browser-level review of dashboard and navigation once the browser tool is available; check responsive states, console and network errors.
2. Integrate persisted timetable data after dataset/schedule selection contracts are agreed, replacing the dev fixture only for the live path.
3. Implement rooms, bookings, examination and disruption views against approved response schemas; include loading/error/empty states.
4. Add frontend tests for API states and navigation if time allows.

### Niharika — timetable optimisation

1. Confirm solver ownership/provenance because the current solver commit is Dhruv-attributed despite the assigned role.
2. Confirm whether timetable repair is in scope; if so, specify disruption-to-repair input/output, constraints and atomic persistence behavior. Current solver generates schedules but does not repair them.

### Siddharth — AI/NLP and disruptions

1. Define and implement an assistant API/UI workflow for clarification and proposal review; it must not approve bookings itself.
2. Connect approved booking proposals to the booking-request intake flow once that backend contract exists.
3. Define validation/application semantics for disruption proposals and coordinate with Niharika on feasible repair; the current parser is review-only.
4. Demonstrate Hinglish coverage beyond existing unit examples if it is a hackathon requirement.

## Files changed by this audit

- `frontend/src/api/datasets.ts` (new)
- `frontend/src/pages/DashboardPage.tsx` (dataset-list integration)
- `docs/TEAM_INTEGRATION_AUDIT.md` (this report)

No starter-pack data, validator, migration, or Supabase rows were modified.
