# Timetable optimisation and disruption repair audit

## Existing solver audit

The existing timetable generator is retained. It reads the selected dataset's calendar, courses, sessions, faculty, groups, rooms, room unavailability, and examinations. It uses OR-Tools CP-SAT with one worker and a fixed random seed. Results distinguish `optimal` (proof of optimum) from `feasible` (complete valid solution without an optimality proof) and expose objective, best bound, and solve time.

### Hard constraints checked in the solver

- Every active session and examination is assigned exactly once; incomplete CP-SAT results are rejected.
- A faculty member, room, or student group cannot be double-booked. Combined sessions reserve all linked groups.
- Sessions must use a permitted room type and use, have sufficient room capacity, and meet accessibility requirements.
- Faculty and room unavailability is excluded from candidates.
- Teaching is limited to declared teaching periods, cannot cross lunch, and must honor fixed slots. Three-period labs use the configured lab start periods.
- Faculty daily hours cannot exceed their configured limit.
- Elective basket members synchronize to one day/start and use separate rooms.
- Exams use declared exam days/sessions, receive enough exam seating (half of room capacity per the source specification), and cannot overlap by room or group.

The checked model does not silently convert a hard violation into a penalty. The final result also verifies assignment completeness before persistence. No missing required hard rule was identified in the starter-pack specification and validator review.

### Objective and score review

`_score_solution` recomputes the point score after solving. It matches the scoring logic in the unmodified `validator.py`:

| Component | Exact cost |
|---|---:|
| S1 faculty avoid preference | 2 per avoided teaching period |
| S2 group gap | 1 per empty period strictly between first and last class that day |
| S3 group daily load | 3 per teaching hour above 6 |
| S4 repeated lectures / basket course | 3 per occurrence beyond the first in its defined bucket |
| S5 room use below 40% capacity | 1 per session |
| S6 last teaching period | 1 per session using that period |
| Exam group repeats on a day | 5 per exam after the first |

Generation's weighted CP-SAT expression mirrors these points; post-solve scoring is independent and reported separately. The known reference export score is S1=4, S2=107, S3=15, S4=6, S5=10, S6=3 (145 total) plus exam penalty 15 (combined 160). That historical run was feasible, not proven optimal.

An optional `warm_start_schedule_id` seeds the session and exam variables from a complete same-dataset schedule. Hints do not constrain the new solve; the official objective is still minimized. On the same imported CIT data in isolated SQLite, with the same 120-second limit and the unchanged export as the hint, two runs returned complete feasible schedules:

| Run | Soft | Exam | Combined | Runtime | Status |
|---|---:|---:|---:|---:|---|
| Existing validator export | 145 | 15 | 160 | historical run | feasible |
| Warm-start trial 1 | 139 | 15 | 154 | 120.06 sec | feasible |
| Warm-start trial 2, independently validated | 137 | 15 | 152 | 120.09 sec | feasible |

Trial 2 reduced the combined validator score by 8 points. Its best bound was 3, so optimality was not proven. The official validator confirmed 0 hard violations and S1=2, S2=108, S3=12, S4=6, S5=5, S6=4, plus exam penalty 15. A separate unseeded 120-second run returned 160 soft plus 15 exam (combined 175); it is not used as the quality baseline. All benchmarking used temporary local SQLite databases and did not create or overwrite production schedules or change `exports/schedule.json`.

S2 remains the largest component (107 in the reference and 108 in the warm trials). Future optimization experiments should focus on exact gap modelling/search performance while comparing validator output and preserving hard validity. Do not describe a score as improved without recording the same input, time limit, status, bound, and validator score.

## Disruption repair

The repair service reuses the CP-SAT model. It supplies baseline assignment hints and adds a deterministic stability cost: 100 per changed session and 5 per affected student group. These costs are additional repair preferences; official soft penalties remain separately represented and recomputed. Existing exam slot/room allocations are held fixed during teaching-only repairs.

Supported structured changes are faculty unavailability, room unavailability, add faculty, add session, and remove session. The service identifies impacted sessions, solves a complete candidate, reports changed sessions/groups and the objective breakdown, and stores it as a `proposed` repair. It does not mutate source rows or the baseline schedule during proposal creation. Explicit approval applies source changes transactionally and persists a separate schedule and its assignments; rejection only records the rejection. A fingerprint prevents approving a proposal after its source data or baseline schedule has changed. Removed sessions remain in source storage for historical foreign keys and are excluded from future solves after an approved removal.

`POST /assistant/disruptions/parse` remains available for interpretation-only requests. The integrated route `POST /datasets/{dataset_id}/schedules/{schedule_id}/assistant/disruptions/repair-proposals` sends parser output to the deterministic repair service only when the parser produces a complete disruption proposal. Clarification/unsupported results do not invoke the solver. AI does not choose assignments.

## Persistence and migration

Repair proposals are stored in `schedule_repair_proposals`, with dataset-scoped composite foreign keys to the baseline and optional approved schedule. This adds a migration after the already applied base schema; it has **not** been applied to any database.

From `backend/`, review pending revisions and create future revisions with:

```powershell
.\.venv\Scripts\python.exe -m alembic -c alembic.ini history
.\.venv\Scripts\python.exe -m alembic -c alembic.ini revision --autogenerate -m "describe change"
```

Apply only after review and explicit environment selection:

```powershell
.\.venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head
```

Do not apply the new repair-proposal migration as part of local tests or solver validation.

## API workflow

1. `POST /datasets/{dataset_id}/schedules/{schedule_id}/repair-proposals` with a structured `changes` array to create a preview.
2. `GET /datasets/{dataset_id}/schedules/{schedule_id}/repair-proposals/{proposal_id}` to inspect it; list via `GET /datasets/{dataset_id}/repair-proposals`.
3. `POST .../{proposal_id}/approve` to explicitly create a new schedule, or `POST .../{proposal_id}/reject` with `{"reason":"..."}`.
4. Read the approved schedule with the existing assignment/export endpoints. The original schedule is retained.

The assistant-integrated endpoint accepts the same `AssistantRequest` text plus `time_limit_seconds`; its response contains the parser interpretation and, when ready, the repair proposal. API request/response models are in `backend/app/schemas/api.py` and Swagger is served at `/docs`.

## Limitations

- The repair objective weights (100 and 5) are explicit deterministic policy choices, not starter-pack scoring weights; they can be tuned with measured demonstrations.
- Teaching repairs preserve existing exam allocations instead of re-optimizing exams.
- Approved source changes affect future solver inputs. Existing schedules and booking outcomes remain historical snapshots.
- Structured proposal support is limited to the five change types listed above; parser natural-language coverage remains intentionally conservative and may ask for clarification.
