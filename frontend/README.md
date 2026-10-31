# AXIOM Frontend

React, TypeScript, and Vite frontend for the AXIOM campus operations workspace.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Local setup

From this directory (`frontend/`):

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Vite prints the local URL (normally `http://localhost:5173`). The frontend reads `VITE_API_URL` as the API base URL; `.env.example` points to `http://localhost:8000/api/v1`. Vite environment changes require restarting the dev server.

## Available scripts

- `npm run dev` — start the development server.
- `npm run build` — run TypeScript project checks and create a production build in `dist/`.
- `npm run preview` — serve the production build locally after building.

There are currently no configured lint or test scripts.

## Data and integrations

The only implemented backend route is `GET /api/v1/health`. Operational pages show unavailable states until their backend/solver/AI contracts are implemented and documented in `../docs/API_CONTRACTS.md`. Timetable sample placements are development-only and visibly labelled; production builds do not load them. See `../docs/FRONTEND_DEMO_READINESS.md` for module status and a verified demo flow.
