# Deterministic booking engine

## Inputs and outputs

The engine evaluates booking requests for one `dataset_id` against one `schedule_id` from that same dataset. The schedule contains the regular timetable assignments used for room and student-group conflict checks. The engine does not create a schedule or generate exam dates. A run writes one `BookingOutcome` per request and schedule; reruns update these rows instead of adding duplicates.

## Decision rules

1. Requests are ordered by `Dataset.priority_order` after applying `Dataset.role_category_cap`. A request cannot claim a better category than its role cap; for example, a club request claiming `institute_event` is evaluated as `club_event`.
2. Equal effective categories are ordered by `submitted_at` (normalized to UTC), then source ID for a stable final tie break. The supplied order places exams first, regular sessions second, followed by institute, guest lecture, department, and club events. Regular timetable assignments occupy resources before booking requests are considered.
3. Requests with cancellation records are rejected and reserve no resources.
4. Room candidates must allow events, match one of the requested room types, meet the attendance capacity and include every requested need. `accessible` is satisfied by either the room's accessible flag or an `accessible` feature.
5. A candidate must fit entirely within a requested window. An exact-duration window has a single possible start and is therefore treated as a fixed slot. Candidate windows retain their supplied preference order; rooms prefer `requested_room`, then source ID order.
6. The engine rejects times blocked by room unavailability, a regular session in the selected schedule, an earlier approved request, or a regular session/earlier approval for a mandatory student group.
7. Every decision stores `approved` or `rejected` plus a human-readable reason. Requests with no outcome for a schedule are `pending` in the read API.

## Transaction and isolation

Every lookup and write is filtered by dataset; schedule lookups also require matching `dataset_id`. PostgreSQL composite foreign keys provide a second layer of dataset integrity. The run locks the dataset and schedule rows, serializes competing decisions for the same dataset, and writes the whole batch in a transaction. If called inside an existing SQLAlchemy transaction, it uses a savepoint. No AI/LLM calls are used in decision-making.

## API

- `POST /api/v1/datasets/{dataset_id}/schedules/{schedule_id}/bookings/run`
- `GET /api/v1/datasets/{dataset_id}/schedules/{schedule_id}/booking-outcomes`

## Known boundary

Booking requests in the source schema have `windows` but no standalone fixed-slot property. The engine therefore respects a fixed slot when the supplied window has exactly the requested duration. Exam allocations are represented separately and the source schedule format places exams in exam week rather than the fest-week booking windows; the engine uses the selected schedule's regular timetable assignments as booking conflicts.
