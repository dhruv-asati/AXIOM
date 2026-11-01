# Third-party software and asset notices

The dependency manifests and lockfiles are the authoritative inventory of runtime and build dependencies. Direct dependency license labels below were checked from the installed package metadata or package manifests; transitive packages are not exhaustively listed here. Review the current lockfiles and each distributed dependency's license before redistribution.

## Direct application dependencies

| Package | Use | License reported by package metadata |
| --- | --- | --- |
| React, React DOM, React Router | Frontend rendering and navigation | MIT |
| Vite, `@vitejs/plugin-react` | Frontend build and development server | MIT |
| TypeScript | Frontend type checking | Apache-2.0 |
| GSAP | UI animation | GSAP Standard “no charge” license; see [official terms](https://gsap.com/standard-license/) |
| Lucide React | Interface icons | ISC |
| FastAPI | HTTP API framework | MIT |
| SQLAlchemy, Alembic | ORM and schema migrations | MIT |
| Pydantic / pydantic-settings | Validation and settings | MIT |
| Psycopg 3 | PostgreSQL driver | LGPL-3.0-only, per installed distribution metadata; verify applicable distribution terms |
| Uvicorn | ASGI server | BSD-3-Clause |
| Google OR-Tools | CP-SAT scheduling solver | Apache-2.0 |
| python-multipart, tzdata | Form upload parsing and timezone data | Apache-2.0 |

The exact dependency sets are recorded in `frontend/package-lock.json` and `backend/requirements.txt`. FastAPI's installed distribution did not provide a license string in its metadata; its upstream project is MIT-licensed. The table is a direct-dependency summary, not a legal review or complete Software Bill of Materials.

## Organizer materials and external services

The repository includes the official Crunch Week starter-pack dataset, examples, and `validator.py`. Preserve the organizers' terms and attribution requirements provided with the starter pack. Supabase provides hosted PostgreSQL; Render hosts the web service. Their hosted services are not bundled libraries.

## Visual assets

AXIOM includes project-specific SVG icons and illustrations under `frontend/public`. The exact crowd sprite atlas at `frontend/public/images/peeps/all-peeps.png` has no embedded source or license metadata; the filename and appearance are not proof that it came from Open Peeps. Repository history and documentation do not establish its origin. Its rights and any attribution requirement therefore remain **unverified**, and it is not being represented as licensed. Before public redistribution, the team should identify and record the exact source/license or replace it with an asset whose provenance is documented. A suitable prospective replacement is an asset newly downloaded or reconstructed from [Open Peeps by Pablo Stanley](https://www.openpeeps.com/), whose official site states that the library is available under CC0 for commercial and personal use. This recommendation does not establish the provenance or license of the currently bundled atlas; retain a copy of the applicable CC0 notice/source alongside any replacement.
