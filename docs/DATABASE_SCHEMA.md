# Database schema

AXIOM stores uploaded dataset records separately from schedules generated for a dataset. All source records have UUID database primary keys and retain the upstream identifier as `source_id`; uniqueness is `(dataset_id, source_id)`, so two datasets can reuse an upstream identifier without colliding.

## Tables

| Table | Purpose / key relationships |
|---|---|
| `datasets` | Dataset metadata: source dataset identifier, institute, calendar, priority order and role category caps. Parent of imported records and schedules. |
| `faculty` | Source faculty fields, availability and preferences. Dataset-scoped source ID. |
| `courses` | Source course reference fields and hour counts. Dataset-scoped source ID. |
| `student_groups` | Source student group attributes. Dataset-scoped source ID. |
| `rooms` | Room details; features and allowed uses are JSON arrays. |
| `room_unavailability` | Day, periods and reason, linked to a room by `(dataset_id, room_source_id)`. |
| `timetable_sessions` | Source sessions with course and faculty source IDs, scheduling requirements and optional fixed slot. Composite foreign keys link course/faculty inside the same dataset. |
| `session_groups` | Many-to-many association from sessions to student groups. Both foreign keys include `dataset_id`; the three columns form the association primary key. |
| `booking_requests` | Source booking request fields; windows, room types, needs and mandatory groups remain JSON to preserve source shape. |
| `cancellations` | Cancellation time, actor and note; unique per request and linked by `(dataset_id, request_source_id)`. |
| `schedules` | A team's generated schedule for one dataset. Unique `(dataset_id, source_id)` and `(id, dataset_id)` supports child dataset-safe references. |
| `schedule_session_assignments` | A schedule's day, start period and room for each session. References schedule, session and room with dataset-scoped composite foreign keys. |
| `booking_outcomes` | Per-schedule decision/status and optional offered/approved slot and room for a booking request. |
| `examinations` | Source exam details; course and group source ID lists are retained as JSON arrays as in the source shape. |
| `exam_room_allocations` | Maps an examination to one of its allocated rooms, schedule, day and AM/PM session. |
| `schedule_overrides` | Per-schedule changed placement for a source session, including destination room and optional `displaced_by` request ID. |

## Dataset isolation and keys

Every dataset-owned source table has a `dataset_id` foreign key to `datasets.id`, a UUID primary key, and a unique `(dataset_id, source_id)` pair. References between source entities use composite foreign keys over `dataset_id` plus the source identifier. Schedule children also carry `dataset_id`; their `(schedule_id, dataset_id)` foreign key references the matching unique pair on `schedules`. PostgreSQL therefore rejects a child row that combines a parent from one dataset with a source record from another.

ORM navigation joins include dataset equality. For relationships where multiple parents share a child `dataset_id`, SQLAlchemy `foreign()` marks only the source or schedule identifier as synchronized. Callers set `dataset_id` explicitly; the database composite constraints validate it. Parent collections that are navigation-only are marked view-only.

Flexible source structures (calendar, preferences, availability, room features, booking windows and requirement lists, fixed slots) use SQLAlchemy JSON, which maps to PostgreSQL JSON. IDs and relationship keys remain relational columns.

## Tables and relationships overview

- `Dataset` owns faculty, courses, groups, rooms, sessions, booking requests, examinations and schedules.
- `TimetableSession` references one course and one faculty member, and connects to one or more groups through `session_groups`.
- `RoomUnavailability` references one room. A schedule has assignments, booking outcomes, exam allocations and overrides.
- Booking outcomes reference a booking request and may reference a room. Cancellations reference a booking request.
- Exam room allocations reference an examination and room. All schedule child references include the schedule's dataset ID.

## Alembic

Run commands from `backend/`. Configure `DATABASE_URL` in the environment or `backend/.env`; Alembic reads it through `app.core.config.settings`. `migrations/env.py` imports `app.models` before taking `Base.metadata`.

```powershell
# Create a revision after changing models
alembic revision --autogenerate -m "describe schema change"

# Review generated upgrade()/downgrade() operations before applying

# Apply only after review and explicit approval
alembic upgrade head

# Inspect known revisions
alembic history
alembic current
```

The initial revision is a schema artifact only. It has not been applied to Supabase.
