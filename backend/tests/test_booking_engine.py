from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, configure_mappers

from app.database.session import Base
from app.models import (
    BookingOutcome, BookingRequest, Cancellation, Course, Dataset, Faculty, Room, User,
    RoomUnavailability, Schedule, ScheduleSessionAssignment, StudentGroup,
    TimetableSession,
)
from app.models.entities import session_groups
from app.api.routes import get_booking_outcomes_endpoint
from app.main import app
from app.services.bookings.engine import run_booking_engine


@pytest.fixture
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def add_dataset(db, source="test"):
    dataset = Dataset(
        source_dataset_id=source,
        institute="Test Institute",
        calendar={"days": ["MON", "TUE"], "periods": [{"id": period, "teaching": period <= 9} for period in range(1, 14)]},
        priority_order=["exam", "regular_session", "institute_event", "guest_lecture", "department_event", "club_event"],
        role_category_cap={"admin": "institute_event", "faculty": "guest_lecture", "department_coordinator": "department_event", "club": "club_event"},
    )
    db.add(dataset)
    db.flush()
    schedule = Schedule(dataset_id=dataset.id, source_id="base", team="test")
    db.add(schedule)
    db.flush()
    return dataset, schedule


def add_room(db, dataset, source="R1", **changes):
    values = dict(name=source, building="Main", type="classroom", capacity=100, features=["projector"], accessible=True, allowed_uses=["event", "class"])
    values.update(changes)
    room = Room(dataset_id=dataset.id, source_id=source, **values)
    db.add(room)
    db.flush()
    return room


def add_request(db, dataset, source, *, category="department_event", role="department_coordinator", submitted=None, window=None, **changes):
    values = dict(
        submitted_at=submitted or datetime(2027, 1, 1, tzinfo=timezone.utc),
        requester=source,
        role=role,
        department="CSE",
        requested_category=category,
        title=source,
        attendance=50,
        duration_periods=1,
        windows=window or [{"day": "MON", "from_period": 3, "to_period": 3}],
        room_types=["classroom"],
        needs=["projector"],
        requested_room=None,
        mandatory_for_groups=[],
        series_id=None,
        raw_text=source,
    )
    values.update(changes)
    request = BookingRequest(dataset_id=dataset.id, source_id=source, **values)
    db.add(request)
    db.flush()
    return request


def test_imports_mapper_configuration_and_relationships():
    configure_mappers()
    assert len(Base.metadata.tables) == 20
    assert "booking_outcomes" in Base.metadata.tables
    assert BookingOutcome.request.property.mapper.class_ is BookingRequest
    assert "/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/bookings/run" in app.openapi()["paths"]
    assert "/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/booking-outcomes" in app.openapi()["paths"]


def test_priority_then_earliest_submission_wins_deterministically(db):
    dataset, schedule = add_dataset(db)
    add_room(db, dataset)
    add_request(db, dataset, "late", category="department_event", submitted=datetime(2027, 1, 2, tzinfo=timezone.utc))
    add_request(db, dataset, "earlier", category="department_event", submitted=datetime(2027, 1, 1, tzinfo=timezone.utc))
    add_request(db, dataset, "high-priority", category="institute_event", role="admin", submitted=datetime(2027, 1, 3, tzinfo=timezone.utc))
    db.commit()

    result = run_booking_engine(db, dataset.id, schedule.id)
    outcomes = {o.request_source_id: o for o in db.scalars(select(BookingOutcome)).all()}
    assert result["counts"] == {"approved": 1, "rejected": 2, "pending": 0}
    assert outcomes["high-priority"].status == "approved"
    assert outcomes["earlier"].reason


def test_tie_breaking_uses_earlier_submitted_at(db):
    dataset, schedule = add_dataset(db)
    add_room(db, dataset)
    add_request(db, dataset, "later", submitted=datetime(2027, 2, 2, tzinfo=timezone.utc))
    add_request(db, dataset, "earlier", submitted=datetime(2027, 2, 1, tzinfo=timezone.utc))
    db.commit()
    run_booking_engine(db, dataset.id, schedule.id)
    assert db.scalar(select(BookingOutcome.status).where(BookingOutcome.request_source_id == "earlier")) == "approved"
    assert db.scalar(select(BookingOutcome.status).where(BookingOutcome.request_source_id == "later")) == "rejected"


def test_cancelled_request_never_approved_and_does_not_reserve_room(db):
    dataset, schedule = add_dataset(db)
    add_room(db, dataset)
    add_request(db, dataset, "cancelled")
    add_request(db, dataset, "valid", submitted=datetime(2027, 1, 2, tzinfo=timezone.utc))
    db.add(Cancellation(dataset_id=dataset.id, request_source_id="cancelled", cancelled_at=datetime.now(timezone.utc), by="tester", note="cancel"))
    db.commit()
    run_booking_engine(db, dataset.id, schedule.id)
    outcomes = {o.request_source_id: o for o in db.scalars(select(BookingOutcome)).all()}
    assert outcomes["cancelled"].status == "rejected"
    assert "cancelled" in outcomes["cancelled"].reason.lower()
    assert outcomes["valid"].status == "approved"


def test_role_cap_prevents_club_claiming_institute_priority(db):
    dataset, schedule = add_dataset(db)
    add_room(db, dataset)
    add_request(db, dataset, "club-claim", category="institute_event", role="club")
    add_request(db, dataset, "institute", category="institute_event", role="admin", submitted=datetime(2027, 1, 2, tzinfo=timezone.utc))
    db.commit()
    run_booking_engine(db, dataset.id, schedule.id)
    club = db.scalar(select(BookingOutcome).where(BookingOutcome.request_source_id == "club-claim"))
    institute = db.scalar(select(BookingOutcome).where(BookingOutcome.request_source_id == "institute"))
    assert institute.status == "approved"
    assert club.status == "rejected"
    assert "club_event" in club.reason


def test_room_filters_unavailability_and_fixed_slot(db):
    dataset, schedule = add_dataset(db)
    add_room(db, dataset, "R1")
    add_room(db, dataset, "R2", capacity=80)
    db.add(RoomUnavailability(dataset_id=dataset.id, room_source_id="R1", day="MON", periods=[4], reason="maintenance"))
    add_request(db, dataset, "fixed", window=[{"day": "MON", "from_period": 4, "to_period": 4}])
    db.commit()
    run_booking_engine(db, dataset.id, schedule.id)
    outcome = db.scalar(select(BookingOutcome).where(BookingOutcome.request_source_id == "fixed"))
    assert outcome.status == "approved"
    assert (outcome.room_source_id, outcome.day, outcome.start_period, outcome.end_period) == ("R2", "MON", 4, 4)


def test_booking_window_beyond_dataset_calendar_is_rejected(db):
    dataset, schedule = add_dataset(db)
    add_room(db, dataset)
    add_request(db, dataset, "outside-calendar", duration_periods=2, window=[{"day": "MON", "from_period": 13, "to_period": 14}])
    db.commit()
    run_booking_engine(db, dataset.id, schedule.id)
    outcome = db.scalar(select(BookingOutcome).where(BookingOutcome.request_source_id == "outside-calendar"))
    assert outcome.status == "rejected"
    assert "outside the dataset calendar" in outcome.reason


@pytest.mark.parametrize(
    ("room_changes", "request_changes", "reason_fragment"),
    [
        ({"capacity": 20}, {}, "capacity"),
        ({"type": "seminar_hall"}, {}, "room type"),
        ({"accessible": False, "features": []}, {"needs": ["accessible"]}, "accessible"),
    ],
)
def test_capacity_type_and_accessibility_are_enforced(db, room_changes, request_changes, reason_fragment):
    dataset, schedule = add_dataset(db)
    add_room(db, dataset, **room_changes)
    add_request(db, dataset, "filtered", **request_changes)
    db.commit()
    run_booking_engine(db, dataset.id, schedule.id)
    outcome = db.scalar(select(BookingOutcome).where(BookingOutcome.request_source_id == "filtered"))
    assert outcome.status == "rejected"
    assert reason_fragment in outcome.reason


def test_class_room_and_mandatory_group_conflicts(db):
    dataset, schedule = add_dataset(db)
    add_room(db, dataset, "R1")
    add_room(db, dataset, "R2", type="seminar_hall")
    faculty = Faculty(dataset_id=dataset.id, source_id="F", name="Faculty", department="CSE", max_hours_per_day=8, needs_accessible=False, unavailable=[], preferences=[])
    course = Course(dataset_id=dataset.id, source_id="C", title="Course", department="CSE", year=1, lecture_hours=1, tutorial_hours=0, lab_blocks=0)
    group = StudentGroup(dataset_id=dataset.id, source_id="G", name="Group", year=1, department="CSE", size=40, needs_accessible=False)
    db.add_all([faculty, course, group]); db.flush()
    session = TimetableSession(dataset_id=dataset.id, source_id="S", course_source_id="C", faculty_source_id="F", kind="lecture", size=40, duration=1, room_types=["classroom"], needs_accessible=False, basket_slot=None, fixed_slot=None)
    db.add(session); db.flush()
    db.execute(session_groups.insert().values(dataset_id=dataset.id, session_source_id="S", group_source_id="G"))
    db.add(ScheduleSessionAssignment(schedule_id=schedule.id, dataset_id=dataset.id, session_source_id="S", room_source_id="R1", day="MON", start_period=3))
    add_request(db, dataset, "room-conflict", requested_room="R1", room_types=["classroom"])
    add_request(db, dataset, "group-conflict", requested_room="R2", room_types=["seminar_hall"], mandatory_for_groups=["G"])
    db.commit()
    run_booking_engine(db, dataset.id, schedule.id)
    outcomes = {o.request_source_id: o for o in db.scalars(select(BookingOutcome)).all()}
    assert outcomes["room-conflict"].status == "rejected"
    assert "room conflicts" in outcomes["room-conflict"].reason
    assert outcomes["group-conflict"].status == "rejected"
    assert "mandatory group" in outcomes["group-conflict"].reason


def test_dataset_isolation_and_idempotency(db):
    first, schedule1 = add_dataset(db, "first")
    second, schedule2 = add_dataset(db, "second")
    add_room(db, first, "R1")
    add_room(db, second, "R2")
    add_request(db, first, "same-id")
    add_request(db, second, "same-id")
    db.commit()
    run_booking_engine(db, first.id, schedule1.id)
    before = db.scalar(select(BookingOutcome).where(BookingOutcome.dataset_id == first.id, BookingOutcome.schedule_id == schedule1.id))
    before_id, before_status, before_reason = before.id, before.status, before.reason
    run_booking_engine(db, first.id, schedule1.id)
    after = db.scalar(select(BookingOutcome).where(BookingOutcome.dataset_id == first.id, BookingOutcome.schedule_id == schedule1.id))
    assert after.id == before_id
    assert (after.status, after.reason) == (before_status, before_reason)
    assert db.scalar(select(func.count()).select_from(BookingOutcome).where(BookingOutcome.dataset_id == first.id, BookingOutcome.schedule_id == schedule1.id)) == 1
    run_booking_engine(db, second.id, schedule2.id)
    assert db.scalar(select(func.count()).select_from(BookingOutcome)) == 2
    assert db.scalar(select(BookingOutcome.room_source_id).where(BookingOutcome.dataset_id == second.id)) == "R2"
    with pytest.raises(LookupError, match="dataset"):
        run_booking_engine(db, first.id, schedule2.id)


def test_outcomes_api_reports_requests_as_pending_until_run(db):
    dataset, schedule = add_dataset(db)
    add_request(db, dataset, "not-yet-decided")
    db.commit()
    user = User(id=uuid4(), username="outcomes-reader", password_hash="unused", role="admin")
    rows = get_booking_outcomes_endpoint(dataset.id, schedule.id, db, user=user)
    assert rows == [{
        "request_id": "not-yet-decided", "status": "pending", "day": None,
        "start_period": None, "end_period": None, "room_id": None, "reason": None,
    }]


def test_engine_does_not_decide_request_created_by_the_initiating_user(db):
    dataset, schedule = add_dataset(db)
    add_room(db, dataset)
    actor = User(username="requesting-admin", password_hash="unused", role="admin")
    db.add(actor); db.flush()
    add_request(db, dataset, "self-request", created_by_user_id=actor.id)
    db.commit()
    result = run_booking_engine(db, dataset.id, schedule.id, initiated_by_user_id=actor.id)
    assert result["counts"] == {"approved": 0, "rejected": 0, "pending": 1}
    assert db.scalar(select(func.count()).select_from(BookingOutcome)) == 0


def test_failed_run_rolls_back_all_outcomes(db):
    dataset, schedule = add_dataset(db)
    add_room(db, dataset)
    add_request(db, dataset, "request")
    db.commit()

    def fail_before_flush(session, flush_context, instances):
        raise RuntimeError("injected persistence failure")

    event.listen(Session, "before_flush", fail_before_flush)
    try:
        with pytest.raises(RuntimeError, match="injected"):
            run_booking_engine(db, dataset.id, schedule.id)
    finally:
        event.remove(Session, "before_flush", fail_before_flush)
        db.rollback()
    assert db.scalar(select(func.count()).select_from(BookingOutcome)) == 0


def test_database_rejects_cross_dataset_schedule_reference(db):
    first, schedule1 = add_dataset(db, "one")
    second, _ = add_dataset(db, "two")
    add_room(db, first)
    add_request(db, first, "r")
    db.commit()
    db.add(BookingOutcome(schedule_id=schedule1.id, dataset_id=second.id, request_source_id="r", status="rejected", reason="bad link"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
