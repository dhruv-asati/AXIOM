from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from hashlib import sha256
import json
from types import SimpleNamespace
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Course,
    Dataset,
    Examination,
    ExamRoomAllocation,
    Faculty,
    Room,
    RoomUnavailability,
    Schedule,
    ScheduleOverride,
    ScheduleRepairProposal,
    ScheduleSessionAssignment,
    StudentGroup,
    TimetableSession,
)
from app.models.entities import session_groups
from app.services.ai.schemas import DisruptionChange, DisruptionRequest
from app.services.timetable.solver import (
    InfeasibleTimetableError,
    SolverSolution,
    TimetableTimeoutError,
    _build_and_solve,
)


class RepairError(RuntimeError):
    """Base error for disruption repair workflows."""


class RepairInfeasibleError(RepairError):
    """No assignment can satisfy the hard constraints after the disruption."""


class RepairTimeoutError(RepairError):
    """CP-SAT did not find a complete repair before the time limit."""


REPAIR_CHANGE_WEIGHT = 100
REPAIR_GROUP_WEIGHT = 5


def _input_fingerprint(dataset, sessions, faculties, rooms, groups, courses, exams, unavailable, assignments, allocations, removed_ids) -> str:
    """Hash the source records and baseline rows used to solve a proposal."""
    payload = {
        "calendar": dataset.calendar,
        "sessions": sorted((r.source_id, r.course_source_id, r.faculty_source_id, r.kind, r.size, r.duration, r.room_types, r.needs_accessible, r.basket_slot, r.fixed_slot) for r in sessions),
        "faculties": sorted((r.source_id, r.name, r.department, r.max_hours_per_day, r.needs_accessible, r.unavailable, r.preferences) for r in faculties),
        "rooms": sorted((r.source_id, r.name, r.type, r.capacity, r.features, r.accessible, r.allowed_uses) for r in rooms),
        "groups": sorted((r.source_id, r.name, r.year, r.department, r.size, r.needs_accessible) for r in groups),
        "courses": sorted((r.source_id, r.title, r.department, r.year, r.lecture_hours, r.tutorial_hours, r.lab_blocks) for r in courses),
        "exams": sorted((r.source_id, r.course_ids, r.group_ids, r.size, r.duration_hours) for r in exams),
        "room_unavailability": sorted((r.room_source_id, r.day, r.periods, r.reason) for r in unavailable),
        "baseline_assignments": sorted((r.session_source_id, r.day, r.start_period, r.room_source_id) for r in assignments),
        "baseline_exam_allocations": sorted((r.examination_source_id, r.day, r.session, r.room_source_id) for r in allocations),
        "removed_session_ids": sorted(removed_ids),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return sha256(canonical.encode("utf-8")).hexdigest()


def _active_removed_session_ids(db: Session, dataset_id: UUID) -> set[str]:
    rows = db.scalars(
        select(ScheduleRepairProposal.changes).where(
            ScheduleRepairProposal.dataset_id == dataset_id,
            ScheduleRepairProposal.status == "approved",
        )
    ).all()
    return {
        change["session_id"]
        for changes in rows
        for change in (changes or [])
        if change.get("type") == "remove_session"
    }


def _namespace_session(row: TimetableSession) -> SimpleNamespace:
    return SimpleNamespace(
        source_id=row.source_id,
        course_source_id=row.course_source_id,
        faculty_source_id=row.faculty_source_id,
        kind=row.kind,
        size=row.size,
        duration=row.duration,
        room_types=list(row.room_types or []),
        needs_accessible=row.needs_accessible,
        basket_slot=row.basket_slot,
        fixed_slot=row.fixed_slot,
    )


def _namespace_faculty(row: Faculty) -> SimpleNamespace:
    return SimpleNamespace(
        source_id=row.source_id,
        name=row.name,
        department=row.department,
        max_hours_per_day=row.max_hours_per_day,
        needs_accessible=row.needs_accessible,
        unavailable=list(row.unavailable or []),
        preferences=list(row.preferences or []),
    )


def _namespace_room(row: Room) -> SimpleNamespace:
    return SimpleNamespace(
        source_id=row.source_id,
        name=row.name,
        type=row.type,
        capacity=row.capacity,
        accessible=row.accessible,
        allowed_uses=list(row.allowed_uses or []),
    )


def _affected_sessions(changes, baseline, sessions_by_id, group_map) -> set[str]:
    affected: set[str] = set()
    for change in changes:
        if change.type == "faculty_unavailable":
            days, periods = set(change.days), set(change.periods)
            affected.update(
                sid for sid, placement in baseline.items()
                if sid in sessions_by_id
                and sessions_by_id[sid].faculty_source_id == change.faculty_id
                and placement[0] in days
                and periods.intersection(range(placement[1], placement[1] + sessions_by_id[sid].duration))
            )
        elif change.type == "room_unavailable":
            days, periods = set(change.days), set(change.periods)
            affected.update(
                sid for sid, placement in baseline.items()
                if sid in sessions_by_id
                and placement[2] == change.room_id
                and placement[0] in days
                and periods.intersection(range(placement[1], placement[1] + sessions_by_id[sid].duration))
            )
        elif change.type == "remove_session":
            affected.add(change.session_id)
        elif change.type == "add_session":
            added = change.session
            added_groups = set(added.groups)
            affected.add(added.id)
            affected.update(
                sid for sid in baseline
                if sid in sessions_by_id and (
                    sessions_by_id[sid].faculty_source_id == added.faculty_id
                    or bool(group_map.get(sid, set()) & added_groups)
                )
            )
    return affected


def _candidate_payload(solution: SolverSolution) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    assignments = [
        {"session_id": sid, "day": day, "start_period": start, "room_id": room}
        for sid, (day, start, room) in sorted(solution.assignments.items())
    ]
    exams = [
        {"exam_id": exam_id, "day": day, "session": slot, "rooms": rooms}
        for exam_id, (day, slot, rooms) in sorted(solution.exam_assignments.items())
    ]
    return assignments, exams


def _proposal_response(proposal: ScheduleRepairProposal) -> dict[str, Any]:
    return {
        "proposal_id": proposal.id,
        "dataset_id": proposal.dataset_id,
        "baseline_schedule_id": proposal.baseline_schedule_id,
        "approved_schedule_id": proposal.approved_schedule_id,
        "status": proposal.status,
        "changes": proposal.changes,
        "assignments": proposal.assignments,
        "exam_allocations": proposal.exam_allocations,
        "affected_session_ids": proposal.affected_session_ids,
        "changed_session_ids": proposal.changed_session_ids,
        "objective": proposal.objective,
        "explanation": proposal.explanation,
        "created_at": proposal.created_at,
        "decided_at": proposal.decided_at,
    }


def create_repair_proposal(
    db: Session,
    dataset_id: UUID,
    schedule_id: UUID,
    request: DisruptionRequest,
    *,
    time_limit_seconds: float = 60,
    created_by_user_id: UUID | None = None,
) -> dict[str, Any]:
    """Solve and persist a repair proposal without changing its baseline schedule."""
    transaction = db.begin_nested() if db.in_transaction() else db.begin()
    with transaction:
        dataset = db.scalar(select(Dataset).where(Dataset.id == dataset_id).with_for_update())
        if dataset is None:
            raise LookupError("Dataset not found")
        baseline_schedule = db.scalar(
            select(Schedule).where(Schedule.id == schedule_id, Schedule.dataset_id == dataset_id)
        )
        if baseline_schedule is None:
            raise LookupError("Schedule not found for dataset")

        all_sessions = db.scalars(
            select(TimetableSession).where(TimetableSession.dataset_id == dataset_id).order_by(TimetableSession.source_id)
        ).all()
        removed_already = _active_removed_session_ids(db, dataset_id)
        sessions_by_id = {row.source_id: _namespace_session(row) for row in all_sessions if row.source_id not in removed_already}
        session_rows = db.scalars(
            select(ScheduleSessionAssignment).where(
                ScheduleSessionAssignment.dataset_id == dataset_id,
                ScheduleSessionAssignment.schedule_id == schedule_id,
            )
        ).all()
        baseline = {row.session_source_id: (row.day, row.start_period, row.room_source_id) for row in session_rows}
        if set(baseline) != set(sessions_by_id):
            raise RepairError("The baseline schedule is incomplete or does not match active dataset sessions")

        faculties = db.scalars(select(Faculty).where(Faculty.dataset_id == dataset_id).order_by(Faculty.source_id)).all()
        faculty_by_id = {row.source_id: _namespace_faculty(row) for row in faculties}
        rooms_db = db.scalars(select(Room).where(Room.dataset_id == dataset_id).order_by(Room.source_id)).all()
        rooms_by_id = {row.source_id: _namespace_room(row) for row in rooms_db}
        groups = db.scalars(select(StudentGroup).where(StudentGroup.dataset_id == dataset_id).order_by(StudentGroup.source_id)).all()
        courses = db.scalars(select(Course).where(Course.dataset_id == dataset_id).order_by(Course.source_id)).all()
        exams = db.scalars(select(Examination).where(Examination.dataset_id == dataset_id).order_by(Examination.source_id)).all()
        all_group_rows = list(db.execute(
            select(session_groups.c.session_source_id, session_groups.c.group_source_id).where(session_groups.c.dataset_id == dataset_id)
        ).all())
        group_map: dict[str, set[str]] = defaultdict(set)
        for sid, gid in all_group_rows:
            group_map[sid].add(gid)
        for sid, session in sessions_by_id.items():
            session.groups = group_map.get(sid, set())

        unavailability = db.scalars(select(RoomUnavailability).where(RoomUnavailability.dataset_id == dataset_id)).all()
        unavailability_rows = [SimpleNamespace(room_source_id=r.room_source_id, day=r.day, periods=list(r.periods or [])) for r in unavailability]
        course_ids = {row.source_id for row in courses}
        group_ids = {row.source_id for row in groups}
        new_faculty_ids: set[str] = set()
        added_session_ids: set[str] = set()
        removed_session_ids: set[str] = set()
        periods = {int(p["id"]) for p in (dataset.calendar or {}).get("periods", []) if p.get("teaching")}
        days = set((dataset.calendar or {}).get("days", []))

        # Add faculty before validating new sessions, regardless of change ordering.
        for change in request.changes:
            if change.type != "add_faculty":
                continue
            record = change.faculty
            if record.id in faculty_by_id or db.scalar(select(Faculty.id).where(Faculty.dataset_id == dataset_id, Faculty.source_id == record.id)):
                raise RepairError(f"Faculty source ID {record.id!r} already exists")
            faculty_by_id[record.id] = SimpleNamespace(
                source_id=record.id, name=record.name, department=record.department,
                max_hours_per_day=record.max_hours_per_day, needs_accessible=record.needs_accessible,
                unavailable=[row.model_dump(mode="json") for row in record.unavailable],
                preferences=[row.model_dump(mode="json") for row in record.preferences],
            )
            new_faculty_ids.add(record.id)

        for change in request.changes:
            if change.type == "faculty_unavailable":
                faculty = faculty_by_id.get(change.faculty_id)
                if faculty is None:
                    raise RepairError(f"Faculty {change.faculty_id!r} was not found in this dataset")
                if not set(change.days) <= days or not set(change.periods) <= periods:
                    raise RepairError("Faculty unavailability contains a non-teaching day or period")
                faculty.unavailable.extend({"day": day, "periods": list(change.periods), "reason": change.reason} for day in change.days)
            elif change.type == "room_unavailable":
                if change.room_id not in rooms_by_id:
                    raise RepairError(f"Room {change.room_id!r} was not found in this dataset")
                if not set(change.days) <= days or not set(change.periods) <= periods:
                    raise RepairError("Room unavailability contains a non-teaching day or period")
                unavailability_rows.extend(
                    SimpleNamespace(room_source_id=change.room_id, day=day, periods=list(change.periods))
                    for day in change.days
                )
            elif change.type == "add_session":
                record = change.session
                if record.id in sessions_by_id or db.scalar(select(TimetableSession.id).where(TimetableSession.dataset_id == dataset_id, TimetableSession.source_id == record.id)):
                    raise RepairError(f"Session source ID {record.id!r} already exists")
                if record.course_id not in course_ids:
                    raise RepairError(f"Course {record.course_id!r} for new session was not found in this dataset")
                if record.faculty_id not in faculty_by_id:
                    raise RepairError(f"Faculty {record.faculty_id!r} for new session was not found in this dataset")
                if not set(record.groups) <= group_ids:
                    raise RepairError("New session references a student group not found in this dataset")
                sessions_by_id[record.id] = SimpleNamespace(
                    source_id=record.id, course_source_id=record.course_id, faculty_source_id=record.faculty_id,
                    kind=record.kind, size=record.size, duration=record.duration, room_types=list(record.room_types),
                    needs_accessible=record.needs_accessible, basket_slot=record.basket_slot,
                    fixed_slot=record.fixed_slot.model_dump(mode="json") if record.fixed_slot else None,
                    groups=set(record.groups),
                )
                added_session_ids.add(record.id)
                for group_id in record.groups:
                    group_map[record.id].add(group_id)
                    all_group_rows.append((record.id, group_id))
            elif change.type == "remove_session":
                if change.session_id not in sessions_by_id:
                    raise RepairError(f"Session {change.session_id!r} was not found or is already removed")
                sessions_by_id.pop(change.session_id)
                removed_session_ids.add(change.session_id)

        base_exams = db.scalars(select(ExamRoomAllocation).where(
            ExamRoomAllocation.dataset_id == dataset_id,
            ExamRoomAllocation.schedule_id == schedule_id,
        ).order_by(ExamRoomAllocation.examination_source_id, ExamRoomAllocation.room_source_id)).all()
        exams_by_id: dict[str, tuple[str, str, list[str]]] = {}
        for row in base_exams:
            current = exams_by_id.get(row.examination_source_id)
            if current and current[:2] != (row.day, row.session):
                raise RepairError("The baseline exam allocations contain inconsistent slots")
            exams_by_id.setdefault(row.examination_source_id, (row.day, row.session, []))[2].append(row.room_source_id)
        if set(exams_by_id) != {exam.source_id for exam in exams}:
            raise RepairError("The baseline schedule has an incomplete exam allocation")

        try:
            solution = _build_and_solve(
                dataset,
                list(sessions_by_id.values()),
                courses,
                list(faculty_by_id.values()),
                groups,
                list(rooms_by_id.values()),
                unavailability_rows,
                all_group_rows,
                exams,
                time_limit_seconds,
                baseline_assignments=baseline,
                baseline_exam_assignments=exams_by_id,
                removed_session_ids=removed_session_ids,
                repair_change_weight=REPAIR_CHANGE_WEIGHT,
                repair_group_weight=REPAIR_GROUP_WEIGHT,
            )
        except InfeasibleTimetableError as exc:
            raise RepairInfeasibleError(f"No feasible repair exists: {exc}") from exc
        except TimetableTimeoutError as exc:
            raise RepairTimeoutError(str(exc)) from exc

        affected = _affected_sessions(request.changes, baseline, sessions_by_id, group_map)
        changed = set(solution.changed_session_ids)
        for sid in added_session_ids | removed_session_ids:
            changed.add(sid)
        changed_group_ids = {gid for sid in changed for gid in group_map.get(sid, set())}
        assignments, exam_allocations = _candidate_payload(solution)
        penalties = {
            **solution.soft_penalties,
            "exam": solution.exam_soft_penalty,
            "changed_sessions": len(changed),
            "affected_student_groups": len(changed_group_ids),
        }
        explanation = (
            f"Feasible repair proposed: {len(changed)} session assignment(s) change and "
            f"{len(changed_group_ids)} student group(s) are affected. "
            f"Official timetable soft penalty is {solution.soft_total}; exam penalty is {solution.exam_soft_penalty}. "
            "The baseline schedule remains unchanged until explicit approval."
        )
        proposal = ScheduleRepairProposal(
            dataset_id=dataset_id,
            baseline_schedule_id=schedule_id,
            status="proposed",
            created_by_user_id=created_by_user_id,
            input_fingerprint=_input_fingerprint(
                dataset, all_sessions, faculties, rooms_db, groups, courses, exams,
                unavailability, session_rows, base_exams, removed_already,
            ),
            changes=[change.model_dump(mode="json") for change in request.changes],
            assignments=assignments,
            exam_allocations=exam_allocations,
            affected_session_ids=sorted(affected),
            changed_session_ids=sorted(changed),
            objective={
                "soft_penalties": solution.soft_penalties,
                "soft_total": solution.soft_total,
                "exam_soft_penalty": solution.exam_soft_penalty,
                "solver_objective": solution.objective,
                "best_objective_bound": solution.best_bound,
                "solve_time_seconds": solution.solve_time_seconds,
                "status": solution.status,
                "change_weight": REPAIR_CHANGE_WEIGHT,
                "affected_group_weight": REPAIR_GROUP_WEIGHT,
                "changed_session_count": len(changed),
                "affected_group_count": len(changed_group_ids),
            },
            explanation=explanation,
        )
        db.add(proposal)
        db.flush()
        return _proposal_response(proposal)


def get_repair_proposal(db: Session, dataset_id: UUID, schedule_id: UUID, proposal_id: UUID) -> dict[str, Any]:
    proposal = db.scalar(select(ScheduleRepairProposal).where(
        ScheduleRepairProposal.id == proposal_id,
        ScheduleRepairProposal.dataset_id == dataset_id,
        ScheduleRepairProposal.baseline_schedule_id == schedule_id,
    ))
    if proposal is None:
        raise LookupError("Repair proposal not found for this dataset and baseline schedule")
    return _proposal_response(proposal)


def list_repair_proposals(db: Session, dataset_id: UUID) -> list[dict[str, Any]]:
    rows = db.scalars(select(ScheduleRepairProposal).where(
        ScheduleRepairProposal.dataset_id == dataset_id,
    ).order_by(ScheduleRepairProposal.created_at.desc(), ScheduleRepairProposal.id)).all()
    return [_proposal_response(row) for row in rows]


def approve_repair_proposal(
    db: Session, dataset_id: UUID, schedule_id: UUID, proposal_id: UUID, *,
    decided_by_user_id: UUID | None = None, persist_disruption_changes: bool = True,
) -> dict[str, Any]:
    transaction = db.begin_nested() if db.in_transaction() else db.begin()
    with transaction:
        dataset = db.scalar(select(Dataset).where(Dataset.id == dataset_id).with_for_update())
        if dataset is None:
            raise LookupError("Dataset not found")
        proposal = db.scalar(select(ScheduleRepairProposal).where(
            ScheduleRepairProposal.id == proposal_id,
            ScheduleRepairProposal.dataset_id == dataset_id,
            ScheduleRepairProposal.baseline_schedule_id == schedule_id,
        ).with_for_update())
        if proposal is None:
            raise LookupError("Repair proposal not found for this dataset and baseline schedule")
        if proposal.status != "proposed":
            raise RepairError(f"Repair proposal is already {proposal.status}")
        if decided_by_user_id is not None and proposal.created_by_user_id == decided_by_user_id:
            raise RepairError("A user cannot approve their own repair proposal")
        baseline_schedule = db.scalar(select(Schedule).where(
            Schedule.id == schedule_id, Schedule.dataset_id == dataset_id,
        ))
        if baseline_schedule is None:
            raise LookupError("Baseline schedule not found for dataset")

        source_sessions = db.scalars(select(TimetableSession).where(TimetableSession.dataset_id == dataset_id)).all()
        source_faculties = db.scalars(select(Faculty).where(Faculty.dataset_id == dataset_id)).all()
        source_rooms = db.scalars(select(Room).where(Room.dataset_id == dataset_id)).all()
        source_groups = db.scalars(select(StudentGroup).where(StudentGroup.dataset_id == dataset_id)).all()
        source_courses = db.scalars(select(Course).where(Course.dataset_id == dataset_id)).all()
        source_exams = db.scalars(select(Examination).where(Examination.dataset_id == dataset_id)).all()
        source_unavailability = db.scalars(select(RoomUnavailability).where(RoomUnavailability.dataset_id == dataset_id)).all()
        source_assignments = db.scalars(select(ScheduleSessionAssignment).where(
            ScheduleSessionAssignment.dataset_id == dataset_id,
            ScheduleSessionAssignment.schedule_id == schedule_id,
        )).all()
        source_allocations = db.scalars(select(ExamRoomAllocation).where(
            ExamRoomAllocation.dataset_id == dataset_id,
            ExamRoomAllocation.schedule_id == schedule_id,
        )).all()
        current_fingerprint = _input_fingerprint(
            dataset, source_sessions, source_faculties, source_rooms, source_groups,
            source_courses, source_exams, source_unavailability, source_assignments,
            source_allocations, _active_removed_session_ids(db, dataset_id),
        )
        if current_fingerprint != proposal.input_fingerprint:
            raise RepairError("The dataset or baseline schedule changed after this proposal was generated; create a fresh proposal")

        from pydantic import TypeAdapter

        changes = [TypeAdapter(DisruptionChange).validate_python(change) for change in proposal.changes]
        for change in changes:
            if not persist_disruption_changes:
                continue
            if change.type == "faculty_unavailable":
                faculty = db.scalar(select(Faculty).where(
                    Faculty.dataset_id == dataset_id, Faculty.source_id == change.faculty_id,
                ).with_for_update())
                if faculty is None:
                    raise RepairError(f"Faculty {change.faculty_id!r} no longer exists")
                unavailable = list(faculty.unavailable or [])
                unavailable.extend({"day": day, "periods": list(change.periods), "reason": change.reason} for day in change.days)
                faculty.unavailable = unavailable
            elif change.type == "room_unavailable":
                room = db.scalar(select(Room).where(Room.dataset_id == dataset_id, Room.source_id == change.room_id))
                if room is None:
                    raise RepairError(f"Room {change.room_id!r} no longer exists")
                for day in change.days:
                    db.add(RoomUnavailability(
                        dataset_id=dataset_id, room_source_id=change.room_id,
                        day=day, periods=list(change.periods), reason=change.reason,
                    ))
            elif change.type == "add_faculty":
                record = change.faculty
                if db.scalar(select(Faculty.id).where(Faculty.dataset_id == dataset_id, Faculty.source_id == record.id)):
                    raise RepairError(f"Faculty source ID {record.id!r} was added after this proposal")
                db.add(Faculty(
                    dataset_id=dataset_id, source_id=record.id, name=record.name,
                    department=record.department, max_hours_per_day=record.max_hours_per_day,
                    needs_accessible=record.needs_accessible,
                    unavailable=[row.model_dump(mode="json") for row in record.unavailable],
                    preferences=[row.model_dump(mode="json") for row in record.preferences],
                ))
            elif change.type == "add_session":
                record = change.session
                if db.scalar(select(TimetableSession.id).where(TimetableSession.dataset_id == dataset_id, TimetableSession.source_id == record.id)):
                    raise RepairError(f"Session source ID {record.id!r} was added after this proposal")
                db.add(TimetableSession(
                    dataset_id=dataset_id, source_id=record.id, course_source_id=record.course_id,
                    faculty_source_id=record.faculty_id, kind=record.kind, size=record.size,
                    duration=record.duration, room_types=list(record.room_types),
                    needs_accessible=record.needs_accessible, basket_slot=record.basket_slot,
                    fixed_slot=record.fixed_slot.model_dump(mode="json") if record.fixed_slot else None,
                ))
                db.flush()
                for group_id in record.groups:
                    db.execute(session_groups.insert().values(
                        dataset_id=dataset_id, session_source_id=record.id, group_source_id=group_id,
                    ))
            # Removed sessions remain stored for historical schedule FKs. Approved
            # proposal records exclude them from future solver input.

        schedule = Schedule(
            dataset_id=dataset_id,
            source_id=f"repair-{proposal.id}",
            team=baseline_schedule.team,
        )
        db.add(schedule)
        db.flush()
        db.add_all([
            ScheduleSessionAssignment(
                schedule_id=schedule.id, dataset_id=dataset_id,
                session_source_id=row["session_id"], room_source_id=row["room_id"],
                day=row["day"], start_period=row["start_period"],
            )
            for row in proposal.assignments
        ])
        db.add_all([
            ExamRoomAllocation(
                schedule_id=schedule.id, dataset_id=dataset_id,
                examination_source_id=row["exam_id"], room_source_id=room_id,
                day=row["day"], session=row["session"],
            )
            for row in proposal.exam_allocations for room_id in row["rooms"]
        ])
        assignment_by_id = {row["session_id"]: row for row in proposal.assignments}
        db.add_all([
            ScheduleOverride(
                schedule_id=schedule.id, dataset_id=dataset_id,
                session_source_id=session_id, day=row["day"],
                start_period=row["start_period"], room_source_id=row["room_id"],
                displaced_by=f"repair-proposal:{proposal.id}",
            )
            for session_id in proposal.changed_session_ids
            if (row := assignment_by_id.get(session_id)) is not None
        ])
        proposal.status = "approved"
        proposal.approved_schedule_id = schedule.id
        proposal.decided_at = datetime.now(timezone.utc)
        proposal.decided_by_user_id = decided_by_user_id
        db.flush()
        return _proposal_response(proposal)


def reject_repair_proposal(
    db: Session,
    dataset_id: UUID,
    schedule_id: UUID,
    proposal_id: UUID,
    reason: str,
    *,
    decided_by_user_id: UUID | None = None,
) -> dict[str, Any]:
    transaction = db.begin_nested() if db.in_transaction() else db.begin()
    with transaction:
        proposal = db.scalar(select(ScheduleRepairProposal).where(
            ScheduleRepairProposal.id == proposal_id,
            ScheduleRepairProposal.dataset_id == dataset_id,
            ScheduleRepairProposal.baseline_schedule_id == schedule_id,
        ).with_for_update())
        if proposal is None:
            raise LookupError("Repair proposal not found for this dataset and baseline schedule")
        if proposal.status != "proposed":
            raise RepairError(f"Repair proposal is already {proposal.status}")
        if decided_by_user_id is not None and proposal.created_by_user_id == decided_by_user_id:
            raise RepairError("A user cannot decide their own repair proposal")
        proposal.status = "rejected"
        proposal.explanation = f"{proposal.explanation} Rejected: {reason.strip()}"
        proposal.decided_at = datetime.now(timezone.utc)
        proposal.decided_by_user_id = decided_by_user_id
        db.flush()
        return _proposal_response(proposal)
