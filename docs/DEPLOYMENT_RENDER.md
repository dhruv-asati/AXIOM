# Render deployment preparation

AXIOM is configured as a single Docker web service: Vite builds the React SPA, and FastAPI serves that build and the `/api/v1` API from one origin. Supabase PostgreSQL remains external. The public app is deployed at `https://axiom-5uf0.onrender.com`; repository documentation and local changes do not themselves deploy code or alter Render settings. Migrations are not run at startup.

## Local Docker verification

From the repository root, with Docker installed and `DATABASE_URL` set in the current shell from a trusted local secret store:

```powershell
docker build -t axiom:local .
docker run --rm -p 10000:10000 -e PORT=10000 -e ENVIRONMENT=production -e DATABASE_URL="$env:DATABASE_URL" axiom:local
```

Then verify `http://localhost:10000/`, `http://localhost:10000/dashboard`, `http://localhost:10000/api/v1/health`, and `http://localhost:10000/assets/<asset-name-from-the-built-index>`. The API health route is liveness only and does not invoke the solver or database. `GET /api/v1/ready` checks the database; use it only when the supplied URL points to a safe test target.

The container starts Uvicorn without reload, binds to `0.0.0.0`, reads `PORT` (default `10000` for local use), and imports `app.main` from `/app/backend`. It serves the Vite build from `/app/frontend/dist`. Missing API paths remain JSON 404 responses; unknown frontend routes receive the SPA entry point. In local development, the production build is optional: run Vite and FastAPI separately as documented in the root README.

## Render configuration

The root `render.yaml` defines exactly one Docker web service with the repository root as its build context and `/api/v1/health` as its health-check path. When creating/syncing the Blueprint, Render prompts for `DATABASE_URL` because its value is marked `sync: false`. Supply the existing Supabase URL through Render's secret environment settings; never put it in this repository or a `VITE_` variable.

Required Render values:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Existing Supabase PostgreSQL connection using `postgresql+psycopg://...`; configure SSL, preferably `sslmode=require`. |
| `ENVIRONMENT` | Set to `production`; production settings reject a missing database URL. |
| `PORT` | Assigned by Render and consumed by the container start command; do not hardcode the future public URL. |

`CORS_ORIGINS` is not required for the same-origin UI/API arrangement. If cross-origin clients are added, set it to their exact allowed origins. `VITE_API_URL` may be omitted in production: the frontend defaults to `/api/v1` in production and retains `http://localhost:8000/api/v1` in development. If supplied at Vite build time, it is public client configuration and must not contain secrets.

The Docker ignore rules exclude local environment files, `.git`, local Python/Node environments, caches and local build output. The image explicitly includes `data/`, which the dataset import API reads; uploads themselves use temporary storage and are not persisted to the container filesystem.

## Supabase and migrations

The API uses Psycopg 3 and a small per-process SQLAlchemy pool (`pool_size=2`, `max_overflow=1`) with connection pre-ping and recycling. Keep the Supabase URL in Render's environment and use SSL. Do not print the URL in logs or pass it to the frontend.

Migrations remain a separate, manual operation. Before any migration, verify the target URL in the operator's secure environment, check the current revision, review the SQL, and take/verify a backup. From `backend/`:

```powershell
python -m alembic -c alembic.ini current
python -m alembic -c alembic.ini upgrade head --sql
# Only in a separately approved maintenance step, after reviewing target and SQL:
python -m alembic -c alembic.ini upgrade head
```

AXIOM does not run migrations automatically at startup, and `render.yaml` has no pre-deploy migration command. Do not use a downgrade as an automatic rollback; the initial migration's downgrade drops the application tables.

## Authentication and authorization

The API now has four server-defined roles, database-backed opaque sessions, password hashing, `HttpOnly` cookies, Origin/CSRF checks, a per-process login rate limiter, role checks and dataset/department/faculty/club scoping. `/api/v1/health` and `/api/v1/ready` are public system checks; protected application routes retain session, CSRF, role and data-scope checks. See [role access and demo account setup](ROLE_ACCESS.md).

The project operator reports that auth/booking migrations have been applied and the four demo users are provisioned. This repository audit did not connect to Supabase to verify its revision or inspect accounts. Demo usernames and roles are documented in the README; passwords remain private. Do not run the account provisioning command for the existing demo. Never put account credentials in the frontend build. `GET /api/v1/ready` is public in the local source after the readiness fix and performs `SELECT 1`; the previously audited deployed version returned 401, so the deployed response remains unverified until a separately authorized deployment updates it.

## Render Free considerations

Free web services have limited CPU and memory, spin down after inactivity, and use an ephemeral filesystem. Static assets and temporary upload handling work with ephemeral storage; durable project records remain in Supabase. Users should expect cold starts after idle periods.

The CP-SAT solver retains its existing one-worker deterministic configuration and request limit (up to 600 seconds). This preparation does not cap solver memory or claim that all datasets fit within Free instance memory. Validate representative datasets on the selected plan before relying on timetable generation; move solver work to a better-sized worker/service if observed memory or request duration is unsuitable. Do not reduce hard constraints to fit the plan.

## Manual deployment sequence

1. Review this diff and keep production secrets out of Git and Vite variables.
2. Build and run the Docker image locally; verify the UI, a refreshed `/dashboard`, an emitted static asset, `/api/v1/health`, and JSON behavior for a missing API route.
3. If a future schema migration is required, independently confirm the current Supabase revision and review the migration SQL and backup before any separately authorized apply. No migration is part of this readiness audit.
4. Do not reprovision existing judge accounts. Verify each login and role privately through the live UI when authorized.
5. A future code release requires the team's normal separate deployment approval. After it, verify health, readiness and authenticated role workflows. This task has not deployed or restarted Render.
