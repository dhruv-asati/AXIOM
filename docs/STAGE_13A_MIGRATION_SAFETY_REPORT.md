# AXIOM Stage 13A — Supabase migration safety review

Review date: 2026-10-31

## Executive result

**Deployment recommendation: SAFE TO APPLY — ALREADY APPLIED ON THE CONFIGURED DATABASE.**

The earlier Stage 12 report described the database as still being at revision 415e1b5d6866. The live, read-only Alembic check during this review returned cd9a2f1b7e40 (head). Read-only PostgreSQL catalog checks confirmed that schedule_repair_proposals exists and schedules.created_at exists and is non-null. Thus both reviewed migrations are already applied to the database configured in backend/.env; do not apply them again there. No data or schema was changed during this review.

The sanitized target is PostgreSQL database postgres, reached through a Supabase pooler in eu-west-2. No username, password, connection URL, or token was printed. The host region and database name do not identify a specific Supabase project; they identify the target selected by local DATABASE_URL.

## 1. Migration chain

The versions directory contains the baseline and two reviewed revisions:

| Revision | File | Parent |
|---|---|---|
| 415e1b5d6866 | 415e1b5d6866_initial_schema.py | base |
| 8c41d892c2aa | 8c41d892c2aa_disruption_repair_proposals.py | 415e1b5d6866 |
| cd9a2f1b7e40 | cd9a2f1b7e40_add_schedule_created_at.py | 8c41d892c2aa |

The revision declarations form a single connected chain. Alembic history listed all three in order and heads reported exactly one head, cd9a2f1b7e40. No duplicate or disconnected revision files are present.

The baseline creates schedules with unique constraint uq_schedules_id_dataset on (id, dataset_id), matching the repair migration's composite schedule references.

## 2. Migration-by-migration review

### 8c41d892c2aa_disruption_repair_proposals.py

Upgrade creates schedule_repair_proposals and does not alter or drop existing tables. The table contains UUID identifiers/references, status and fingerprint strings, JSON payloads, explanation text and timestamps. It adds:

- Primary key on id.
- Check constraint limiting status to proposed, approved, or rejected.
- Dataset foreign key with ON DELETE CASCADE.
- Composite baseline schedule foreign key (baseline_schedule_id, dataset_id) to schedules(id, dataset_id), with ON DELETE CASCADE. The referenced pair has the baseline migration's unique constraint, enforcing same-dataset ownership in PostgreSQL.
- Nullable composite approved schedule foreign key (approved_schedule_id, dataset_id) to the same unique pair. PostgreSQL's default MATCH SIMPLE permits null approved_schedule_id while validating non-null values.
- Indexes on (dataset_id, created_at) and (baseline_schedule_id, status).

This creates an empty table and preserves existing CIT data. No server defaults are declared; the ORM service supplies required values. Direct SQL writers must supply all non-null fields. SQLAlchemy JSON maps to PostgreSQL's supported native json type; UUID maps to PostgreSQL UUID.

Downgrade drops the two indexes and then the proposal table. It is structurally correct but loses proposal rows if any exist at rollback time. The configured database currently contains zero proposal rows.

### cd9a2f1b7e40_add_schedule_created_at.py

Upgrade adds schedules.created_at as nullable timezone-aware DateTime, backfills null values with CURRENT_TIMESTAMP, then makes the column NOT NULL using Alembic batch alteration. It neither drops nor rewrites schedule rows. Existing schedules get the migration-time value because their original creation time was not recorded.

The backfilled value is therefore an approximation for old schedules. Multiple historical schedules would share a timestamp; API ordering uses a UUID tie-breaker for ties. This affects history ordering only, not assignments or source data. The SQLAlchemy model has a Python UTC default for ORM-created rows, but no database server default; direct SQL insertions must supply created_at.

Downgrade drops schedules.created_at. It preserves schedule and assignment rows but removes history timestamps, so downgrade is not recommended after the field has been used.

The batch operation is PostgreSQL-compatible: Alembic emits ALTER COLUMN SET NOT NULL, not SQLite-specific SQL. Offline PostgreSQL SQL generation succeeded.

## 3. Read-only database evidence

Alembic current connected and returned:

    cd9a2f1b7e40 (head)

Read-only catalog and count queries returned:

- public.schedule_repair_proposals exists.
- Proposal row count: 0.
- Schedule row count: 1.
- schedules.created_at is timestamp with time zone, NOT NULL, and has no server default.
- The schedule row's created_at is populated.
- The proposal table has all 15 columns declared in the migration, including UUID columns, native json columns and timezone-aware timestamps with the expected nullability.
- PostgreSQL reports the expected proposal primary key, status check, dataset foreign key, both composite schedule foreign keys and both secondary indexes.

The prior Stage 12 report's revision 415e1b5d6866 is stale for this configured target. If a different Supabase project is intended, inspect that project's DATABASE_URL before deployment.

## 4. Model and migration consistency

- The mapped class is ScheduleRepairProposal and maps to schedule_repair_proposals.
- Its columns, nullability, JSON fields, check constraint, foreign keys and index names match migration 8c41d892c2aa.
- Dataset ownership is represented by a dataset foreign key; baseline and approved schedules use composite dataset-scoped foreign keys.
- Schedule.created_at is non-null timezone-aware SQLAlchemy DateTime, matching the final schema from cd9a2f1b7e40.
- The baseline's unique schedule key matches both composite references.
- JSON and UUID types are PostgreSQL compatible; neither migration uses SQLite-specific syntax.
- Live PostgreSQL catalog definitions match the expected migrated objects.

No model/migration mismatch requiring a code change was found.

## 5. API dependency and impact

Routes and services use ScheduleRepairProposal for proposal creation, listing, review, approval, rejection and dashboard proposal summaries. Without migration 8c41d892c2aa, these routes fail at the database layer and the application returns its generic schema/database unavailable 503.

Schedule summaries and history sort by Schedule.created_at. Without cd9a2f1b7e40, schedule history, schedule details and dashboard summary queries that read schedules fail.

Routes check proposal baseline ownership. The composite foreign keys enforce this boundary at the database level too. The configured database has these schema objects, but no route writes were performed during this read-only review.

## 6. Non-destructive checks

From backend:

- .\.venv\Scripts\python.exe -m alembic -c alembic.ini history — passed; all three revisions in sequence.
- .\.venv\Scripts\python.exe -m alembic -c alembic.ini heads — passed; one head, cd9a2f1b7e40.
- .\.venv\Scripts\python.exe -m alembic -c alembic.ini current — passed; configured database is at cd9a2f1b7e40.
- .\.venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head --sql — passed; generated PostgreSQL offline SQL only.
- .\.venv\Scripts\python.exe -m alembic -c alembic.ini check — passed; no model/schema upgrade operations detected.
- .\.venv\Scripts\python.exe -m pytest -q — 211 passed, with one Starlette/AnyIO deprecation warning.
- From repository root, git diff --check — passed. Git emitted line-ending normalization notices for working-copy changes, but no whitespace errors remained.

No alembic upgrade head, alembic downgrade, schema mutation or data mutation was run.

## 7. Risks and required actions

1. The live state differs from the earlier report. Verify the intended Supabase project before assuming this status applies to another deployment.
2. Existing schedules backfilled by cd9a2f1b7e40 receive migration-time timestamps, not original generation times. Only one schedule row exists in the configured database, so no tie ambiguity is present there.
3. Downgrading 8c41d892c2aa drops the proposal table and any later proposal rows. Downgrading cd9a2f1b7e40 drops history timestamps. Do not downgrade without a backup and rollback plan.
4. No code-level defect was identified, so no application or database changes were made during this review.

## 8. Commands for another environment

From backend, first ensure DATABASE_URL points to the intended target, then inspect and preview:

    .\.venv\Scripts\python.exe -m alembic -c alembic.ini current
    .\.venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head --sql

Only if that target is at 415e1b5d6866 and the generated SQL has been reviewed, apply:

    .\.venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head

Then verify:

    .\.venv\Scripts\python.exe -m alembic -c alembic.ini current

The upgrade command mutates the database named by DATABASE_URL. It is unnecessary for the currently configured target, already at head.
