# Stage 13C — Performance and Loading Report

**Scope:** read-only performance work against the imported CIT dataset and schedule. No database schema, migration, dataset, booking outcome, schedule, or export was changed.

## Baseline

Before code changes, endpoint timings were recorded with FastAPI `TestClient` and SQLAlchemy `before_cursor_execute` / `after_cursor_execute` listeners while reading the live CIT records. These are in-process API timings; they exclude browser rendering and should not be treated as user-network timings. The baseline used the median of two endpoint requests. The browser Network panel and React Profiler were not exposed by the connected browser controls, so request counts below were also checked against the frontend fetch call sites.

| Endpoint | Baseline median | SQL statements | Summed SQL execution | Payload |
|---|---:|---:|---:|---:|
| Dashboard summary | 6,196 ms | 25 | 5,901 ms | 2,587 B |
| Schedule list | 2,361 ms | 7 | 1,973 ms | 238 B |
| Schedule history | 2,442 ms | 7 | 2,487 ms | 238 B |
| Assignments | 3,074 ms | 11 | 2,573 ms | 66,581 B |
| Rooms | 3,010 ms | 6 | 2,586 ms | 8,620 B |
| Examinations | 4,435 ms | 6 | 4,533 ms | 17,053 B |
| Bookings | 4,000 ms | 5 | 3,456 ms | 16,523 B |

The dashboard made five API requests on first visit: the shared dataset list, an API health check, a second dataset-list refresh, the summary, and booking activity. Dataset and summary reads were repeated on page navigation.

## Changes and measured results

- Reworked dashboard summary counts into one SQL statement with scalar count subqueries, aggregated booking outcome counts, and joined the upcoming schedule preview into one query. Room utilisation now reads only room fields it needs and sums assigned periods in SQL.
- Batched schedule-list statistics across all schedules. The query count no longer grows with schedule history; a test seeds five schedules and asserts the list stays within three SQL statements.
- Replaced the assignment endpoint's separate entity maps with one dataset-scoped join across assignments, sessions, courses, faculty, rooms, session groups, and groups.
- Joined examination allocations to rooms in one query and joined room assignments to sessions for room utilisation.
- Loaded disruption schedules and proposals concurrently. Removed the dashboard's separate health call and repeated dataset refresh; summary and booking activity now load together.
- Added a small GET response cache with in-flight deduplication, per-resource freshness windows, write invalidation, and revision protection so an older in-flight read cannot refill the cache after a write.
- Split route pages with `React.lazy`, keeping the application shell available while page chunks load. The initial JavaScript entry chunk is **271.97 KB / 85.00 KB gzip**, compared with the previous single application bundle of **329.88 KB / 97.35 KB gzip**. Route chunks load on demand; this is an initial-payload comparison, not a claim that the sum of every route chunk is smaller.

| Endpoint | Baseline SQL | Latest SQL | Latest observed elapsed | Notes |
|---|---:|---:|---:|---|
| Dashboard summary | 25 | 11 | 5,963 ms median of 3; one later sample 10,213 ms | One three-sample run summed 2,963 ms SQL. A later run summed 4,905 ms, showing substantial hosted-database variance. |
| Schedule list | 7 | 3 | 2,219 ms measured before the final batching pass | Query budget is constant across five schedules in the local test. |
| Schedule history | 7 | 3 | 1,705 ms in the three-sample run before the final batching pass | Same batched summary path as the schedule list; final query-budget test caps this at three statements. |
| Assignments | 11 | 5 | 2,011 ms, single sample | Joined dataset records; payload remains 66,581 B. |
| Rooms | 6 | 5 | 1,781 ms, single sample | Removed the separate session lookup. |
| Examinations | 6 | 5 | 1,633 ms, single sample | Room details now come from the allocation join. |

The summary's statement count fell by **56%** and its first post-change three-sample SQL time was about **50% lower** than baseline. Its elapsed time did not consistently reach the 1.5-second target; one later run was slower than baseline. Supabase round-trip time remains the main bottleneck, so the report does not claim a consistent wall-clock improvement for the dashboard summary.

After the duplicate health and catalog calls were removed, the initial dashboard path is three requests: dataset catalog, dashboard summary, and booking activity. These request counts are derived from the code path; they were not captured from Chrome's Network panel.

## Cache behavior

| Resource | Fresh window |
|---|---:|
| Dataset catalog | 60 s |
| Dataset metadata | 5 min |
| Schedule list/history | 15 s |
| Assignments | 2 min |
| Examination allocations | 60 s |
| Room results | 15 s |
| Dashboard summary | 10 s |
| Booking requests/outcomes | 2 s |
| Disruption proposals | 5 s |

Successful writes to a dataset invalidate its cached dataset resources. Dataset import invalidates the whole catalog. Manual refresh actions invalidate the requested resource. The browser cache is per tab, so another user's writes can remain visible only until the short freshness window expires.

## Skeleton loading

Reusable components are in `frontend/src/components/ui/Skeleton.tsx` and `Skeleton.css`: base skeleton, text lines, cards, tables, charts, timetable, page wrapper, and stat groups. They use muted AXIOM surfaces, restrained shimmer, stable content dimensions, and disable animation for `prefers-reduced-motion`.

Skeleton loading is applied to Dashboard, Datasets, Timetable, Rooms, Bookings, Examinations, Disruptions, Assistant parsing, Analytics, Settings' asynchronous catalog fields, and lazy route loading. Existing empty and error states remain visible when loading ends; no sample metrics were added. Dataset-scoped pages hide prior-dataset results while the new selection loads, and abort obsolete requests where their API calls support cancellation. Refreshes keep same-dataset results visible and show a small refresh status.

In the running browser, the Rooms page displayed its skeleton while the live room read was pending, then replaced it with the 27 actual room records. This verified the loading-to-data transition against the real read API. A controlled artificial network-delay/error interception and a React Profiler recording were not available in the browser interface; error and empty rendering paths were checked in the page conditions and existing backend responses. No failure or empty dataset was injected into the live database.

## Verification

- `backend/.venv/Scripts/python.exe -m pytest tests -q` — **212 passed**, one existing Starlette/AnyIO deprecation warning.
- `frontend/npm test` — **5 passed**. Covers concurrent request deduplication, cache expiration, write invalidation, preventing stale in-flight responses from repopulating the cache, and retry after a failed read.
- `frontend/npm run build` — **passed**; includes `tsc -b` and Vite production build.
- Summary, schedule, assignment, room, examination, and booking GETs returned **200** during read-only measurements.
- No migrations were generated or applied; no database writes were performed for these measurements.

## Remaining bottlenecks

- A fresh dashboard summary still makes 11 sequential SQL statements across related calculations and is sensitive to Supabase latency. Further improvement may require a read model/materialized summary or carefully bounded concurrent reads; neither was introduced here because either would change operational complexity or consistency behavior.
- Assignments remain a 66.6 KB response, required by the full timetable UI. Pagination was not added because the UI currently expects the complete schedule to build its filters and weekly grid.
- Browser Network/Performance traces, React Profiler data, and controlled delay/failure injection remain outstanding for a dedicated browser-testing pass.
