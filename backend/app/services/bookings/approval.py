from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    BookingClassMoveProposal, BookingOutcome, BookingRequest, Cancellation, Dataset,
    ExamRoomAllocation, Room, RoomUnavailability, Schedule, ScheduleRepairProposal,
    ScheduleSessionAssignment, TimetableSession,
)
from app.models.entities import session_groups
from app.services.ai.schemas import DisruptionRequest
from app.services.disruptions.repair import RepairError, approve_repair_proposal, create_repair_proposal


class BookingApprovalError(RuntimeError):
    pass


def _request_fingerprint(request: BookingRequest) -> str:
    values = {
        "source_id": request.source_id, "department": request.department,
        "submitted_at": request.submitted_at, "title": request.title,
        "attendance": request.attendance, "duration_periods": request.duration_periods,
        "windows": request.windows, "room_types": request.room_types, "needs": request.needs,
        "requested_room": request.requested_room, "mandatory_for_groups": request.mandatory_for_groups,
        "created_by_user_id": request.created_by_user_id,
    }
    canonical = json.dumps(values, sort_keys=True, separators=(",", ":"), default=str)
    return sha256(canonical.encode()).hexdigest()


def _slot_reason(
    db: Session,
    *,
    dataset: Dataset,
    request: BookingRequest,
    schedule_id: UUID,
    booking_schedule_id: UUID,
    room: Room,
    day: str,
    start: int,
    end: int,
) -> str | None:
    calendar = dataset.calendar or {}
    periods = {int(item["id"]) for item in calendar.get("periods", [])}
    if day not in set(calendar.get("days", [])) or any(period not in periods for period in range(start, end + 1)):
        return "Requested slot is outside the selected dataset calendar."
    lunch_after = (calendar.get("lunch") or {}).get("after_period")
    if lunch_after is not None and start <= int(lunch_after) < end:
        return "The requested booking crosses the campus lunch break."
    if not any(window.get("day") == day and int(window.get("from_period", 0)) <= start and int(window.get("to_period", 0)) >= end for window in request.windows or []):
        return "Requested slot is outside this booking request's submitted windows."
    if room.type.casefold() not in {value.casefold() for value in request.room_types or []}:
        return "The selected room type is not allowed by the booking request."
    if "event" not in (room.allowed_uses or []):
        return "The selected room is not approved for events."
    if room.capacity < request.attendance:
        return "The selected room does not have sufficient capacity."
    features = set(room.features or []) | ({"accessible"} if room.accessible else set())
    missing = set(request.needs or []) - features
    if missing:
        return "The selected room is missing required features: " + ", ".join(sorted(missing)) + "."
    unavailable = db.scalars(select(RoomUnavailability).where(
        RoomUnavailability.dataset_id == request.dataset_id,
        RoomUnavailability.room_source_id == room.source_id,
        RoomUnavailability.day == day,
    )).all()
    slot = set(range(start, end + 1))
    if any(slot.intersection(row.periods or []) for row in unavailable):
        return "The selected room is unavailable during the requested slot."

    sessions = {row.source_id: row for row in db.scalars(select(TimetableSession).where(TimetableSession.dataset_id == request.dataset_id))}
    assignments = db.scalars(select(ScheduleSessionAssignment).where(
        ScheduleSessionAssignment.dataset_id == request.dataset_id,
        ScheduleSessionAssignment.schedule_id == schedule_id,
        ScheduleSessionAssignment.day == day,
    )).all()
    busy_groups: set[str] = set()
    for assignment in assignments:
        session = sessions.get(assignment.session_source_id)
        if session is None:
            continue
        occupied = set(range(assignment.start_period, assignment.start_period + session.duration))
        if slot.intersection(occupied):
            if assignment.room_source_id == room.source_id:
                return f"The room conflicts with class {session.source_id} in the requested slot."
            busy_groups.update(db.scalars(select(session_groups.c.group_source_id).where(
                session_groups.c.dataset_id == request.dataset_id,
                session_groups.c.session_source_id == session.source_id,
            )).all())
    mandatory = set(request.mandatory_for_groups or [])
    if mandatory.intersection(busy_groups):
        return "A mandatory student group has a class during the requested slot."

    approved = db.scalars(select(BookingOutcome).where(
        BookingOutcome.dataset_id == request.dataset_id,
        BookingOutcome.schedule_id == booking_schedule_id,
        BookingOutcome.status == "approved",
        BookingOutcome.request_source_id != request.source_id,
    )).all()
    for outcome in approved:
        if outcome.day != day or outcome.start_period is None or outcome.end_period is None:
            continue
        if not slot.intersection(range(outcome.start_period, outcome.end_period + 1)):
            continue
        if outcome.room_source_id == room.source_id:
            return f"The room conflicts with approved booking {outcome.request_source_id}."
        other_request = db.scalar(select(BookingRequest).where(
            BookingRequest.dataset_id == request.dataset_id,
            BookingRequest.source_id == outcome.request_source_id,
        ))
        if other_request and mandatory.intersection(other_request.mandatory_for_groups or []):
            return f"A mandatory student group has approved booking {outcome.request_source_id} at this time."

    # Exam allocations do not map to periods in the source schema. Conservatively
    # reserve a room for the full day if the selected schedule allocates an exam there.
    exam_room = db.scalar(select(ExamRoomAllocation.id).where(
        ExamRoomAllocation.dataset_id == request.dataset_id,
        ExamRoomAllocation.schedule_id == schedule_id,
        ExamRoomAllocation.room_source_id == room.source_id,
        ExamRoomAllocation.day == day,
    ).limit(1))
    if exam_room is not None:
        return "The room is allocated to an exam on this day; the dataset does not define exam period mapping."
    return None


def decide_department_lab_booking(
    db: Session, *, dataset_id: UUID, schedule_id: UUID, request_source_id: str,
    coordinator_id: UUID, department: str, room_source_id: str | None,
    day: str | None, start_period: int | None, reject_reason: str | None = None,
) -> dict[str, Any]:
    with (db.begin_nested() if db.in_transaction() else db.begin()):
        dataset = db.scalar(select(Dataset).where(Dataset.id == dataset_id).with_for_update())
        request = db.scalar(select(BookingRequest).where(
            BookingRequest.dataset_id == dataset_id,
            BookingRequest.source_id == request_source_id,
        ).with_for_update())
        schedule = db.scalar(select(Schedule).where(Schedule.dataset_id == dataset_id, Schedule.id == schedule_id))
        if dataset is None or request is None or schedule is None:
            raise LookupError("Dataset, booking request, or schedule was not found")
        if request.department != department:
            raise PermissionError("This booking request belongs to another department")
        if not any("lab" in value.casefold() for value in (request.room_types or [])):
            raise BookingApprovalError("This request does not permit a lab room")
        if request.created_by_user_id == coordinator_id:
            raise PermissionError("A user cannot approve their own booking request")
        previous = db.scalar(select(BookingOutcome).where(
            BookingOutcome.dataset_id == dataset_id,
            BookingOutcome.schedule_id == schedule_id,
            BookingOutcome.request_source_id == request_source_id,
        ).with_for_update())
        if previous is not None:
            raise BookingApprovalError("This booking already has a decision for the selected schedule")
        if db.scalar(select(Cancellation.id).where(Cancellation.dataset_id == dataset_id, Cancellation.request_source_id == request_source_id)):
            raise BookingApprovalError("A cancelled booking cannot be approved")
        if db.scalar(select(BookingOutcome.id).where(
            BookingOutcome.dataset_id == dataset_id,
            BookingOutcome.request_source_id == request_source_id,
            BookingOutcome.status == "approved",
        )):
            raise BookingApprovalError("This booking is already approved in a schedule")
        now = datetime.now(timezone.utc)
        room = None
        if reject_reason is None:
            if room_source_id is None or day is None or start_period is None:
                raise BookingApprovalError("Approval requires a room, day, and start period")
            room = db.scalar(select(Room).where(Room.dataset_id == dataset_id, Room.source_id == room_source_id).with_for_update())
            if room is None or "lab" not in room.type.casefold():
                raise BookingApprovalError("The selected room is not a lab in this dataset")
            if room.department != department:
                raise PermissionError("The selected lab is not assigned to your department")
            end_period = start_period + request.duration_periods - 1
            reason = _slot_reason(db, dataset=dataset, request=request, schedule_id=schedule_id, booking_schedule_id=schedule_id, room=room, day=day, start=start_period, end=end_period)
            if reason:
                raise BookingApprovalError(reason)
            status = "approved"
        else:
            if not reject_reason.strip():
                raise BookingApprovalError("Rejection requires a meaningful reason")
            reason = reject_reason.strip()
            status = "rejected"
            end_period = None
        outcome = BookingOutcome(
            schedule_id=schedule_id, dataset_id=dataset_id, request_source_id=request_source_id,
            status=status, day=day if status == "approved" else None,
            start_period=start_period if status == "approved" else None,
            end_period=end_period, room_source_id=room.source_id if room else None,
            reason=reason, decided_by_user_id=coordinator_id, decided_at=now,
            decision_source="department_lab",
        )
        db.add(outcome)
        db.flush()
        return {"request_id": request_source_id, "status": status, "reason": reason, "decided_by_user_id": coordinator_id, "decided_at": now}


def create_class_move_proposal(
    db: Session, *, dataset_id: UUID, schedule_id: UUID, request_source_id: str,
    room_source_id: str, day: str, start_period: int, created_by_user_id: UUID,
    time_limit_seconds: float = 60,
) -> dict[str, Any]:
    with (db.begin_nested() if db.in_transaction() else db.begin()):
        dataset = db.scalar(select(Dataset).where(Dataset.id == dataset_id).with_for_update())
        request = db.scalar(select(BookingRequest).where(
            BookingRequest.dataset_id == dataset_id, BookingRequest.source_id == request_source_id,
        ).with_for_update())
        schedule = db.scalar(select(Schedule).where(Schedule.dataset_id == dataset_id, Schedule.id == schedule_id))
        room = db.scalar(select(Room).where(Room.dataset_id == dataset_id, Room.source_id == room_source_id))
        if dataset is None or request is None or schedule is None or room is None:
            raise LookupError("Dataset, booking request, schedule, or room was not found")
        if request.created_by_user_id != created_by_user_id:
            raise PermissionError("Only the booking requester can propose a class move")
        if db.scalar(select(Cancellation.id).where(Cancellation.dataset_id == dataset_id, Cancellation.request_source_id == request_source_id)):
            raise BookingApprovalError("A cancelled booking cannot request a class move")
        if db.scalar(select(BookingOutcome.id).where(
            BookingOutcome.dataset_id == dataset_id, BookingOutcome.schedule_id == schedule_id,
            BookingOutcome.request_source_id == request_source_id, BookingOutcome.status == "approved",
        )):
            raise BookingApprovalError("This booking is already approved for the selected schedule")
        end_period = start_period + request.duration_periods - 1
        validation = _slot_reason(db, dataset=dataset, request=request, schedule_id=schedule_id, booking_schedule_id=schedule_id, room=room, day=day, start=start_period, end=end_period)
        # Room-vs-class is the one conflict this workflow is meant to repair.
        if validation and not validation.startswith("The room conflicts with class "):
            raise BookingApprovalError(validation)
        assignments = db.scalars(select(ScheduleSessionAssignment).where(
            ScheduleSessionAssignment.dataset_id == dataset_id, ScheduleSessionAssignment.schedule_id == schedule_id,
            ScheduleSessionAssignment.day == day, ScheduleSessionAssignment.room_source_id == room_source_id,
        )).all()
        sessions = {row.source_id: row for row in db.scalars(select(TimetableSession).where(TimetableSession.dataset_id == dataset_id))}
        conflicting_ids = sorted(row.session_source_id for row in assignments if (session := sessions.get(row.session_source_id)) and set(range(start_period, end_period + 1)).intersection(range(row.start_period, row.start_period + session.duration)))
        if not conflicting_ids:
            raise BookingApprovalError("No class occupies the requested room and time; use the normal booking decision workflow")
        repair = create_repair_proposal(
            db, dataset_id, schedule_id,
            DisruptionRequest(changes=[{
                "type": "room_unavailable", "room_id": room_source_id, "days": [day],
                "periods": list(range(start_period, end_period + 1)),
                "reason": f"Pending class-move booking {request_source_id}",
            }]),
            time_limit_seconds=time_limit_seconds,
            created_by_user_id=created_by_user_id,
        )
        repair_row = db.get(ScheduleRepairProposal, repair["proposal_id"])
        if repair_row is None:
            raise BookingApprovalError("The solver did not persist its repair proposal")
        proposal = BookingClassMoveProposal(
            dataset_id=dataset_id, request_source_id=request_source_id,
            baseline_schedule_id=schedule_id, repair_proposal_id=repair_row.id,
            room_source_id=room_source_id, day=day, start_period=start_period,
            end_period=end_period, request_fingerprint=_request_fingerprint(request),
            created_by_user_id=created_by_user_id,
        )
        db.add(proposal)
        db.flush()
        return class_move_payload(proposal, repair_row)


def class_move_payload(proposal: BookingClassMoveProposal, repair: ScheduleRepairProposal) -> dict[str, Any]:
    before = []
    after_by_id = {row["session_id"]: row for row in repair.assignments}
    # The baseline is added by the API list endpoint, whose caller has the selected schedule.
    return {
        "proposal_id": proposal.id, "request_id": proposal.request_source_id,
        "baseline_schedule_id": proposal.baseline_schedule_id,
        "repair_proposal_id": proposal.repair_proposal_id,
        "room_id": proposal.room_source_id, "day": proposal.day,
        "start_period": proposal.start_period, "end_period": proposal.end_period,
        "status": proposal.status, "reason": proposal.reason,
        "created_at": proposal.created_at, "decided_at": proposal.decided_at,
        "created_by_user_id": proposal.created_by_user_id,
        "decided_by_user_id": proposal.decided_by_user_id,
        "approved_schedule_id": proposal.approved_schedule_id,
        "changes": repair.changes, "assignments": repair.assignments,
        "changed_session_ids": repair.changed_session_ids,
        "explanation": repair.explanation, "before": before,
    }


def decide_class_move_proposal(
    db: Session, *, dataset_id: UUID, proposal_id: UUID, admin_id: UUID,
    approve: bool, reject_reason: str | None = None,
) -> dict[str, Any]:
    with (db.begin_nested() if db.in_transaction() else db.begin()):
        dataset = db.scalar(select(Dataset).where(Dataset.id == dataset_id).with_for_update())
        proposal = db.scalar(select(BookingClassMoveProposal).where(
            BookingClassMoveProposal.dataset_id == dataset_id,
            BookingClassMoveProposal.id == proposal_id,
        ).with_for_update())
        if dataset is None or proposal is None:
            raise LookupError("Dataset or class-move proposal was not found")
        if proposal.status != "proposed":
            raise BookingApprovalError(f"Class-move proposal is already {proposal.status}")
        if proposal.created_by_user_id == admin_id:
            raise PermissionError("A request creator cannot approve their own class-move proposal")
        repair = db.get(ScheduleRepairProposal, proposal.repair_proposal_id)
        request = db.scalar(select(BookingRequest).where(
            BookingRequest.dataset_id == dataset_id,
            BookingRequest.source_id == proposal.request_source_id,
        ).with_for_update())
        if repair is None or request is None:
            raise LookupError("The linked repair proposal or booking request no longer exists")
        if _request_fingerprint(request) != proposal.request_fingerprint:
            raise BookingApprovalError("Booking request changed after this proposal; create a fresh class-move proposal")
        if db.scalar(select(Cancellation.id).where(Cancellation.dataset_id == dataset_id, Cancellation.request_source_id == request.source_id)):
            raise BookingApprovalError("A cancelled booking cannot be approved")
        if db.scalar(select(BookingOutcome.id).where(
            BookingOutcome.dataset_id == dataset_id, BookingOutcome.request_source_id == request.source_id,
            BookingOutcome.status == "approved",
        )):
            raise BookingApprovalError("This booking is already approved in a schedule")
        now = datetime.now(timezone.utc)
        if not approve:
            if not reject_reason or not reject_reason.strip():
                raise BookingApprovalError("Rejection requires a meaningful reason")
            proposal.status = "rejected"
            proposal.reason = reject_reason.strip()
            proposal.decided_by_user_id = admin_id
            proposal.decided_at = now
            # The linked repair is also closed without applying it.
            repair.status = "rejected"
            repair.explanation = f"{repair.explanation} Rejected: {reject_reason.strip()}"
            repair.decided_by_user_id = admin_id
            repair.decided_at = now
            db.flush()
            return {"proposal_id": proposal.id, "status": proposal.status, "reason": proposal.reason, "decided_by_user_id": admin_id, "decided_at": now}
        room = db.scalar(select(Room).where(Room.dataset_id == dataset_id, Room.source_id == proposal.room_source_id).with_for_update())
        if room is None:
            raise BookingApprovalError("The proposed room no longer exists")
        try:
            # Rechecks the repair fingerprint, CP-SAT-derived assignments, and all current inputs.
            repaired = approve_repair_proposal(
                db, dataset_id, proposal.baseline_schedule_id, proposal.repair_proposal_id,
                decided_by_user_id=admin_id, persist_disruption_changes=False,
            )
        except RepairError as exc:
            raise BookingApprovalError(str(exc)) from exc
        approved_schedule_id = repaired["approved_schedule_id"]
        reason = _slot_reason(
            db, dataset=dataset, request=request, schedule_id=approved_schedule_id,
            booking_schedule_id=proposal.baseline_schedule_id, room=room, day=proposal.day,
            start=proposal.start_period, end=proposal.end_period,
        )
        if reason:
            raise BookingApprovalError("Hard-constraint revalidation failed: " + reason)
        outcome = BookingOutcome(
            schedule_id=approved_schedule_id, dataset_id=dataset_id,
            request_source_id=request.source_id, status="approved", day=proposal.day,
            start_period=proposal.start_period, end_period=proposal.end_period,
            room_source_id=proposal.room_source_id,
            reason="Approved by Admin after revalidating the class-move repair and booking constraints.",
            decided_by_user_id=admin_id, decided_at=now,
            decision_source="class_move",
        )
        db.add(outcome)
        proposal.status = "approved"
        proposal.reason = outcome.reason
        proposal.decided_by_user_id = admin_id
        proposal.decided_at = now
        proposal.approved_schedule_id = approved_schedule_id
        db.flush()
        return {"proposal_id": proposal.id, "status": proposal.status, "reason": proposal.reason, "decided_by_user_id": admin_id, "decided_at": now, "approved_schedule_id": approved_schedule_id}
