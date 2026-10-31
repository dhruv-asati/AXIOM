# AXIOM authentication, roles and demo accounts

AXIOM has four server-defined roles. The browser never submits or selects the role used for authorization; the role and account context come from the authenticated user row.

| Role | Current workspace access | Server-enforced scope |
| --- | --- | --- |
| `admin` | Overview, datasets, timetable generation and export, rooms, bookings, exams, disruption review/approval, analytics, settings, priority configuration and demo reset | Campus-wide. The user account has no dataset or department context. |
| `department_coordinator` | Department timetable, room inventory, department bookings, department lab approvals, exams, disruption requests and assistant | Assigned dataset and department. Session changes, availability requests, booking requests, lab ownership and lab decisions are checked against the department. |
| `faculty` | Personal timetable, own availability/schedule-change requests and assistant | Assigned dataset and faculty source ID. Assignment queries are forced to the signed-in faculty ID; change requests are checked against that faculty member. |
| `club_representative` | Room inventory and own venue booking requests/status/cancellation | Assigned dataset and club ID. Only requests created by the signed-in user can be read or cancelled. |

The Admin overview remains admin-only because its aggregates are campus-wide. Department coordinators enter through the department-filtered timetable. Department lab approvals are a separate human decision recorded as a `BookingOutcome` with actor, timestamp and source; they require an unassigned pending request from the same department and a room explicitly assigned to that department. The coordinator cannot decide their own request. Admin class-move booking proposals are also separate from disruption proposals: a CP-SAT repair clears the selected room and slot, an Admin reviews the before/after assignments, and approval rechecks the request, room, repair fingerprint and booking constraints before creating a derived schedule and booking outcome. The baseline schedule is preserved. A request creator cannot approve either workflow. The deterministic booking engine preserves human decisions on later reruns.

Room ownership is not present in the starter dataset. It is stored as optional `rooms.department` metadata and must be assigned by an Admin in Room Management before department lab approval is available. The import service reads this value when a dataset supplies it and preserves an Admin assignment when the source does not include it.

## Session protections

- Passwords are stored as versioned scrypt hashes using the Python standard library (`N=32768`, `r=8`, `p=1`, 16-byte random salt, 32-byte output); plaintext passwords are never returned.
- The API issues an opaque random session cookie named `axiom_session`. Only its SHA-256 digest is stored in `auth_sessions`.
- The cookie is `HttpOnly`, `SameSite=Strict`, path `/`, and `Secure` when `ENVIRONMENT=production`. Sessions expire after eight hours. Logout revokes the server-side row.
- Mutating protected API requests require same-origin/allowed Origin and an `X-CSRF-Token`. The UI keeps that token in memory and sends it with mutating requests.
- Login attempts are limited to ten per client address in five minutes. This limiter is in process memory, so it resets on restart and does not coordinate across multiple workers; retain one worker for this demo or add shared rate-limit storage before scaling.
- `/api/v1/health` is public for platform health checks. Other API routes require an authenticated session, with role and dataset checks at the API layer.
- Repair proposal approval/rejection rejects the creator as decider in the service and the database has a matching check constraint.

## Configure the four demo accounts

There are no default usernames or passwords. The project deliberately does not ship credentials. A team operator should create four unique, random passwords (at least 14 characters), keep them in a password manager, and pass them through the protected `AXIOM_DEMO_ACCOUNTS_JSON` environment variable. The provisioning command hashes them and prints no credentials. It creates missing accounts and validates context. Re-running with the same usernames, roles, context and passwords is a no-op; a conflict with an existing account's role/context/password fails without overwriting it. Password rotation must be handled separately by an explicit operator process.

- The admin needs only `username`, `password`, and `role: "admin"`.
- The department coordinator also needs an imported `dataset_source_id` and a `department` present in that dataset.
- The faculty account needs an imported `dataset_source_id` and a `faculty_source_id`; its department is read from that faculty row.
- The club representative needs an imported `dataset_source_id` and a non-empty `club_id`. The current schema has no clubs source table, so the club ID is an account-scoping label.

Example shape only; replace every placeholder locally and never commit populated JSON:

```json
[
  {"username":"axiom-admin@example.invalid","password":"<unique secret>","role":"admin"},
  {"username":"axiom-coordinator@example.invalid","password":"<unique secret>","role":"department_coordinator","dataset_source_id":"<imported-dataset-source-id>","department":"<dataset department>"},
  {"username":"axiom-faculty@example.invalid","password":"<unique secret>","role":"faculty","dataset_source_id":"<imported-dataset-source-id>","faculty_source_id":"<faculty source ID>"},
  {"username":"axiom-club@example.invalid","password":"<unique secret>","role":"club_representative","dataset_source_id":"<imported-dataset-source-id>","club_id":"<club identifier>"}
]
```

### Local provisioning

First set `DATABASE_URL` in `backend/.env` and make sure the dataset is already imported. Review and intentionally apply migrations through head, including `31c4d6a2f809` and `4a92d6c1e7b0` (see below), then, from `backend/`, set the JSON value in the current PowerShell process and run the command:

```powershell
$env:AXIOM_DEMO_ACCOUNTS_JSON = Get-Content -Raw .\demo-accounts.local.json
python -m app.commands.provision_demo_accounts
Remove-Item Env:\AXIOM_DEMO_ACCOUNTS_JSON
```

Keep `demo-accounts.local.json` outside Git; `.gitignore` excludes local env/secret files. After provisioning, share the four usernames and initial passwords with judges through the team password manager or another private channel. Ask judges to change passwords if password rotation is available in the deployment environment (self-service password change is not yet implemented).

### Render preparation

After the migration has been reviewed and intentionally applied, add `AXIOM_DEMO_ACCOUNTS_JSON` as a **secret environment variable** in the Render service settings using the four-account JSON above. In the Render Shell, from `/app/backend`, run:

```sh
python -m app.commands.provision_demo_accounts
```

The command uses the existing `DATABASE_URL` and imported dataset. It does not run at application startup. Keep the secret variable protected and remove it after provisioning. Re-running cannot reset an existing password; a mismatched password fails safely. Deliver credentials to judges privately. No account credentials or live database modifications were created as part of this implementation.

## Migration commands

Authentication requires migration `31c4d6a2f809_add_role_authentication.py`. The approval workflows require the following migration after it: `4a92d6c1e7b0_add_booking_approval_workflows.py`. From `backend/`:

```powershell
python -m alembic -c alembic.ini history
python -m alembic -c alembic.ini upgrade head --sql
# Review the SQL and DATABASE_URL carefully before an explicitly approved live apply:
python -m alembic -c alembic.ini upgrade head
```

The auth migration adds `users`, `auth_sessions`, nullable actor references, indexes, role-context checks, same-dataset faculty linkage and a no-self-approval check. The approval migration adds nullable room department ownership, decision timestamp/source on booking outcomes, and dataset-scoped class-move approval records linked to requests, schedules and solver repair proposals. Downgrading these revisions removes accounts, sessions, room ownership assignments, human booking decisions, and proposal records created after application; back up before an intentional rollback. Both migrations remain unapplied by this task. Review offline SQL before an intentional live apply.
