# Deterministic timetable solver

## API and persistence

- `POST /api/v1/datasets/{dataset_id}/schedules/generate` accepts `{"team":"AXIOM","time_limit_seconds":120}` and solves a dataset-specific weekly timetable plus its exam allocations.
- `GET /api/v1/datasets/{dataset_id}/schedules/{schedule_id}/assignments` returns persisted weekly session assignments.
- `GET /api/v1/datasets/{dataset_id}/schedules/{schedule_id}/export` returns the official `schedule.json` structure with `team`, source `dataset_id`, all sessions and all exam allocations.

The service reads courses, sessions, faculty, groups, rooms, room unavailability, exams, and calendar constraints only from the selected `dataset_id`. It persists a `Schedule`, one `ScheduleSessionAssignment` per session, and one `ExamRoomAllocation` per assigned exam room. It does not create a schedule when the input is infeasible or no complete solution is found before the time limit.

The solver uses CP-SAT with one search worker and a fixed random seed. `optimal` means optimality was proven for the objective. `feasible` means every hard constraint is satisfied and the objective was optimized as far as possible before timeout; it does not claim a proven minimum. Infeasible inputs return HTTP 422; failure to find a solution before timeout returns HTTP 503.

## Hard constraints

The following are enforced as model constraints or by removing illegal candidate placements before solving:

- Every known session and every exam is assigned exactly once.
- Faculty, room, and student-group time conflicts are prohibited. Combined sessions reserve every linked group. Simultaneous sessions in one elective basket share day/start but each use a different room.
- Session rooms must be allowed for the session kind, have an allowed room type, meet session capacity, and satisfy accessibility needs.
- Faculty and room unavailability are excluded.
- Sessions use teaching periods only, may not cross lunch, and must honor fixed slots. Three-hour labs may start only at the dataset calendar's lab start periods.
- Faculty daily teaching hours cannot exceed `max_hours_per_day`.
- Every exam is assigned to one valid exam day/session, exam rooms must allow exams, room seats count at half capacity, and neither a room nor a student group can be used by two exams in the same slot.
- All reads and writes are scoped to the selected dataset. Composite database foreign keys preserve that isolation for persisted assignments.

## Soft objective

The solver minimizes the exact point costs implemented by the official validator:

| Cost | Weight |
|---|---:|
| S1: faculty avoid preference | 2 points per avoided teaching hour |
| S2: student group gap between first and last class in a day | 1 point per gap period |
| S3: student group exceeds 6 teaching hours in a day | 3 points per excess hour |
| S4: repeated same-course lectures for a group in a day; repeated basket course in a day | 3 points per extra occurrence |
| S5: room occupancy below 40% of capacity | 1 point per session |
| S6: a session uses the last teaching period | 1 point per session |
| Exam soft cost: a student group has multiple exams on one day | 5 points per exam beyond the first |

Hard constraints are not represented as penalty weights. The solver recomputes the S1–S6 and exam scores from the selected solution before returning results.

## Verification

Run the backend suite from `backend/`:

```powershell
python -m pytest -q
```

After exporting a generated schedule, run the unmodified official validator:

```powershell
python validator.py --data data/cit_public.json --schedule exports/schedule.json
```

The service returns a complete hard-valid solution; validator compatibility is checked independently on the exported JSON.
