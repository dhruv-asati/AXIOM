# AXIOM Frontend Demo Readiness

Last reviewed: 2026-10-31

## Start the application

Run the API from `backend/` and Vite from `frontend/` in separate terminals. Configure `DATABASE_URL` in `backend/.env` and `VITE_API_URL=http://localhost:8000/api/v1` in `frontend/.env.local`.

```powershell
cd backend
python -m uvicorn app.main:app --reload
```

```powershell
cd frontend
npm ci
npm run dev
```

The public landing page is `/`; sign-in is `/login`. After the auth migration is applied and role accounts are provisioned, sign-in uses the server-backed session. See [role access and demo account setup](ROLE_ACCESS.md). `/api/v1/health` is public, while all other API routes require an authenticated session.

## Current experience

- Public landing page: AXIOM capabilities, workflow, four roles, implementation labels, responsive navigation and sign-in paths.
- Login: username/email and password, accessible password visibility control, loading/error states, session restoration and role-based post-login destination.
- Admin workspace: campus overview, datasets, timetable generation/export, bookings, exams, disruption review, analytics and settings.
- Department coordinator: department-scoped timetable and changes, room inventory and department venue requests.
- Faculty: personal timetable, own availability/schedule-change requests and assistant parsing.
- Club representative: event room inventory, venue request creation, own status/rejection reasons and cancellation of eligible requests.
- Existing operational pages continue to use backend APIs; empty and unavailable states remain explicit. No public landing metrics or occupancy values are fabricated.

The timetable solver, booking engine and disruption repair logic remain backend-authoritative. The assistant parses requests into structured proposals; it does not make booking or approval decisions.

## Important setup and workflow limits

- The auth schema migration `31c4d6a2f809` is prepared but has not been applied to Supabase. The authenticated API cannot serve protected pages until an operator reviews and applies it.
- Demo accounts are not shipped. Configure exactly one strong account per role with the documented provisioning command after migration and dataset import, then share credentials privately.
- The current booking engine automatically evaluates requests. A separate manual department-lab approval state and a booking action that moves a class are not modeled in the current API.
- Analytics and real occupancy remain limited by the domain data sources. Occupancy telemetry is not available.
- Login throttling is in-memory per process and is appropriate only for the single-process demo deployment described in the role-access documentation.
- Notification and global search controls remain informational/presentation-only. Settings shows client API configuration and dataset context; it does not expose backend secrets.

## Verification

During the current implementation, the frontend production build (`npm run build`) and existing frontend test suite (`npm test`) passed. The test suite includes API cache tests and role-home/route-permission mapping tests. Browser-based visual smoke testing was not performed for this update.

Backend auth tests exercise public health, invalid and successful login for all four server-defined roles, session restoration, logout revocation, CSRF/Origin checks, admin-only actions, dataset/dept/faculty/club scope, request identity derivation, and self-approval protections. Full backend test results are recorded in the implementation report.
