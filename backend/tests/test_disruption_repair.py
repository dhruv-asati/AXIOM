from __future__ import annotations

import pytest
import json
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session

from app.database.session import Base
from app.models import (
    Course, Dataset, Faculty, Room, RoomUnavailability, Schedule,
    ScheduleRepairProposal, ScheduleSessionAssignment, StudentGroup,
    TimetableSession,
)
from app.services.ai.schemas import DisruptionRequest
from app.services.disruptions.repair import (
    RepairError,
    RepairInfeasibleError,
    approve_repair_proposal,
    create_repair_proposal,
    reject_repair_proposal,
)
from app.services.timetable.solver import generate_schedule, get_schedule_assignments
from app.api.routes import get_db
from app.main import app


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def seed_schedule(db: Session):
    dataset = Dataset(
        source_dataset_id="repair-test", institute="Repair Test",
        calendar={
            "days": ["MON", "TUE"],
            "periods": [{"id": p, "teaching": True} for p in range(1, 10)],
            "lunch": {"after_period": 5}, "lab_start_periods": [2, 6],
            "exam_week": {"days": ["MON", "TUE"], "sessions": [{"id": "AM"}, {"id": "PM"}]},
        },
        priority_order=["exam", "regular_session", "institute_event", "guest_lecture", "department_event", "club_event"],
        role_category_cap={"admin": "institute_event"},
    )
    db.add(dataset)
    db.flush()
    db.add_all([
        Course(dataset_id=dataset.id, source_id=f"C{i}", title=f"Course {i}", department="CSE", year=3, lecture_hours=1, tutorial_hours=0, lab_blocks=0)
        for i in (1, 2)
    ])
    db.add_all([
        Faculty(dataset_id=dataset.id, source_id=f"F{i}", name=f"Faculty {i}", department="CSE", max_hours_per_day=8, needs_accessible=False, unavailable=[], preferences=[])
        for i in (1, 2)
    ])
    db.add_all([
        StudentGroup(dataset_id=dataset.id, source_id=f"G{i}", name=f"Group {i}", year=3, department="CSE", size=20, needs_accessible=False)
        for i in (1, 2)
    ])
    db.add_all([
        Room(dataset_id=dataset.id, source_id=f"R{i}", name=f"Room {i}", building="Main", type="classroom", capacity=60, features=[], accessible=True, allowed_uses=["lecture", "exam"])
        for i in (1, 2)
    ])
    db.flush()
    db.add_all([
        TimetableSession(dataset_id=dataset.id, source_id=f"S{i}", course_source_id=f"C{i}", faculty_source_id=f"F{i}", kind="lecture", size=20, duration=1, room_types=["classroom"], needs_accessible=False)
        for i in (1, 2)
    ])
    db.flush()
    from app.models.entities import session_groups
    db.execute(session_groups.insert(), [
        {"dataset_id": dataset.id, "session_source_id": f"S{i}", "group_source_id": f"G{i}"}
        for i in (1, 2)
    ])
    db.commit()
    schedule = generate_schedule(db, dataset.id, team="Test", time_limit_seconds=10)
    db.commit()
    return dataset, schedule


def make_room_disruption(assignment):
    return DisruptionRequest(changes=[{
        "type": "room_unavailable", "room_id": assignment["room_id"],
        "days": [assignment["day"]], "periods": [assignment["start_period"]],
        "reason": "Campus event",
    }])


def test_room_disruption_is_previewed_then_approved_as_a_new_schedule(db):
    dataset, generated = seed_schedule(db)
    before = get_schedule_assignments(db, dataset.id, generated.schedule_id)["assignments"]
    impacted = before[0]
    proposal = create_repair_proposal(db, dataset.id, generated.schedule_id, make_room_disruption(impacted), time_limit_seconds=10)
    db.commit()

    assert proposal["status"] == "proposed"
    assert proposal["affected_session_ids"]
    assert get_schedule_assignments(db, dataset.id, generated.schedule_id)["assignments"] == before
    assert db.scalar(select(RoomUnavailability).where(RoomUnavailability.dataset_id == dataset.id)) is None

    approved = approve_repair_proposal(db, dataset.id, generated.schedule_id, proposal["proposal_id"])
    db.commit()
    assert approved["status"] == "approved"
    assert approved["approved_schedule_id"] != generated.schedule_id
    assert get_schedule_assignments(db, dataset.id, generated.schedule_id)["assignments"] == before
    repaired = get_schedule_assignments(db, dataset.id, approved["approved_schedule_id"])["assignments"]
    repaired_by_id = {row["session_id"]: row for row in repaired}
    assert repaired_by_id[impacted["session_id"]]["room_id"] != impacted["room_id"] or (
        repaired_by_id[impacted["session_id"]]["day"], repaired_by_id[impacted["session_id"]]["start_period"]
    ) != (impacted["day"], impacted["start_period"])
    untouched_before = next(row for row in before if row["session_id"] != impacted["session_id"])
    assert repaired_by_id[untouched_before["session_id"]] == untouched_before
    assert db.scalar(select(RoomUnavailability).where(RoomUnavailability.dataset_id == dataset.id)) is not None
    assert db.get(ScheduleRepairProposal, proposal["proposal_id"]).approved_schedule_id == approved["approved_schedule_id"]


def test_rejected_proposal_does_not_change_schedule_or_dataset(db):
    dataset, generated = seed_schedule(db)
    before = get_schedule_assignments(db, dataset.id, generated.schedule_id)["assignments"]
    proposal = create_repair_proposal(db, dataset.id, generated.schedule_id, make_room_disruption(before[0]), time_limit_seconds=10)
    db.commit()
    rejected = reject_repair_proposal(db, dataset.id, generated.schedule_id, proposal["proposal_id"], "No approval")
    db.commit()
    assert rejected["status"] == "rejected"
    assert get_schedule_assignments(db, dataset.id, generated.schedule_id)["assignments"] == before
    assert db.scalar(select(RoomUnavailability).where(RoomUnavailability.dataset_id == dataset.id)) is None
    assert len(db.scalars(select(Schedule).where(Schedule.dataset_id == dataset.id)).all()) == 1


def test_impossible_disruption_leaves_no_partial_proposal_or_source_change(db):
    dataset, generated = seed_schedule(db)
    request = DisruptionRequest(changes=[{
        "type": "faculty_unavailable", "faculty_id": "F1", "days": ["MON", "TUE"],
        "periods": list(range(1, 10)), "reason": "Unavailable for entire week",
    }])
    with pytest.raises(RepairInfeasibleError):
        create_repair_proposal(db, dataset.id, generated.schedule_id, request, time_limit_seconds=10)
    db.commit()
    assert db.scalar(select(ScheduleRepairProposal).where(ScheduleRepairProposal.dataset_id == dataset.id)) is None
    assert db.scalar(select(Faculty).where(Faculty.dataset_id == dataset.id, Faculty.source_id == "F1")).unavailable == []
    assert len(db.scalars(select(ScheduleSessionAssignment).where(ScheduleSessionAssignment.schedule_id == generated.schedule_id)).all()) == 2


def test_proposal_cannot_be_approved_after_its_inputs_change(db):
    dataset, generated = seed_schedule(db)
    assignments = get_schedule_assignments(db, dataset.id, generated.schedule_id)["assignments"]
    proposal = create_repair_proposal(db, dataset.id, generated.schedule_id, make_room_disruption(assignments[0]), time_limit_seconds=10)
    db.commit()
    room = db.scalar(select(Room).where(Room.dataset_id == dataset.id, Room.source_id == "R1"))
    room.capacity += 1
    db.commit()
    with pytest.raises(RepairError, match="changed after this proposal"):
        approve_repair_proposal(db, dataset.id, generated.schedule_id, proposal["proposal_id"])
    db.rollback()
    assert db.get(ScheduleRepairProposal, proposal["proposal_id"]).status == "proposed"
    assert len(db.scalars(select(Schedule).where(Schedule.dataset_id == dataset.id)).all()) == 1


def test_approved_session_removal_preserves_historical_schedule_assignments(db):
    dataset, generated = seed_schedule(db)
    original = get_schedule_assignments(db, dataset.id, generated.schedule_id)
    proposal = create_repair_proposal(db, dataset.id, generated.schedule_id, DisruptionRequest(changes=[{
        "type": "remove_session", "session_id": "S1",
    }]), time_limit_seconds=10)
    db.commit()
    approved = approve_repair_proposal(db, dataset.id, generated.schedule_id, proposal["proposal_id"])
    db.commit()

    historical = get_schedule_assignments(db, dataset.id, generated.schedule_id)
    repaired = get_schedule_assignments(db, dataset.id, approved["approved_schedule_id"])
    assert historical == original
    assert historical["status"] == "complete"
    assert repaired["status"] == "complete"
    assert len(repaired["assignments"]) == 1
    assert all(row["session_id"] != "S1" for row in repaired["assignments"])

    future = generate_schedule(db, dataset.id, time_limit_seconds=10)
    db.commit()
    assert future.scheduled_sessions == 1
    assert get_schedule_assignments(db, dataset.id, future.schedule_id)["status"] == "complete"


def test_multiple_room_disruptions_repair_all_affected_sessions(db):
    dataset, generated = seed_schedule(db)
    original = get_schedule_assignments(db, dataset.id, generated.schedule_id)["assignments"]
    request = DisruptionRequest(changes=[{
        "type": "room_unavailable", "room_id": row["room_id"], "days": [row["day"]],
        "periods": [row["start_period"]], "reason": "Concurrent campus events",
    } for row in original])
    proposal = create_repair_proposal(db, dataset.id, generated.schedule_id, request, time_limit_seconds=10)
    assert set(proposal["affected_session_ids"]) == {row["session_id"] for row in original}
    assert set(proposal["changed_session_ids"]) == {row["session_id"] for row in original}


def test_add_faculty_and_session_are_only_persisted_on_approval(db):
    dataset, generated = seed_schedule(db)
    original = get_schedule_assignments(db, dataset.id, generated.schedule_id)["assignments"]
    request = DisruptionRequest(changes=[
        {"type": "add_faculty", "faculty": {
            "id": "F3", "name": "Faculty 3", "department": "CSE", "max_hours_per_day": 8,
            "needs_accessible": False, "unavailable": [], "preferences": [],
        }},
        {"type": "add_session", "session": {
            "id": "S3", "course_id": "C1", "kind": "lecture", "groups": ["G1"],
            "faculty_id": "F3", "size": 20, "duration": 1, "room_types": ["classroom"],
            "needs_accessible": False, "basket_slot": None, "fixed_slot": None,
        }},
    ])
    proposal = create_repair_proposal(db, dataset.id, generated.schedule_id, request, time_limit_seconds=10)
    db.commit()
    assert db.scalar(select(Faculty).where(Faculty.dataset_id == dataset.id, Faculty.source_id == "F3")) is None
    assert get_schedule_assignments(db, dataset.id, generated.schedule_id)["assignments"] == original

    approved = approve_repair_proposal(db, dataset.id, generated.schedule_id, proposal["proposal_id"])
    db.commit()
    assert db.scalar(select(Faculty).where(Faculty.dataset_id == dataset.id, Faculty.source_id == "F3")) is not None
    assert db.scalar(select(TimetableSession).where(TimetableSession.dataset_id == dataset.id, TimetableSession.source_id == "S3")) is not None
    repaired = get_schedule_assignments(db, dataset.id, approved["approved_schedule_id"])
    assert repaired["status"] == "complete" and len(repaired["assignments"]) == 3


def test_proposal_is_scoped_to_its_dataset_and_schedule(db):
    dataset, generated = seed_schedule(db)
    other = Dataset(source_dataset_id="other-repair-test", institute="Other", calendar=dataset.calendar, priority_order=[], role_category_cap={})
    db.add(other)
    db.commit()
    assignments = get_schedule_assignments(db, dataset.id, generated.schedule_id)["assignments"]
    proposal = create_repair_proposal(db, dataset.id, generated.schedule_id, make_room_disruption(assignments[0]), time_limit_seconds=10)
    db.commit()
    with pytest.raises(LookupError, match="not found"):
        approve_repair_proposal(db, other.id, generated.schedule_id, proposal["proposal_id"])
    db.rollback()
    assert db.get(ScheduleRepairProposal, proposal["proposal_id"]).status == "proposed"


def test_natural_language_parser_hands_structured_disruption_to_repair_service(db):
    dataset, generated = seed_schedule(db)
    assignment = get_schedule_assignments(db, dataset.id, generated.schedule_id)["assignments"][0]
    disruption = {
        "changes": [{
            "type": "room_unavailable", "room_id": assignment["room_id"],
            "days": [assignment["day"]], "periods": [assignment["start_period"]],
            "reason": "Campus event",
        }]
    }
    app.dependency_overrides[get_db] = lambda: db
    try:
        response = TestClient(app).post(
            f"/api/v1/datasets/{dataset.id}/schedules/{generated.schedule_id}/assistant/disruptions/repair-proposals",
            json={"message": "Room unavailable: " + json.dumps(disruption), "time_limit_seconds": 10},
        )
    finally:
        app.dependency_overrides.pop(get_db, None)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "proposal_ready"
    assert body["interpretation"]["proposal"]["type"] == "disruption"
    assert body["repair"]["status"] == "proposed"
