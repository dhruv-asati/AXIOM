# AXIOM Dashboard Data Requirements

Owner for API contract alignment: Dhruv. Frontend consumer: Om.

This note records the information the Stage 3 dashboard needs. It does not define endpoints or JSON schemas. Map these needs to API routes and response types in `API_CONTRACTS.md` before the frontend consumes production data.

## Current documented coverage

- `GET /api/v1/health` has a documented health-only response and is used only to report API reachability. It does not provide dashboard data.
- `GET /api/v1/campus/rooms` is listed, but its filters and response schema are TODO.
- `GET /api/v1/bookings/requests` is listed, but filtering, pagination, and status fields are TODO.
- There is no documented upcoming-session listing, room-utilisation/occupancy source, or activity feed.

Until those contracts are agreed and documented, the dashboard must show unavailable/empty states and must not derive or fabricate statistics.

## Information needed by dashboard sections

- **Room KPI and utilisation:** the authoritative room population, the definition of an active/usable room, occupancy or booked capacity, reporting interval, aggregation/granularity, and how unavailable rooms or missing capacity are represented.
- **Booking KPIs and recent requests:** the meaning of active booking, pending request, and each displayed status; venue display information; requested start/end date and time; request submission time; timezone; ordering and pagination behavior.
- **Upcoming schedule:** course display identity, faculty display/privacy scope, room display identity, session start/end, timezone, and the selection window/order for upcoming sessions.
- **Recent activity:** event types that may be exposed, human-readable event details, event timestamp/timezone, ordering and pagination, and privacy rules for actor or person details. The UI will only render events returned by the backend.
- **Refresh and failure behavior:** freshness expectations, response update semantics, authentication requirements if any, and the agreed error envelope for unavailable or unauthorized data.

## Contract follow-up

Please add the approved route(s), query behavior, response schemas, status/error behavior, and privacy scope to `API_CONTRACTS.md`. The frontend will integrate only after those contracts are agreed; it will not guess response fields from the current placeholder routes.
