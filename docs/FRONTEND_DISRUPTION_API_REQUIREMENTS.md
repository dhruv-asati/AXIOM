# AXIOM Disruption Frontend API Requirements

Frontend owner: Om. AI/NLP owner: Siddharth. Timetable rescheduling/solver owner: Niharika. API, persistence, and workflow owner: Dhruv.

This document distinguishes repository-confirmed information from unresolved contracts. It does not establish new routes or JSON schemas. The frontend currently makes no disruption, assistant, solver, history, or decision API calls.

## Confirmed in the repository

- `VITE_API_URL` is the configured API base URL. The only implemented backend route found in `backend/app/api/routes.py` is `GET /api/v1/health`; it is not a disruption-data endpoint.
- `API_CONTRACTS.md` lists `POST /api/v1/timetables/{timetable_id}/disruptions`, but explicitly marks its input and repaired-schedule response TODO. It does not define persistence, status, or decision behavior.
- `API_CONTRACTS.md` lists `POST /api/v1/assistant/requests`, but natural-language input, parsed intent, clarification, and action proposal schemas are TODO.
- `examples/sample_disruption.json` is a practice disruption input for the solver/validator. It is not an AI parse, a solver proposal, a persisted request, or an approved disruption; the frontend does not load it as a record.
- `docs/TEAM_STRUCTURE.md` assigns NLP parsing to Siddharth; timetable optimisation and disruption repair to Niharika; and persistence/API coordination to Dhruv.

## Unresolved information for Siddharth — AI/NLP parsing

1. Whether parsing uses the assistant route or a separately agreed disruption-parse operation; supported route and authentication.
2. Request fields for free-text descriptions and any optional structured context. Required fields and input validation/error response.
3. Response fields for parsed category/type, affected locations/resources, time window, sessions, confidence scale/meaning, and clarification questions.
4. Whether parsing is synchronous or job-based; how unparseable or ambiguous input is represented; privacy/retention policy for submitted text.

## Unresolved information for Niharika — solver/rescheduling

1. How a parsed disruption and baseline timetable are passed to the solver, solver invocation route/job lifecycle, and schedule identity.
2. Proposal response shape: original/proposed session, room, date/time, affected groups/resources, and whether a proposal may contain multiple coordinated changes.
3. Diagnostics and feasibility fields, severity/meaning, and how solver warnings differ from hard constraints. Frontend will display only returned diagnostics and will not validate or rank options.
4. Whether proposals are advisory, solver-feasible, or otherwise qualified, and which text may be shown without implying approval.

## Unresolved information for Dhruv — persistence and workflow

1. Submission endpoint, request/response envelope, persistence identity, idempotency, authentication, and backend validation errors.
2. Whether parsed input/proposals are persisted together and which operation returns current workflow/history.
3. Defined workflow status values and transitions, including who can act and how status timestamps/explanations are represented.
4. Decision endpoint and supported actions/payloads. The frontend currently has no decision controls and will only add them when the operation is documented.
5. History list endpoint, filters/pagination/order, empty response, and error envelope.

Before integration, record approved contracts and concrete request/response examples in `API_CONTRACTS.md`. Current form validation checks only that the user entered a nonblank description. It does not submit or parse that description. No approvals, reschedules, availability, or disruption records are fabricated.
