# AXIOM Frontend Demo Readiness

Last reviewed: 2026-10-31

## Start the application

Requirements: Node.js 20.19+ or 22.12+ and npm.

From `frontend/`:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set `VITE_API_URL` in `frontend/.env.local` to the backend API base URL (the example is `http://localhost:8000/api/v1`). Restart Vite after changing environment values. For a production build use `npm run build`, then `npm run preview` to serve `dist/` locally.

## Frontend modules

- Campus Overview dashboard
- Timetable Management
- Room Management and local venue request form
- Booking request tracking
- Examination Management
- Disruption Management
- Analytics & Reports
- AI Assistant interface
- Settings placeholder
- Shared responsive navigation and application shell

## Confirmed integrations

- `GET /api/v1/health` is implemented by the backend. The dashboard uses it only as a liveness check; success does not mean operational data is available.
- `VITE_API_URL` configures the API base URL.
- In Vite development only, the timetable can show a visibly labelled sample preview based on `examples/schedule.example.json`. It is not a real or solver-validated schedule.

## Pending integrations

The API contract file is `docs/API_CONTRACTS.md`. It currently describes domain routes as placeholders with unresolved request/response schemas. The backend currently implements only the health route. Consequently:

- Room inventory, room availability, booking submission/tracking, and booking decisions are unavailable.
- Timetable retrieval and solver diagnostics are unavailable outside the development preview.
- Examination schedules, allocations, and solver conflicts are unavailable.
- Disruption parsing, repair proposals, workflow, and history are unavailable.
- Analytics metrics, filters, charts, and report exports are unavailable.
- AI understanding, answers, clarification, actions, and conversation history are unavailable. Assistant drafts remain local and are not sent.
- Dashboard operational metrics, booking activity, schedule activity, and recent activity are unavailable.

Per-module contract needs are documented in `docs/FRONTEND_*_API_REQUIREMENTS.md`. Backend, solver, and AI services remain authoritative; the frontend does not synthesize operational records or decisions.

## Suggested demonstration flow

1. Open Campus Overview and explain that the health indicator is only API liveness; operational metrics show as unavailable until contracts and services are ready.
2. Open Timetable Management. In a development server, explain that visible sample placements are labelled preview data; production has no timetable records until retrieval is implemented.
3. Open Room Management and Bookings. Show the inventory/request UI and explain that the form validates locally but does not submit, and the backend must confirm availability and decisions.
4. Open Examination Management and Disruption Management. Show the schedule and reporting states; do not describe sample input files as solver output or claim that a schedule was repaired.
5. Open Analytics & Reports. Explain that charts and exports wait for authoritative aggregate/report contracts.
6. Open AI Assistant. Demonstrate prompt suggestions filling a draft only; no message is transmitted or answered.
7. Resize the browser and show the responsive navigation and module layouts.

## Known limitations

- Settings remains a placeholder.
- Top-bar search is presentation-only and is not connected to workspace data.
- Notification and profile controls show local UI only; there is no notification or authentication service.
- There is no configured frontend lint or test script.
- Error branches that depend on API failures cannot be exercised for modules whose loaders intentionally make no domain request.
- The dashboard health check can fail when the backend is not running; this does not block frontend navigation.

## Verification record

- Production build: verified with `npm run build` during Stage 10.
- Route smoke test: `/`, all nine named modules/preferences routes, and an unknown route were opened in browser automation. Root redirected to `/dashboard`; unknown route rendered the 404 page.
- Responsive smoke test: all named module routes were inspected at 375, 430, 768, 1024, and 1440 CSS pixels; document scroll width did not exceed the viewport's available document width. The mobile navigation opened, navigated to Analytics, and closed.
- Nested routes were loaded directly in the Vite development server. The production preview was opened and refreshed at `/timetable`; the route remained available and showed the unavailable integration state without development preview sessions.
- The timetable details dialog was opened with preview data and verified for Escape close, Tab containment, and focus return to its invoking session. Empty booking and disruption forms showed their local validation messages. Notification/profile UI and text entry in global search responded; search is presentation-only.
- No browser console errors remained on the final route check. React Router future-flag warnings seen during the initial check were removed by opting into the supported v7 flags; routes were rechecked.
- Automated accessibility/contrast scanning and comprehensive visual review were not performed. Room and examination detail dialogs could not be opened because no real records are available. Network/API failure branches for modules that make no domain request could not be triggered.
- Lint and tests: unavailable; no scripts are configured.
