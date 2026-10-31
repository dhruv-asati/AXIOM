# AXIOM Analytics Frontend API Requirements

Frontend consumer: Om. Analytics aggregation/API owner: Dhruv. Timetable and solver metric owner: Niharika.

This document separates the currently documented API from missing analytics contracts. The Analytics page does not call undocumented URLs, trigger schedule generation, or aggregate operational records in the browser.

## Confirmed API details

- API base URL is configured through `VITE_API_URL`.
- `GET /api/v1/health` is an HTTP liveness check; it does not confirm database readiness or return analytics.
- The backend currently implements only `GET /api/v1/health`, as confirmed by `backend/app/main.py` and `backend/app/api/routes.py`.
- `docs/API_CONTRACTS.md` lists potential campus, timetable, booking, and assistant routes as placeholders with unresolved schemas. It documents no analytics endpoint.
- No analytics response, aggregate, report export, or analytics-specific error/empty behavior is implemented or documented.
- The frontend does not calculate totals, trends, utilisation, or solver validity from operational records.

## Requirements for Dhruv — analytics API

1. Provide the approved analytics endpoint(s), ownership, authentication, and whether data is campus-wide, dataset-scoped, or schedule-scoped. Do not rely on the frontend to infer current dataset/schedule IDs.
2. Define each metric precisely: numerator/denominator, units, eligible room population, treatment of missing capacities and unavailable rooms, and whether occupancy is point-in-time or period-aggregated.
3. Define authoritative room utilisation values and supported breakdowns by building, room type, and room, including trend bucket/timezone and most/least utilised selection rules.
4. Define booking metrics and status vocabulary: volume windows, status distribution, department scope, pending/approved meanings, exclusions, and trend buckets.
5. Define timetable/examination metrics returned by the solver/backend. The frontend must not calculate solver performance, feasibility, completeness, or validity.
6. Specify date-range, building, department, room-type, and booking-status query parameters only where they are supported; include boundary/timezone and filter combination behavior.
7. Add concrete response schemas/examples, aggregation rules, precision/rounding, ordering, pagination if needed, and freshness/update behavior.
8. Define no-data/empty responses, validation errors, authorization failures, and service errors using the documented error envelope.
9. State whether report viewing/export is supported; define file format, content, filters applied, and download response behavior if available.

Until the analytics contracts are documented, the frontend intentionally exposes no operational filters or report downloads that cannot affect real data. The page shows clear unavailable states and does not render charts or placeholder metrics.
