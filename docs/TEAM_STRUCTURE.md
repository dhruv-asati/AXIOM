# Team structure

## Module ownership

- **Dhruv — backend, database, booking engine:** owns backend architecture, persistence, booking workflows, and API reliability.
- **Om — frontend and dashboard:** owns the React application, navigation, dashboard, and API-connected user flows.
- **Niharika — timetable generation and optimisation:** owns scheduling constraints, solver integration, timetable generation, and disruption repair.
- **Siddharth — AI assistant and NLP:** owns natural-language request understanding and the assistant experience/integration.

## Suggested folder ownership

| Owner | Primary folders | Shared interfaces |
|---|---|---|
| Dhruv | `backend/app/api/`, `core/`, `database/`, `models/`, `schemas/`, `services/bookings/` | API schemas, persistence and booking endpoints |
| Om | `frontend/src/` | API client types and agreed endpoint contracts |
| Niharika | `backend/app/services/timetable/`, relevant solver schemas | timetable input/output contract and OR-Tools integration |
| Siddharth | `backend/app/services/ai/` | assistant request/response contract and frontend integration |

`backend/app/services/disruptions/` is a shared integration area; Niharika owns scheduling repair behavior and Dhruv coordinates persistence/API integration. Coordinate before changing shared schemas. Keep official input files in `data/` unchanged and put app-generated results in `exports/`.

## Integration approach

1. Agree on request/response shapes in `API_CONTRACTS.md` before parallel endpoint work.
2. Keep domain rules in backend services and expose them through versioned `/api/v1` routes.
3. Keep frontend API calls in a dedicated client module and consume shared, documented JSON shapes.
4. Add migrations with model changes and coordinate schema ownership before merging.
5. Integrate early through small pull requests on the shared contracts; validate exported schedules with the official `validator.py`.
