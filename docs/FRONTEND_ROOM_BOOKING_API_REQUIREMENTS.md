# AXIOM Room and Booking Frontend API Requirements

Frontend owner: Om. API and booking engine owner: Dhruv.

This document records missing contract decisions. It does not define endpoint payloads or invent a response schema. The frontend currently calls none of the listed room or booking routes until their fields and behavior are agreed in `API_CONTRACTS.md`.

## What is documented today

- `GET /api/v1/campus/rooms` is listed in `API_CONTRACTS.md`; filters and response schema are TODO.
- `POST /api/v1/bookings/requests` is listed; request fields and validation error contract are TODO.
- `GET /api/v1/bookings/requests` is listed; filters, pagination, and status fields are TODO.
- `POST /api/v1/bookings/requests/{request_id}/decision` is listed; decision payload and priority behavior are TODO. The frontend does not call it or implement decisions.
- There is no documented room availability contract, room details/related bookings contract, or agreed booking status vocabulary.
- `GET /api/v1/health` is only a health check and is not used as inventory or booking data.

## Decisions needed for room inventory

1. Room identifier, display name, building, floor, room type vocabulary, capacity, equipment, accessibility properties, and fields that may be absent.
2. Availability representation and its time range/time zone. Availability must be confirmed by the booking service and must not be derived in the browser.
3. Filter and search query semantics, pagination, ordering, empty behavior, authentication, and error envelope.
4. Whether room details or related bookings are included in the inventory response or need a separately documented retrieval route.

## Decisions needed for venue booking

1. Required request fields and approved values/limits, including venue identity, date/time format and timezone, event purpose, expected attendance, and additional requirements.
2. Requester identity source and whether requester details are client-provided or derived from authentication.
3. Validation response/error fields for invalid date/time, capacity, unavailable rooms, and booking conflicts. Availability, conflict detection, priority and alternative venues remain backend-owned.
4. The response and lifecycle fields for a created request, and whether creation is synchronous or job-based.
5. The complete status vocabulary, meaning, display guidance, and approved backend-provided explanation fields for request tracking.
6. List filters, pagination, sort order, refresh expectations, authentication, and privacy scope.

Before production integration, add approved request/response examples, error behavior, status definitions, and ownership notes to `API_CONTRACTS.md`. The current form performs only basic client-side field, date, time-order, integer-attendance, and known-capacity checks. It does not submit a request, infer availability, detect conflicts, set priority, suggest another venue, or decide approval.
