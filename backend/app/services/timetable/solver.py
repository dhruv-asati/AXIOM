from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from time import perf_counter
from typing import Any
from uuid import UUID, uuid4

from ortools.sat.python import cp_model
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Course, Dataset, Examination, Faculty, Room, RoomUnavailability, Schedule,
    ScheduleRepairProposal, ScheduleSessionAssignment, StudentGroup, TimetableSession,
)
from app.models.entities import ExamRoomAllocation, session_groups


class TimetableSolveError(RuntimeError):
    """Base error for timetable generation failures."""


class InfeasibleTimetableError(TimetableSolveError):
    """The requested dataset has no assignment satisfying its hard constraints."""


class TimetableTimeoutError(TimetableSolveError):
    """The solver could not establish a complete solution before the time limit."""


@dataclass
class SolveResult:
    status: str
    soft_penalties: dict[str, int]
    soft_total: int
    exam_soft_penalty: int
    scheduled_sessions: int
    scheduled_exams: int
    schedule_id: UUID
    source_id: str
    solver_objective: int = 0
    best_objective_bound: float = 0
    solve_time_seconds: float = 0


@dataclass
class SolverSolution:
    status: str
    assignments: dict[str, tuple[str, int, str]]
    exam_assignments: dict[str, tuple[str, str, list[str]]]
    soft_penalties: dict[str, int]
    soft_total: int
    exam_soft_penalty: int
    objective: int
    best_bound: float
    solve_time_seconds: float
    changed_session_ids: list[str]


def _score_solution(
    sessions: list[TimetableSession],
    session_groups_by_id: dict[str, set[str]],
    faculty_by_id: dict[str, Faculty],
    room_by_id: dict[str, Room],
    assignments: dict[str, tuple[str, int, str]],
    exam_assignments: dict[str, tuple[str, str, list[str]]],
    exams: list[Examination],
    days: list[str],
) -> tuple[dict[str, int], int, int]:
    """Recompute validator-compatible soft costs from a complete assignment."""
    penalties = {f"S{i}": 0 for i in range(1, 7)}
    group_periods: dict[tuple[str, str], set[int]] = defaultdict(set)
    group_hours: dict[tuple[str, str], int] = defaultdict(int)
    group_course_lectures: dict[tuple[str, str, str], int] = defaultdict(int)
    seen_baskets: set[tuple[str, str]] = set()
    basket_course_day: dict[tuple[str, str], int] = defaultdict(int)
    for session in sorted(sessions, key=lambda row: row.source_id):
        day, start, room_id = assignments[session.source_id]
        periods = set(range(start, start + session.duration))
        room = room_by_id[room_id]
        faculty = faculty_by_id[session.faculty_source_id]
        for preference in faculty.preferences or []:
            if preference.get("type") == "avoid" and day in preference.get("days", days):
                penalties["S1"] += 2 * len(periods.intersection(preference.get("periods", [])))
        if room.capacity and session.size / room.capacity < 0.4:
            penalties["S5"] += 1
        if 9 in periods:
            penalties["S6"] += 1
        for group_id in session_groups_by_id.get(session.source_id, set()):
            group_periods[(group_id, day)].update(periods)
            if session.basket_slot:
                basket_key = (group_id, session.basket_slot)
                if basket_key not in seen_baskets:
                    seen_baskets.add(basket_key)
                    group_hours[(group_id, day)] += session.duration
            else:
                group_hours[(group_id, day)] += session.duration
                if session.kind == "lecture":
                    group_course_lectures[(group_id, day, session.course_source_id)] += 1
        if session.basket_slot:
            basket_course_day[(session.course_source_id, day)] += 1
    for periods in group_periods.values():
        penalties["S2"] += sum(1 for period in range(min(periods), max(periods) + 1) if period not in periods)
    for hours in group_hours.values():
        if hours > 6:
            penalties["S3"] += 3 * (hours - 6)
    for count in group_course_lectures.values():
        if count > 1:
            penalties["S4"] += 3 * (count - 1)
    for count in basket_course_day.values():
        if count > 1:
            penalties["S4"] += 3 * (count - 1)

    exam_group_days: dict[tuple[str, str], set[str]] = defaultdict(set)
    exam_by_id = {exam.source_id: exam for exam in exams}
    for exam_id, (day, _session, _rooms) in exam_assignments.items():
        for group_id in exam_by_id[exam_id].group_ids:
            exam_group_days[(group_id, day)].add(exam_id)
    exam_penalty = sum(5 * (len(exam_ids) - 1) for exam_ids in exam_group_days.values() if len(exam_ids) > 1)
    return penalties, sum(penalties.values()), exam_penalty


def _approved_removed_session_ids(db: Session, dataset_id: UUID) -> set[str]:
    approved_changes = db.scalars(select(ScheduleRepairProposal.changes).where(
        ScheduleRepairProposal.dataset_id == dataset_id,
        ScheduleRepairProposal.status == "approved",
    )).all()
    return {
        change["session_id"]
        for changes in approved_changes
        for change in (changes or [])
        if change.get("type") == "remove_session"
    }


def _build_and_solve(
    dataset: Dataset,
    sessions: list[TimetableSession],
    courses: list[Course],
    faculties: list[Faculty],
    groups: list[StudentGroup],
    rooms: list[Room],
    unavailable_rows: list[RoomUnavailability],
    session_group_rows: list[tuple[str, str]],
    exams: list[Examination],
    time_limit_seconds: float,
    *,
    baseline_assignments: dict[str, tuple[str, int, str]] | None = None,
    baseline_exam_assignments: dict[str, tuple[str, str, list[str]]] | None = None,
    removed_session_ids: set[str] | None = None,
    repair_change_weight: int = 100,
    repair_group_weight: int = 5,
    hint_assignments: dict[str, tuple[str, int, str]] | None = None,
    hint_exam_assignments: dict[str, tuple[str, str, list[str]]] | None = None,
    movable_session_ids: set[str] | None = None,
) -> SolverSolution:
    calendar = dataset.calendar or {}
    days = list(calendar.get("days") or [])
    teaching_periods = sorted(int(p["id"]) for p in calendar.get("periods", []) if p.get("teaching"))
    lunch_after = int((calendar.get("lunch") or {}).get("after_period", 5))
    lab_starts = set(int(value) for value in calendar.get("lab_start_periods", []))
    if not days or not teaching_periods:
        raise InfeasibleTimetableError("Dataset calendar has no teaching days or teaching periods")
    last_period = max(teaching_periods)
    session_groups_by_id: dict[str, set[str]] = defaultdict(set)
    for session_id, group_id in session_group_rows:
        session_groups_by_id[session_id].add(group_id)
    faculty_by_id = {faculty.source_id: faculty for faculty in faculties}
    course_ids = {course.source_id for course in courses}
    room_by_id = {room.source_id: room for room in rooms}
    sessions_by_id = {session.source_id: session for session in sessions}
    group_ids = {group.source_id for group in groups}
    faculty_unavailable: dict[str, set[tuple[str, int]]] = defaultdict(set)
    for faculty in faculties:
        for block in faculty.unavailable or []:
            for period in block.get("periods", []):
                faculty_unavailable[faculty.source_id].add((block["day"], int(period)))
    room_unavailable: dict[str, set[tuple[str, int]]] = defaultdict(set)
    for row in unavailable_rows:
        for period in row.periods or []:
            room_unavailable[row.room_source_id].add((row.day, int(period)))

    model = cp_model.CpModel()
    repair_mode = baseline_assignments is not None
    baseline_assignments = baseline_assignments or {}
    baseline_exam_assignments = baseline_exam_assignments or {}
    hint_assignments = hint_assignments if hint_assignments is not None else baseline_assignments
    hint_exam_assignments = hint_exam_assignments if hint_exam_assignments is not None else baseline_exam_assignments
    removed_session_ids = removed_session_ids or set()
    # Repair models start from a valid baseline. Keep unaffected sessions at
    # their baseline time and room so CP-SAT only searches the disruption's
    # local impact area instead of rebuilding the full timetable search space.
    movable_session_ids = movable_session_ids if movable_session_ids is not None else set(sessions_by_id)
    session_y: dict[tuple[str, str, int], cp_model.IntVar] = {}
    session_x: dict[tuple[str, str, int, str], cp_model.IntVar] = {}
    session_candidates: dict[str, list[tuple[str, int]]] = defaultdict(list)
    candidates_by_placement: dict[tuple[str, str, int], list[cp_model.IntVar]] = defaultdict(list)
    no_candidate_sessions: list[str] = []
    for session in sessions:
        if session.course_source_id not in course_ids:
            raise InfeasibleTimetableError(
                f"Session {session.source_id} references a course missing from this dataset"
            )
        duration = int(session.duration)
        if duration <= 0:
            no_candidate_sessions.append(session.source_id)
            continue
        faculty_un = faculty_unavailable[session.faculty_source_id]
        fixed = session.fixed_slot or None
        for day in days:
            baseline = baseline_assignments.get(session.source_id)
            if repair_mode and session.source_id not in movable_session_ids and baseline and day != baseline[0]:
                continue
            if fixed and day != fixed.get("day"):
                continue
            for start in teaching_periods:
                if repair_mode and session.source_id not in movable_session_ids and baseline and start != baseline[1]:
                    continue
                end = start + duration - 1
                occupied = range(start, end + 1)
                if end > last_period or any(period not in teaching_periods for period in occupied):
                    continue
                if start <= lunch_after < end:
                    continue
                if session.kind == "lab" and duration == 3 and start not in lab_starts:
                    continue
                if fixed and start != int(fixed.get("start_period", -1)):
                    continue
                if any((day, period) in faculty_un for period in occupied):
                    continue
                fitting_rooms = []
                for room in rooms:
                    if repair_mode and session.source_id not in movable_session_ids and baseline and room.source_id != baseline[2]:
                        continue
                    if session.kind not in (room.allowed_uses or []):
                        continue
                    if room.type not in (session.room_types or []):
                        continue
                    if room.capacity < session.size:
                        continue
                    if session.needs_accessible and not room.accessible:
                        continue
                    if any((day, period) in room_unavailable[room.source_id] for period in occupied):
                        continue
                    fitting_rooms.append(room)
                if not fitting_rooms:
                    continue
                y_key = (session.source_id, day, start)
                y = model.new_bool_var(f"session_{session.source_id}_{day}_{start}")
                session_y[y_key] = y
                session_candidates[session.source_id].append((day, start))
                for room in fitting_rooms:
                    x_key = (session.source_id, day, start, room.source_id)
                    x = model.new_bool_var(f"place_{session.source_id}_{day}_{start}_{room.source_id}")
                    session_x[x_key] = x
                    candidates_by_placement[y_key].append(x)
                model.add(sum(candidates_by_placement[y_key]) == y)
        if not session_candidates[session.source_id]:
            no_candidate_sessions.append(session.source_id)
        model.add(sum(session_y[(session.source_id, day, start)] for day, start in session_candidates[session.source_id]) == 1)
    if no_candidate_sessions:
        raise InfeasibleTimetableError(
            "No legal room/time candidate for session(s): " + ", ".join(sorted(set(no_candidate_sessions)))
        )

    # Synchronize every elective basket at one shared day and start period.
    basket_sessions: dict[str, list[str]] = defaultdict(list)
    for session in sessions:
        if session.basket_slot:
            basket_sessions[session.basket_slot].append(session.source_id)
    basket_y: dict[tuple[str, str, int], cp_model.IntVar] = {}
    for basket, members in basket_sessions.items():
        common = set(session_candidates[members[0]])
        for member in members[1:]:
            common.intersection_update(session_candidates[member])
        for member in members:
            for day, start in session_candidates[member]:
                if (day, start) not in common:
                    model.add(session_y[(member, day, start)] == 0)
        for day, start in sorted(common):
            shared = model.new_bool_var(f"basket_{basket}_{day}_{start}")
            basket_y[(basket, day, start)] = shared
            for member in members:
                model.add(session_y[(member, day, start)] == shared)
        if not common:
            raise InfeasibleTimetableError(f"Elective basket {basket} has no shared legal day/start")

    # Faculty and rooms cannot have overlapping sessions.
    faculty_terms: dict[tuple[str, str, int], list[cp_model.IntVar]] = defaultdict(list)
    room_terms: dict[tuple[str, str, int], list[cp_model.IntVar]] = defaultdict(list)
    for session in sessions:
        for day, start in session_candidates[session.source_id]:
            y = session_y[(session.source_id, day, start)]
            for period in range(start, start + session.duration):
                faculty_terms[(session.faculty_source_id, day, period)].append(y)
            for room in rooms:
                x = session_x.get((session.source_id, day, start, room.source_id))
                if x is not None:
                    for period in range(start, start + session.duration):
                        room_terms[(room.source_id, day, period)].append(x)
    for terms in faculty_terms.values():
        model.add_at_most_one(terms)
    for terms in room_terms.values():
        model.add_at_most_one(terms)

    # A group can attend one activity per period. Basket alternatives count as
    # one activity for groups represented on multiple simultaneous electives.
    group_terms: dict[tuple[str, str, int], list[cp_model.IntVar]] = defaultdict(list)
    basket_groups: dict[tuple[str, str], set[str]] = defaultdict(set)
    for session in sessions:
        for group_id in session_groups_by_id.get(session.source_id, set()):
            if session.basket_slot:
                basket_groups[(session.basket_slot, group_id)].add(session.source_id)
            else:
                for day, start in session_candidates[session.source_id]:
                    y = session_y[(session.source_id, day, start)]
                    for period in range(start, start + session.duration):
                        group_terms[(group_id, day, period)].append(y)
    basket_max_duration = {
        basket: max(sessions_by_id[sid].duration for sid in members)
        for basket, members in basket_sessions.items()
    }
    for basket, group_id in sorted(basket_groups):
        for (candidate_basket, day, start), basket_var in basket_y.items():
            if candidate_basket != basket:
                continue
            for period in range(start, start + basket_max_duration[basket]):
                group_terms[(group_id, day, period)].append(basket_var)
    for terms in group_terms.values():
        model.add_at_most_one(terms)

    # Faculty daily teaching-hour caps.
    for faculty in faculties:
        for day in days:
            terms = [
                session.duration * session_y[(session.source_id, candidate_day, start)]
                for session in sessions if session.faculty_source_id == faculty.source_id
                for candidate_day, start in session_candidates[session.source_id]
                if candidate_day == day
            ]
            if terms:
                model.add(sum(terms) <= faculty.max_hours_per_day)

    # Repair stability is an additional objective layer; official scoring stays
    # independent and is recomputed from the selected assignments below.
    objective_terms: list[Any] = []
    changed_vars: dict[str, cp_model.IntVar] = {}
    if repair_mode:
        for session in sessions:
            baseline = baseline_assignments.get(session.source_id)
            unchanged = model.new_bool_var(f"unchanged_{session.source_id}")
            matching = session_x.get((session.source_id, *(baseline or ("", -1, ""))))
            if matching is None:
                model.add(unchanged == 0)
            else:
                model.add(unchanged == matching)
            changed = model.new_bool_var(f"changed_{session.source_id}")
            model.add(changed + unchanged == 1)
            changed_vars[session.source_id] = changed
            objective_terms.append(repair_change_weight * changed)
        removed_group_ids = {
            group_id for session_id in removed_session_ids
            for group_id in session_groups_by_id.get(session_id, set())
        }
        changed_group_ids = removed_group_ids | {
            group_id for session_id in changed_vars
            for group_id in session_groups_by_id.get(session_id, set())
        }
        for group_id in sorted(changed_group_ids):
            terms = [changed_vars[sid] for sid in changed_vars if group_id in session_groups_by_id.get(sid, set())]
            changed_group = model.new_bool_var(f"changed_group_{group_id}")
            if group_id in removed_group_ids:
                model.add(changed_group == 1)
            elif terms:
                model.add_max_equality(changed_group, terms)
            else:
                model.add(changed_group == 0)
            objective_terms.append(repair_group_weight * changed_group)
        objective_terms.append(repair_change_weight * len(removed_session_ids))

    # Exact validator soft costs. Hard constraints above remain separate.
    for session in sessions:
        faculty = faculty_by_id[session.faculty_source_id]
        avoid = set()
        for preference in faculty.preferences or []:
            if preference.get("type") == "avoid":
                for day in preference.get("days", days):
                    for period in preference.get("periods", []):
                        avoid.add((day, int(period)))
        for (sid, day, start, room_id), x in session_x.items():
            if sid != session.source_id:
                continue
            occupied = set(range(start, start + session.duration))
            s1 = len(occupied.intersection(period for avoid_day, period in avoid if avoid_day == day)) * 2
            if s1:
                objective_terms.append(s1 * x)
            room = room_by_id[room_id]
            if room.capacity and session.size / room.capacity < 0.4:
                objective_terms.append(x)
            if last_period in occupied:
                objective_terms.append(x)

    # Create the group occupancy indicators needed for S2 and S3.
    group_occ: dict[tuple[str, str, int], cp_model.IntVar] = {}
    all_group_ids = sorted({group for group, _day, _period in group_terms})
    for group_id in all_group_ids:
        for day in days:
            for period in teaching_periods:
                terms = group_terms.get((group_id, day, period), [])
                occupied = model.new_bool_var(f"group_occ_{group_id}_{day}_{period}")
                group_occ[(group_id, day, period)] = occupied
                if terms:
                    model.add(sum(terms) == occupied)
                else:
                    model.add(occupied == 0)
            # S2: every unoccupied period strictly between first and last use costs 1.
            gaps = []
            for index, period in enumerate(teaching_periods):
                before = model.new_bool_var(f"group_before_{group_id}_{day}_{period}")
                after = model.new_bool_var(f"group_after_{group_id}_{day}_{period}")
                prior = [group_occ[(group_id, day, p)] for p in teaching_periods[:index]]
                later = [group_occ[(group_id, day, p)] for p in teaching_periods[index + 1:]]
                if prior:
                    model.add_max_equality(before, prior)
                else:
                    model.add(before == 0)
                if later:
                    model.add_max_equality(after, later)
                else:
                    model.add(after == 0)
                gap = model.new_bool_var(f"group_gap_{group_id}_{day}_{period}")
                model.add_bool_and([before, after, group_occ[(group_id, day, period)].Not()]).only_enforce_if(gap)
                model.add_bool_or([before.Not(), after.Not(), group_occ[(group_id, day, period)], gap])
                gaps.append(gap)
            objective_terms.extend(gaps)
            # S3: 3 penalty points for each group hour above six in a day.
            hours = sum(group_occ[(group_id, day, p)] for p in teaching_periods)
            excess = model.new_int_var(0, len(teaching_periods), f"group_excess_{group_id}_{day}")
            model.add(excess >= hours - 6)
            objective_terms.append(3 * excess)

    # S4: repeated non-basket lecture for a group/course and repeated basket
    # course on a day each cost 3 points for every occurrence beyond the first.
    lecture_counts: dict[tuple[str, str, str], list[cp_model.IntVar]] = defaultdict(list)
    basket_course_counts: dict[tuple[str, str], list[cp_model.IntVar]] = defaultdict(list)
    for session in sessions:
        if session.kind == "lecture" and not session.basket_slot:
            for group_id in sorted(session_groups_by_id.get(session.source_id, set())):
                for day, start in session_candidates[session.source_id]:
                    lecture_counts[(group_id, session.course_source_id, day)].append(session_y[(session.source_id, day, start)])
        if session.basket_slot:
            for day, start in session_candidates[session.source_id]:
                basket_course_counts[(session.course_source_id, day)].append(session_y[(session.source_id, day, start)])
    for label, buckets in (("lecture", lecture_counts), ("basket_course", basket_course_counts)):
        for key, terms in sorted(buckets.items()):
            excess = model.new_int_var(0, len(terms), f"repeat_{label}_{'_'.join(map(str, key))}")
            model.add(excess >= sum(terms) - 1)
            objective_terms.append(3 * excess)

    # Exams use exam-week slots. They are a separate calendar from teaching.
    exam_calendar = (calendar.get("exam_week") or {})
    exam_days = list(exam_calendar.get("days") or [])
    exam_slots = [str(slot["id"]) for slot in exam_calendar.get("sessions", [])]
    exam_y: dict[tuple[str, str, str], cp_model.IntVar] = {}
    exam_z: dict[tuple[str, str, str, str], cp_model.IntVar] = {}
    exam_candidates: dict[str, list[tuple[str, str]]] = defaultdict(list)
    exam_room_use: dict[tuple[str, str, str], list[cp_model.IntVar]] = defaultdict(list)
    exam_group_use: dict[tuple[str, str, str], list[cp_model.IntVar]] = defaultdict(list)
    no_candidate_exams: list[str] = []
    exam_rooms = [room for room in rooms if "exam" in (room.allowed_uses or [])]
    for exam in exams:
        baseline_exam = baseline_exam_assignments.get(exam.source_id)
        candidate_exam_rooms = exam_rooms
        if repair_mode and baseline_exam is not None:
            candidate_exam_rooms = [room for room in exam_rooms if room.source_id in baseline_exam[2]]
        if not exam_days or not exam_slots:
            no_candidate_exams.append(exam.source_id)
            continue
        for day in exam_days:
            if repair_mode and baseline_exam is not None and day != baseline_exam[0]:
                continue
            for slot in exam_slots:
                if repair_mode and baseline_exam is not None and slot != baseline_exam[1]:
                    continue
                key = (exam.source_id, day, slot)
                y = model.new_bool_var(f"exam_{exam.source_id}_{day}_{slot}")
                exam_y[key] = y
                exam_candidates[exam.source_id].append((day, slot))
                room_vars = []
                for room in candidate_exam_rooms:
                    z = model.new_bool_var(f"exam_room_{exam.source_id}_{day}_{slot}_{room.source_id}")
                    exam_z[(exam.source_id, day, slot, room.source_id)] = z
                    model.add(z <= y)
                    room_vars.append(z)
                    exam_room_use[(room.source_id, day, slot)].append(z)
                model.add(sum(room.capacity // 2 * z for room, z in zip(exam_rooms, room_vars)) >= exam.size * y)
                for group_id in exam.group_ids or []:
                    exam_group_use[(group_id, day, slot)].append(y)
        if not exam_candidates[exam.source_id]:
            no_candidate_exams.append(exam.source_id)
        model.add(sum(exam_y[(exam.source_id, day, slot)] for day, slot in exam_candidates[exam.source_id]) == 1)
        if baseline_exam is not None:
            original_day, original_slot, original_rooms = baseline_exam
            for day, slot in exam_candidates[exam.source_id]:
                selected = int((day, slot) == (original_day, original_slot))
                model.add(exam_y[(exam.source_id, day, slot)] == selected)
                for room in exam_rooms:
                    room_var = exam_z.get((exam.source_id, day, slot, room.source_id))
                    if room_var is not None:
                        model.add(room_var == int(selected and room.source_id in original_rooms))
    if no_candidate_exams:
        raise InfeasibleTimetableError("No legal exam calendar slot for exam(s): " + ", ".join(sorted(set(no_candidate_exams))))
    for terms in exam_room_use.values():
        model.add_at_most_one(terms)
    for terms in exam_group_use.values():
        model.add_at_most_one(terms)
    exam_day_counts: dict[tuple[str, str], list[cp_model.IntVar]] = defaultdict(list)
    for exam in exams:
        for group_id in exam.group_ids or []:
            for day in exam_days:
                exam_day_counts[(group_id, day)].extend(
                    exam_y[(exam.source_id, day, slot)] for candidate_day, slot in exam_candidates[exam.source_id] if candidate_day == day
                )
    for (group_id, day), terms in exam_day_counts.items():
        excess = model.new_int_var(0, len(terms), f"exam_repeat_{group_id}_{day}")
        model.add(excess >= sum(terms) - 1)
        objective_terms.append(5 * excess)

    model.minimize(sum(objective_terms))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(1.0, float(time_limit_seconds))
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 0
    # A repair only needs a hard-constraint-feasible proposal for human review.
    # Stop once CP-SAT finds one instead of spending the full time budget
    # proving that no better objective value exists.
    solver.parameters.stop_after_first_solution = repair_mode
    if hint_assignments:
        for key, variable in session_y.items():
            session_id, day, start = key
            baseline = hint_assignments.get(session_id)
            if baseline is not None:
                model.add_hint(variable, int((day, start) == baseline[:2]))
        for key, variable in session_x.items():
            session_id, day, start, room_id = key
            baseline = hint_assignments.get(session_id)
            if baseline is not None:
                model.add_hint(variable, int(baseline == (day, start, room_id)))
    if hint_exam_assignments:
        for key, variable in exam_y.items():
            exam_id, day, slot = key
            baseline = hint_exam_assignments.get(exam_id)
            if baseline is not None:
                model.add_hint(variable, int((day, slot) == baseline[:2]))
        for key, variable in exam_z.items():
            exam_id, day, slot, room_id = key
            baseline = hint_exam_assignments.get(exam_id)
            if baseline is not None:
                model.add_hint(variable, int((day, slot) == baseline[:2] and room_id in baseline[2]))
    started = perf_counter()
    status_code = solver.solve(model)
    solve_time_seconds = perf_counter() - started
    if status_code == cp_model.INFEASIBLE:
        raise InfeasibleTimetableError("The dataset is infeasible under its hard timetable and exam constraints")
    if status_code not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise TimetableTimeoutError(f"CP-SAT did not find a complete feasible schedule (status: {solver.status_name(status_code)})")

    assignment: dict[str, tuple[str, int, str]] = {}
    for key, variable in session_x.items():
        if solver.boolean_value(variable):
            source_id, day, start, room_id = key
            if source_id in assignment:
                raise TimetableSolveError(f"Internal solver error: multiple placements selected for {source_id}")
            assignment[source_id] = (day, start, room_id)
    if len(assignment) != len(sessions):
        raise TimetableSolveError(f"CP-SAT returned an incomplete timetable: {len(assignment)}/{len(sessions)} sessions")
    exam_assignment: dict[str, tuple[str, str, list[str]]] = {}
    for (exam_id, day, slot), variable in exam_y.items():
        if solver.boolean_value(variable):
            exam_assignment[exam_id] = (day, slot, sorted(
                room_id for (candidate_exam, candidate_day, candidate_slot, room_id), room_var in exam_z.items()
                if (candidate_exam, candidate_day, candidate_slot) == (exam_id, day, slot) and solver.boolean_value(room_var)
            ))
    if len(exam_assignment) != len(exams) or any(not rooms_used for _day, _slot, rooms_used in exam_assignment.values()):
        raise TimetableSolveError(f"CP-SAT returned an incomplete exam plan: {len(exam_assignment)}/{len(exams)} exams")
    penalties, total, exam_penalty = _score_solution(
        sessions, session_groups_by_id, faculty_by_id, room_by_id, assignment, exam_assignment, exams, days,
    )
    status = "optimal" if status_code == cp_model.OPTIMAL else "feasible"
    return SolverSolution(
        status=status,
        assignments=assignment,
        exam_assignments=exam_assignment,
        soft_penalties=penalties,
        soft_total=total,
        exam_soft_penalty=exam_penalty,
        objective=int(round(solver.objective_value)),
        best_bound=float(solver.best_objective_bound),
        solve_time_seconds=solve_time_seconds,
        changed_session_ids=sorted(
            session_id for session_id in set(assignment) | set(baseline_assignments) | removed_session_ids
            if assignment.get(session_id) != baseline_assignments.get(session_id)
        ),
    )


def generate_schedule(
    db: Session,
    dataset_id: UUID,
    *,
    team: str = "AXIOM",
    time_limit_seconds: float = 120,
    warm_start_schedule_id: UUID | None = None,
    created_by_user_id: UUID | None = None,
) -> SolveResult:
    """Solve and persist a full session and exam schedule for one dataset."""
    transaction = db.begin_nested() if db.in_transaction() else db.begin()
    with transaction:
        dataset = db.scalar(select(Dataset).where(Dataset.id == dataset_id).with_for_update())
        if dataset is None:
            raise LookupError("Dataset not found")
        removed_session_ids = _approved_removed_session_ids(db, dataset_id)
        sessions = db.scalars(select(TimetableSession).where(
            TimetableSession.dataset_id == dataset_id,
            TimetableSession.source_id.not_in(removed_session_ids) if removed_session_ids else True,
        ).order_by(TimetableSession.source_id)).all()
        courses = db.scalars(select(Course).where(Course.dataset_id == dataset_id).order_by(Course.source_id)).all()
        faculties = db.scalars(select(Faculty).where(Faculty.dataset_id == dataset_id).order_by(Faculty.source_id)).all()
        groups = db.scalars(select(StudentGroup).where(StudentGroup.dataset_id == dataset_id).order_by(StudentGroup.source_id)).all()
        rooms = db.scalars(select(Room).where(Room.dataset_id == dataset_id).order_by(Room.source_id)).all()
        unavailability = db.scalars(select(RoomUnavailability).where(RoomUnavailability.dataset_id == dataset_id)).all()
        exams = db.scalars(select(Examination).where(Examination.dataset_id == dataset_id).order_by(Examination.source_id)).all()
        linked_groups = db.execute(select(session_groups.c.session_source_id, session_groups.c.group_source_id).where(session_groups.c.dataset_id == dataset_id)).all()
        warm_assignments = None
        warm_exam_assignments = None
        if warm_start_schedule_id is not None:
            warm_schedule = db.scalar(select(Schedule).where(
                Schedule.id == warm_start_schedule_id,
                Schedule.dataset_id == dataset_id,
            ))
            if warm_schedule is None:
                raise LookupError("Warm-start schedule not found for dataset")
            assignment_rows = db.scalars(select(ScheduleSessionAssignment).where(
                ScheduleSessionAssignment.dataset_id == dataset_id,
                ScheduleSessionAssignment.schedule_id == warm_start_schedule_id,
            )).all()
            warm_assignments = {
                row.session_source_id: (row.day, row.start_period, row.room_source_id)
                for row in assignment_rows
            }
            expected_sessions = {session.source_id for session in sessions}
            if set(warm_assignments) != expected_sessions:
                raise TimetableSolveError("Warm-start schedule does not contain exactly the active dataset sessions")
            warm_exam_rows = db.scalars(select(ExamRoomAllocation).where(
                ExamRoomAllocation.dataset_id == dataset_id,
                ExamRoomAllocation.schedule_id == warm_start_schedule_id,
            ).order_by(ExamRoomAllocation.examination_source_id, ExamRoomAllocation.room_source_id)).all()
            warm_exam_assignments = {}
            for row in warm_exam_rows:
                current = warm_exam_assignments.get(row.examination_source_id)
                if current is not None and current[:2] != (row.day, row.session):
                    raise TimetableSolveError("Warm-start schedule has inconsistent exam allocation slots")
                warm_exam_assignments.setdefault(row.examination_source_id, (row.day, row.session, []))[2].append(row.room_source_id)
            if set(warm_exam_assignments) != {exam.source_id for exam in exams} or any(not value[2] for value in warm_exam_assignments.values()):
                raise TimetableSolveError("Warm-start schedule does not contain complete exam allocations")
        solution = _build_and_solve(
            dataset, sessions, courses, faculties, groups, rooms, unavailability, linked_groups, exams, time_limit_seconds,
            hint_assignments=warm_assignments,
            hint_exam_assignments=warm_exam_assignments,
        )

        schedule_source_id = f"cp-sat-{uuid4()}"
        schedule = Schedule(dataset_id=dataset_id, source_id=schedule_source_id, team=team, created_by_user_id=created_by_user_id)
        db.add(schedule)
        db.flush()
        db.add_all([
            ScheduleSessionAssignment(
                schedule_id=schedule.id,
                dataset_id=dataset_id,
                session_source_id=session_id,
                room_source_id=room_id,
                day=day,
                start_period=start,
            )
            for session_id, (day, start, room_id) in solution.assignments.items()
        ])
        db.add_all([
            ExamRoomAllocation(
                schedule_id=schedule.id,
                dataset_id=dataset_id,
                examination_source_id=exam_id,
                room_source_id=room_id,
                day=day,
                session=slot,
            )
            for exam_id, (day, slot, room_ids) in solution.exam_assignments.items()
            for room_id in room_ids
        ])
        db.flush()
        return SolveResult(
            status=solution.status,
            soft_penalties=solution.soft_penalties,
            soft_total=solution.soft_total,
            exam_soft_penalty=solution.exam_soft_penalty,
            scheduled_sessions=len(solution.assignments),
            scheduled_exams=len(solution.exam_assignments),
            schedule_id=schedule.id,
            source_id=schedule.source_id,
            solver_objective=solution.objective,
            best_objective_bound=solution.best_bound,
            solve_time_seconds=solution.solve_time_seconds,
        )


def get_schedule_assignments(
    db: Session,
    dataset_id: UUID,
    schedule_id: UUID,
    *,
    day: str | None = None,
    faculty_id: str | None = None,
    room_id: str | None = None,
    course_id: str | None = None,
    group_id: str | None = None,
) -> dict[str, Any]:
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise LookupError("Dataset not found")
    schedule = db.scalar(select(Schedule).where(Schedule.id == schedule_id, Schedule.dataset_id == dataset_id))
    if schedule is None:
        raise LookupError("Schedule not found for dataset")
    removed_session_ids = _approved_removed_session_ids(db, dataset_id)
    dataset_session_ids = set(db.scalars(select(TimetableSession.source_id).where(
        TimetableSession.dataset_id == dataset_id,
    )).all())
    active_session_ids = dataset_session_ids - removed_session_ids
    rows = db.execute(
        select(
            ScheduleSessionAssignment.session_source_id,
            ScheduleSessionAssignment.day,
            ScheduleSessionAssignment.start_period,
            TimetableSession.course_source_id,
            TimetableSession.faculty_source_id,
            TimetableSession.kind,
            TimetableSession.duration,
            Course.title,
            Course.department,
            Course.year,
            Faculty.name,
            Room.source_id,
            Room.name,
            session_groups.c.group_source_id,
            StudentGroup.name,
        )
        .select_from(ScheduleSessionAssignment)
        .join(TimetableSession, (TimetableSession.dataset_id == ScheduleSessionAssignment.dataset_id)
              & (TimetableSession.source_id == ScheduleSessionAssignment.session_source_id))
        .outerjoin(Course, (Course.dataset_id == TimetableSession.dataset_id)
                   & (Course.source_id == TimetableSession.course_source_id))
        .outerjoin(Faculty, (Faculty.dataset_id == TimetableSession.dataset_id)
                   & (Faculty.source_id == TimetableSession.faculty_source_id))
        .outerjoin(Room, (Room.dataset_id == ScheduleSessionAssignment.dataset_id)
                   & (Room.source_id == ScheduleSessionAssignment.room_source_id))
        .outerjoin(session_groups, (session_groups.c.dataset_id == ScheduleSessionAssignment.dataset_id)
                   & (session_groups.c.session_source_id == ScheduleSessionAssignment.session_source_id))
        .outerjoin(StudentGroup, (StudentGroup.dataset_id == session_groups.c.dataset_id)
                   & (StudentGroup.source_id == session_groups.c.group_source_id))
        .where(
            ScheduleSessionAssignment.dataset_id == dataset_id,
            ScheduleSessionAssignment.schedule_id == schedule_id,
        )
        .order_by(ScheduleSessionAssignment.session_source_id, session_groups.c.group_source_id)
    ).all()
    by_session: dict[str, dict[str, Any]] = {}
    for row in rows:
        sid = row[0]
        item = by_session.get(sid)
        if item is None:
            item = {
                "session_id": sid,
                "course_id": row[3],
                "course_name": row[7] or row[3],
                "department": row[8] or "",
                "year": row[9] or 0,
                "kind": row[5],
                "duration": row[6],
                "faculty_id": row[4],
                "faculty_name": row[10] or row[4],
                "day": row[1],
                "start_period": row[2],
                "end_period": row[2] + row[6] - 1,
                "room_id": row[11] or "",
                "room_name": row[12] or row[11] or "",
                "student_groups": [],
            }
            by_session[sid] = item
        if row[13] is not None:
            item["student_groups"].append({"id": row[13], "name": row[14] or row[13]})
    scheduled_session_ids = set(by_session)
    enriched = []
    for item in by_session.values():
        group_ids = {group["id"] for group in item["student_groups"]}
        if day and item["day"] != day:
            continue
        if faculty_id and item["faculty_id"] != faculty_id:
            continue
        if room_id and item["room_id"] != room_id:
            continue
        if course_id and item["course_id"] != course_id:
            continue
        if group_id and group_id not in group_ids:
            continue
        item["student_groups"].sort(key=lambda group: group["id"])
        enriched.append(item)
    enriched.sort(key=lambda item: item["session_id"])
    return {
        "schedule_id": str(schedule.id),
        "dataset_id": str(dataset_id),
        # Historical schedules retain the sessions that were active when they
        # were created; post-disruption schedules omit approved removals.
        "status": "complete" if scheduled_session_ids in (dataset_session_ids, active_session_ids) else "incomplete",
        "assignments": enriched,
    }


def export_schedule(db: Session, dataset_id: UUID, schedule_id: UUID) -> dict[str, Any]:
    data = get_schedule_assignments(db, dataset_id, schedule_id)
    if data["status"] != "complete":
        raise TimetableSolveError("Cannot export an incomplete timetable")
    schedule = db.scalar(select(Schedule).where(Schedule.id == schedule_id, Schedule.dataset_id == dataset_id))
    dataset = db.get(Dataset, dataset_id)
    exams = db.execute(select(
        ExamRoomAllocation.examination_source_id,
        ExamRoomAllocation.day,
        ExamRoomAllocation.session,
        ExamRoomAllocation.room_source_id,
    ).where(
        ExamRoomAllocation.dataset_id == dataset_id,
        ExamRoomAllocation.schedule_id == schedule_id,
    ).order_by(ExamRoomAllocation.examination_source_id, ExamRoomAllocation.room_source_id)).all()
    by_exam: dict[tuple[str, str, str], list[str]] = defaultdict(list)
    for exam_id, day, exam_session, room_id in exams:
        by_exam[(exam_id, day, exam_session)].append(room_id)
    expected_exams = db.scalar(select(func.count()).select_from(Examination).where(Examination.dataset_id == dataset_id))
    if len(by_exam) != expected_exams:
        raise TimetableSolveError(f"Cannot export an incomplete exam plan: {len(by_exam)}/{expected_exams} exams")
    export_exams = [
        {"exam_id": exam_id, "day": day, "session": exam_session, "rooms": room_ids}
        for (exam_id, day, exam_session), room_ids in sorted(by_exam.items())
    ]
    return {
        "team": schedule.team,
        "dataset_id": dataset.source_dataset_id,
        "sessions": [{
            "session_id": row["session_id"],
            "day": row["day"],
            "start_period": row["start_period"],
            "room_id": row["room_id"],
        } for row in data["assignments"]],
        "exams": export_exams,
    }
