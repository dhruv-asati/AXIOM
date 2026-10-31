# API contracts (initial placeholders)

Base path: `/api/v1`. These contracts are intentionally placeholders; owners should agree on exact fields, errors, and status codes before implementing each endpoint. JSON examples are illustrative only.

## System

- `GET /health` — implemented foundation check. Returns `{"status":"ok","service":"axiom-api"}`.

## Dataset and campus reference data

Owner: Dhruv (API/persistence), Niharika (solver inputs).

- `GET /campus/rooms` — TODO: filters and room response schema.
- `GET /campus/faculty` — TODO: response schema and privacy scope.
- `GET /campus/groups` — TODO: response schema.

## Timetables

Owner: Niharika.

- `POST /timetables/generate` — TODO: generation request, job behavior, and result schema.
- `GET /timetables/{timetable_id}` — TODO: retrieval and status schema.
- `POST /timetables/{timetable_id}/disruptions` — TODO: disruption input and repaired schedule response.

## Venue bookings

Owner: Dhruv.

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
