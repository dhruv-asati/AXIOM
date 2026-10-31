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

`npm test` runs the frontend's Node test suite for the API request cache. `npm run build` performs TypeScript project checks before creating the production bundle.

## Data and integrations

The landing page and sign-in screen are public. The workspace restores its server session on refresh and displays navigation by authenticated role. API requests use same-origin cookies and attach the in-memory CSRF token on state-changing calls. Operational pages call the corresponding `/api/v1` routes and retain explicit empty/error states; see `../docs/API_CONTRACTS.md` for the service contracts.
