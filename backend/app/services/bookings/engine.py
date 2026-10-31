from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    BookingOutcome, BookingRequest, Cancellation, Dataset, Room, RoomUnavailability,
    Schedule, ScheduleSessionAssignment, TimetableSession,
)
from app.models.entities import session_groups


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _effective_category(dataset: Dataset, request: BookingRequest) -> str:
    order = list(dataset.priority_order)
    caps = dataset.role_category_cap or {}
    if not order:
        raise ValueError("Dataset priority_order is empty")
    requested = request.requested_category if request.requested_category in order else order[-1]
    cap = caps.get(request.role, order[-1])
    if cap not in order:
        cap = order[-1]
    return order[max(order.index(requested), order.index(cap))]


def _periods(start: int, end: int):
    return range(start, end + 1)


def run_booking_engine(db: Session, dataset_id: UUID, schedule_id: UUID, *, initiated_by_user_id: UUID | None = None) -> dict[str, Any]:
    """Make deterministic, transactional venue decisions against one schedule."""
    # API requests use a fresh session and get an owned transaction. This also
    # supports callers that already have a transaction by isolating the run in
    # a savepoint, so a failed decision batch cannot leave partial outcomes.
    transaction = db.begin_nested() if db.in_transaction() else db.begin()
    with transaction:
        dataset = db.scalar(select(Dataset).where(Dataset.id == dataset_id).with_for_update())
        if dataset is None:
            raise LookupError("Dataset not found")
        schedule = db.scalar(select(Schedule).where(Schedule.id == schedule_id, Schedule.dataset_id == dataset_id).with_for_update())
        if schedule is None:
            raise LookupError("Schedule not found for dataset")

        requests = db.scalars(select(BookingRequest).where(BookingRequest.dataset_id == dataset_id)).all()
        priority_order = list(dataset.priority_order or [])
        if not priority_order or len(priority_order) != len(set(priority_order)):
            raise ValueError("Dataset priority_order must contain unique categories")
        calendar = dataset.calendar or {}
        calendar_days = set(calendar.get("days") or [])
        calendar_periods = {int(period["id"]) for period in calendar.get("periods", [])}
        if not calendar_days or not calendar_periods:
            raise ValueError("Dataset calendar must define days and periods before booking decisions can run")
        first_period, last_period = min(calendar_periods), max(calendar_periods)
        requests.sort(key=lambda r: (
            priority_order.index(_effective_category(dataset, r)),
            _utc(r.submitted_at),
            r.source_id,
        ))
        rooms = db.scalars(select(Room).where(Room.dataset_id == dataset_id).order_by(Room.source_id)).all()
        unavailable: dict[tuple[str, str], set[int]] = {}
        for row in db.scalars(select(RoomUnavailability).where(RoomUnavailability.dataset_id == dataset_id)):
            unavailable.setdefault((row.room_source_id, row.day), set()).update(row.periods)

        assignments = db.scalars(select(ScheduleSessionAssignment).where(
            ScheduleSessionAssignment.schedule_id == schedule_id,
            ScheduleSessionAssignment.dataset_id == dataset_id,
        )).all()
        sessions = {s.source_id: s for s in db.scalars(select(TimetableSession).where(TimetableSession.dataset_id == dataset_id))}
        group_links = db.execute(select(session_groups.c.session_source_id, session_groups.c.group_source_id).where(session_groups.c.dataset_id == dataset_id)).all()
        groups_by_session: dict[str, set[str]] = {}
        for sid, gid in group_links:
            groups_by_session.setdefault(sid, set()).add(gid)
        room_busy: dict[tuple[str, str, int], str] = {}
        group_busy: dict[tuple[str, str, int], str] = {}
        for assignment in assignments:
            sess = sessions.get(assignment.session_source_id)
            if not sess:
                continue
            for period in _periods(assignment.start_period, assignment.start_period + sess.duration - 1):
                room_busy[(assignment.room_source_id, assignment.day, period)] = f"class {sess.source_id}"
                for group_id in groups_by_session.get(sess.source_id, ()):
                    group_busy[(group_id, assignment.day, period)] = f"class {sess.source_id}"

        cancellations = {c.request_source_id for c in db.scalars(select(Cancellation).where(Cancellation.dataset_id == dataset_id))}
        outcomes_by_request = {o.request_source_id: o for o in db.scalars(select(BookingOutcome).where(BookingOutcome.schedule_id == schedule_id, BookingOutcome.dataset_id == dataset_id))}
        request_by_source = {request.source_id: request for request in requests}
        for outcome in outcomes_by_request.values():
            if outcome.decision_source not in {"department_lab", "class_move"} or outcome.status != "approved" or not outcome.day or outcome.start_period is None or outcome.end_period is None:
                continue
            for period in _periods(outcome.start_period, outcome.end_period):
                if outcome.room_source_id:
                    room_busy[(outcome.room_source_id, outcome.day, period)] = f"human-approved booking {outcome.request_source_id}"
                approved_request = request_by_source.get(outcome.request_source_id)
                for group_id in (approved_request.mandatory_for_groups or []) if approved_request else ():
                    group_busy[(group_id, outcome.day, period)] = f"human-approved booking {outcome.request_source_id}"
        counts = {"approved": 0, "rejected": 0, "pending": 0}
        decided_at = datetime.now(timezone.utc)
        for request in requests:
            outcome = outcomes_by_request.get(request.source_id)
            if outcome is not None and outcome.decision_source in {"department_lab", "class_move"}:
                if outcome.status in counts:
                    counts[outcome.status] += 1
                continue
            if initiated_by_user_id is not None and request.created_by_user_id == initiated_by_user_id:
                if outcome is not None and outcome.decided_by_user_id == initiated_by_user_id:
                    db.delete(outcome)
                counts["pending"] += 1
                continue
            reason: str | None = None
            chosen: tuple[Room, str, int, int] | None = None
            if request.source_id in cancellations:
                status, reason = "rejected", "Request was cancelled."
            else:
                category = _effective_category(dataset, request)
                windows = request.windows or []
                candidate_rooms = sorted(rooms, key=lambda r: (r.source_id != request.requested_room, r.source_id))
                blockers: set[str] = set()
                # Keep the caller's window preference order; ties remain deterministic.
                for window in windows:
                    day = window["day"]
                    if day not in calendar_days:
                        blockers.add("requested day is outside the dataset calendar")
                        continue
                    window_start = int(window["from_period"])
                    window_end = int(window["to_period"])
                    start_min = max(window_start, first_period)
                    start_max = min(window_end - request.duration_periods + 1, last_period - request.duration_periods + 1)
                    if start_min > start_max:
                        if window_start < first_period or window_end > last_period or window_start > last_period:
                            blockers.add("requested time is outside the dataset calendar")
                        continue
                    # A single exact-length window fixes the start period.
                    starts = [start_min] if window_end - window_start + 1 == request.duration_periods else range(start_min, start_max + 1)
                    for start in starts:
                        end = start + request.duration_periods - 1
                        if any(period not in calendar_periods for period in _periods(start, end)):
                            blockers.add("requested time crosses a non-existent dataset calendar period")
                            continue
                        for room in candidate_rooms:
                            if "event" not in (room.allowed_uses or []):
                                blockers.add("room is not allowed for events"); continue
                            if room.type not in (request.room_types or []):
                                blockers.add("room type is not permitted"); continue
                            if room.capacity < request.attendance:
                                blockers.add("room capacity is insufficient"); continue
                            features = set(room.features or []) | ({"accessible"} if room.accessible else set())
                            missing = set(request.needs or []) - features
                            if missing:
                                blockers.add("missing room needs: " + ", ".join(sorted(missing))); continue
                            conflict = False
                            for period in _periods(start, end):
                                if period in unavailable.get((room.source_id, day), set()):
                                    blockers.add("room unavailable"); conflict = True; break
                                if (room.source_id, day, period) in room_busy:
                                    blockers.add("room conflicts with a class or approved booking"); conflict = True; break
                                if any((group, day, period) in group_busy for group in (request.mandatory_for_groups or [])):
                                    blockers.add("mandatory group has a conflicting class or booking"); conflict = True; break
                            if not conflict:
                                chosen = (room, day, start, end)
                                break
                        if chosen:
                            break
                    if chosen:
                        break
                if chosen:
                    room, day, start, end = chosen
                    requested_category = request.requested_category
                    cap_note = (
                        f" Role cap changed priority from {requested_category} to {category}."
                        if category != requested_category
                        else ""
                    )
                    status, reason = "approved", f"Approved as {category}; fits the requested window and room constraints.{cap_note}"
                    for period in _periods(start, end):
                        room_busy[(room.source_id, day, period)] = f"booking {request.source_id}"
                        for group in request.mandatory_for_groups or []:
                            group_busy[(group, day, period)] = f"booking {request.source_id}"
                else:
                    status = "rejected"
                    category = _effective_category(dataset, request)
                    cap_note = (
                        f" Role cap changed priority from {request.requested_category} to {category}."
                        if category != request.requested_category
                        else ""
                    )
                    reason = "No feasible room and time in the requested windows." + cap_note
                    if blockers:
                        reason += " Constraints checked: " + "; ".join(sorted(blockers)) + "."
            if outcome is None:
                outcome = BookingOutcome(schedule_id=schedule_id, dataset_id=dataset_id, request_source_id=request.source_id, status=status, reason=reason, decided_by_user_id=initiated_by_user_id)
                db.add(outcome)
            else:
                outcome.status = status
                outcome.decided_by_user_id = initiated_by_user_id
                outcome.reason = reason
                outcome.day = None
                outcome.start_period = None
                outcome.end_period = None
                outcome.room_source_id = None
            outcome.decided_at = decided_at
            outcome.decision_source = "engine"
            if chosen and status == "approved":
                room, day, start, end = chosen
                outcome.day, outcome.start_period, outcome.end_period, outcome.room_source_id = day, start, end, room.source_id
            counts[status] += 1
        db.flush()
        return {"dataset_id": str(dataset_id), "schedule_id": str(schedule_id), "counts": counts}
