# AXIOM Final Hackathon Submission Audit

Updated 1 November 2026. This audit separates local repository evidence from deployed/live evidence. No Supabase data was changed, no migrations were executed, no demo account was provisioned or reset, and no deployment was made.

## Requirement-by-requirement status

| # | Requirement | Previous status | New status | Change and evidence | Exact command / actual result | Still unverified / manual action |
|---:|---|---|---|---|---|---|
| 1 | Public GitHub repository | PARTIAL | PARTIAL | Public repository URL is documented. Remote `main` still points to the previously audited commit; this remediation is local and uncommitted. | `git ls-remote https://github.com/dhruv-asati/AXIOM.git refs/heads/main` → `828ff3e1ad256ca12d1e13f0d81a343767e280fe`. | Review and push the approved changes through the team's normal workflow, then verify the remote SHA. No push was made. |
| 2 | README | PASS | PASS | Project description, architecture diagram, stack, setup, reported demo usernames/roles, known limitations, repository/deployment URLs, export descriptions, and validator commands are documented. The account provisioning statement is qualified as operator-reported, not independently verified. | Manual review of `README.md`; baseline and disruption validation commands below both ran successfully. | Team should review content before submission. |
| 3 | `.env.example` | PASS | PASS | Checked names against application config: `DATABASE_URL`, `CORS_ORIGINS`, `ENVIRONMENT`, optional `AXIOM_DEMO_ACCOUNTS_JSON`, and `VITE_API_URL`. Render supplies `PORT`. Values are safe placeholders; no populated `.env` was read. | `rg -n "DATABASE_URL|CORS_ORIGINS|ENVIRONMENT|AXIOM_DEMO_ACCOUNTS_JSON|VITE_API_URL" backend/app frontend/src Dockerfile render.yaml .env.example frontend/.env.example` → all documented names found in source/config. | Keep real values in protected secret settings only. |
| 4 | `AI_USAGE.md` | PASS | PASS | Discloses Codex-assisted development and accurately distinguishes the deterministic request parser from hosted LLM use. | Manual review of `AI_USAGE.md`. | None identified for the stated disclosure. |
| 5 | `THIRD_PARTY.md` | PARTIAL | PARTIAL | Dependency and organizer/service notices retained. Exact crowd-art provenance remains unknown; no license claim was added for the current image. A clearly marked prospective CC0 replacement is recommended. | `git log --all --format='%h %s' -- frontend/public/images/peeps/all-peeps.png` → only observed history entry `3897e3c added features`; asset has no embedded provenance metadata. | Review all transitive dependency licenses before redistribution. Identify the current image's source or replace it deliberately and retain its actual notice. |
| 6 | `exports/schedule.json` baseline | PASS | PASS | Existing baseline was not modified during this task and remains validator-valid. | `python validator.py --data data/cit_public.json --schedule exports/schedule.json` → 189 sessions; hard violations 0; soft penalty 145 (`S1=4,S2=107,S3=15,S4=6,S5=10,S6=3`); exam soft penalty 15. SHA-256: `C4D2083E2C8CEA0E621D276EF1838A66199124C8C29A858E105B03669E8A6BFC`. | None for baseline validator compliance. |
| 7 | `exports/schedule_after.json` | FAIL | PASS | Generated with the actual `create_repair_proposal` and `approve_repair_proposal` services using a temporary in-memory SQLite database, freshly imported CIT input, and the existing baseline. The solver marked its result `feasible` (complete, hard-valid; not proven optimal). The approved derived schedule was exported; the baseline file was not overwritten. Added `CS202-T2`; no sessions removed; 163 original assignments unchanged and 26 moved (3 time changes, 23 room-only changes). No assignment remains in closed room `CR-102`. | `python validator.py --data data/cit_public.json --schedule exports/schedule_after.json --disruption examples/sample_disruption.json --baseline exports/schedule.json` → hard violations 0; soft penalty 157 (`S1=6,S2=111,S3=12,S4=9,S5=15,S6=4`); exam soft penalty 15; stability: 26 sessions moved (3 changed time, 23 room only). | Generated in isolated SQLite only; it does not represent a write to or schedule generated from Supabase. |
| 8 | Live Render deployment | PARTIAL | PARTIAL | The previous read-only audit observed the landing page, login page, dashboard SPA shell, and health endpoint returning HTTP 200. A SPA shell response does not prove authenticated rendering. No deploy/restart was made. | Previous audit's read-only GETs: `/`, `/login`, `/dashboard`, `/api/v1/health` → HTTP 200; `/api/v1/ready` → HTTP 401. | Deploying local changes is a separate team action. Afterwards verify the real authenticated workspace and cold-start behavior. |
| 9 | Database readiness | PARTIAL | PARTIAL | Root cause established: `/ready` was registered on the protected `router` (session/CSRF/dataset-scope dependencies), unlike public `/health`. It now uses `public_router`, still executes `SELECT 1`, and SQLAlchemy errors return a generic 503. Protected API routes remain protected. Local success/failure tests pass. | `cd backend; .\.venv\Scripts\python.exe -m pytest -q tests/test_auth.py tests/test_api.py` → 34 passed. Tests verify public success, unauthenticated protected-route 401, and failed DB check returns sanitized 503 rather than healthy. | The deployed service has not received this source change; its previously observed 401 remains until a separately authorized deployment. Production `DATABASE_URL` was not inspected. |
| 10 | Four demo logins and role experiences | PARTIAL | PARTIAL | Mocked session tests verify all four server-assigned roles (`admin`, `department_coordinator`, `faculty`, `club_representative`); frontend role navigation and approval-control tests pass. No private password was requested or used. | Full backend and frontend suites below; frontend role tests report role-specific workspace and authorization-control visibility passing. | Privately sign into each deployed account and confirm landing page, navigation, and permitted workflows. Live account state/credentials are not verified here. |
| 11 | Admin reset authorization and behavior | PARTIAL | PARTIAL | Reset implementation remains admin-only and source review shows imported dataset records/imported requests are preserved. New mocked-auth tests verify coordinator, faculty, and club roles receive 403. The reset action was not invoked. | Included in `backend/tests/test_auth.py`; full backend result: 257 passed. | Admin's successful reset flow and preservation semantics require safe test-dataset/manual verification; do not reset production demo data during submission prep. |
| 12 | Crowd artwork licensing | PARTIAL | PARTIAL | The file `frontend/public/images/peeps/all-peeps.png` (380,568 bytes) is still unresolved. Its name/appearance and sole observed commit do not prove origin. Official Open Peeps identifies its own library as CC0, but that does not establish this bundled file came from that library. | Asset metadata/history review above; prospective replacement source: [Open Peeps official site](https://www.openpeeps.com/). | Obtain evidence for the current image or consciously replace it with a newly sourced asset and retain its license/notice. Do not attribute the existing file to Open Peeps without evidence. |
| 13 | Five-minute video walkthrough | NOT VERIFIED | NOT VERIFIED | No actual video URL was supplied or verified. | No video recording/link check was possible from repository evidence. | Record a five-minute-or-shorter walkthrough and provide a viewable unlisted YouTube or Drive link. |

Current status count: **5 PASS, 7 PARTIAL, 0 FAIL, 1 NOT VERIFIED** (13 requirements).

## Local regression results

- Backend full suite: from `backend/`, run `.\.venv\Scripts\python.exe -m pytest -q` → **257 passed**, 1 third-party Starlette/AnyIO deprecation warning, 50.67 seconds.
- Frontend unit suite: from `frontend/`, run `npm test` → **19 passed**, 0 failed.
- Frontend type check and production build: `npm run build` → TypeScript succeeded; Vite transformed 1,658 modules and built successfully.
- Baseline and disruption export validator outputs: recorded in checklist items 6 and 7. Both have **zero hard violations**; their soft penalties are reported separately.
- Readiness endpoint tests are included in the backend test suite; no live database was used for those tests.

The offline disruption run imported the CIT source into a temporary in-memory database (temporary dataset UUID `fb37508a-834c-4d8f-b045-5e7d459ce24c`), seeded the existing export as a baseline schedule, generated and approved a repair in that temporary database, and exported the resulting schedule. The temporary UUID is not the production/Supabase dataset ID. No database file or Supabase connection was used for that run.

## Final checklist and verdict

- [x] Public repository URL identified; reviewed local changes remain unpushed.
- [x] README reviewed and updated.
- [x] Environment examples match the referenced source names and contain placeholders.
- [x] AI-use disclosure reviewed.
- [ ] Complete transitive dependency license inventory.
- [x] Baseline export validates.
- [x] Post-disruption export was generated by the real workflow and validates.
- [ ] Deploy/release the local readiness fix and verify the deployed service.
- [ ] Verify database readiness on the deployed service.
- [ ] Privately log into each of the four deployed demo accounts.
- [ ] Verify reset success only in an approved safe test/demo window.
- [ ] Resolve current crowd artwork provenance or replace with a documented asset.
- [ ] Record and share the five-minute video walkthrough.

**AXIOM is not yet fully submission-ready and is not ready for final video recording.** The post-disruption artifact and local tests are now complete, but deployed readiness/authenticated flows, account verification, artwork rights, and the required video remain outstanding. All changes are local; none were committed, pushed, or deployed.
