# AXIOM AI Assistant Frontend API Requirements

Frontend owner: Om. AI/NLP and intent owner: Siddharth. Authoritative operations and persistence owner: Dhruv. Scheduling/optimisation owner: Niharika.

This document separates repository-confirmed information from open contract decisions. The frontend currently makes no assistant request and does not infer or simulate AI output.

## Confirmed in the repository

- `VITE_API_URL` is the configured base URL for the backend.
- `API_CONTRACTS.md` lists `POST /api/v1/assistant/requests`, owned by Siddharth, but explicitly leaves natural-language input, parsed intent, clarification, and action proposal schemas TODO.
- The backend route implementation currently contains only `GET /api/v1/health`. No assistant route is implemented.
- `backend/app/services/ai/` currently contains only its package initializer; there is no AI/NLP implementation to integrate.
- `docs/TEAM_STRUCTURE.md` assigns NLP and assistant behavior to Siddharth, persistence and authoritative backend operations to Dhruv, and timetable optimisation to Niharika.
- No conversation history route or persistence contract is documented.

## Unresolved requirements for Siddharth — request and AI response

1. Confirm the assistant route and whether the request is synchronous or asynchronous. Document authentication, timeout, and cancellation expectations.
2. Define request fields, including message text, optional context, and whether a conversation/session identifier is accepted. State size/format constraints and privacy/retention behavior.
3. Define response fields for user-facing text, intent, entities (including field names/types/normalization), and the distinction between informational answers and proposed operations.
4. Define clarification flow: how a required clarification is represented, how the user answers, how prior context is referenced, and whether a new turn uses the same conversation/session identifier.
5. Define model/service unavailable, invalid input, safety/refusal, ambiguity, timeout, and rate-limit responses. Clarify any confidence scale and meaning before exposing it.

## Unresolved requirements for Dhruv — authoritative actions and persistence

1. For each structured booking or disruption proposal, identify the backend operation that can validate/submit it, its exact request/response schema, and any user confirmation required before execution.
2. Define how booking acceptance, venue availability, disruption persistence, and schedule changes are confirmed. An AI proposal alone must never be treated as completion.
3. Define operation identifiers, idempotency, status lifecycle, validation/error envelope, and how the frontend retrieves the authoritative result.
4. Clarify whether conversation records or operation history are persisted and, if so, the supported list/retrieval/deletion behavior and access/privacy scope.

## Unresolved requirements for Niharika — scheduling assistance

1. Define any solver-backed scheduling context available to the assistant, how a schedule is identified, and whether the AI response can include an advisory proposal or only a reference to a solver result.
2. Define proposal fields and solver diagnostics if proposals can include timetable/disruption changes. The frontend will display solver/backend fields only and will not calculate or approve alternatives.

Before integration, add concrete request/response examples, errors, confirmation rules, and history behavior to `API_CONTRACTS.md`. The current assistant UI keeps only the editable draft in in-memory page state; suggested prompts only fill the draft. Clicking Send while unavailable does not transmit or append a conversation message.
