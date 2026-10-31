import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api import routes
from app.api.routes import get_db
from app.database.session import Base
from app.main import app
from app.models import (
    BookingOutcome, BookingRequest, Course, Dataset, ExamRoomAllocation, Examination, Faculty, Room, Schedule,
    ScheduleSessionAssignment, StudentGroup, TimetableSession,
)
from app.models.entities import session_groups


@pytest.fixture
def api_client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)

    def override_get_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            yield client, engine
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def add_dataset(db, source="api-test", *, with_schedule=True):
    dataset = Dataset(
        source_dataset_id=source,
        institute="API Test Institute",
        calendar={
            "days": ["MON", "TUE"],
            "periods": [{"id": p, "teaching": p <= 9} for p in range(1, 14)],
            "lunch": {"after_period": 5},
            "lab_start_periods": [2, 6],
            "exam_week": {"days": ["MON"], "sessions": [{"id": "AM"}, {"id": "PM"}]},
        },
        priority_order=["exam", "regular_session", "institute_event", "guest_lecture", "department_event", "club_event"],
        role_category_cap={"admin": "institute_event", "club": "club_event"},
    )
    db.add(dataset)
    db.flush()
    schedule = None
    if with_schedule:
        schedule = Schedule(dataset_id=dataset.id, source_id="api-schedule", team="API Test")
        db.add(schedule)
        db.flush()
    return dataset, schedule


def add_room(db, dataset):
    room = Room(
        dataset_id=dataset.id,
        source_id="R1",
        name="Test Room",
        building="Main",
        type="classroom",
        capacity=100,
        features=["projector"],
        accessible=True,
        allowed_uses=["lecture", "event", "exam"],
    )
    db.add(room)
    return room


def add_request(db, dataset):
    request = BookingRequest(
        dataset_id=dataset.id,
        source_id="BR-1",
        submitted_at=datetime(2027, 1, 1, tzinfo=timezone.utc),
        requester="Test Club",
        role="club",
        department=None,
        requested_category="club_event",
        title="Test event",
        attendance=30,
        duration_periods=1,
        windows=[{"day": "MON", "from_period": 10, "to_period": 10}],
        room_types=["classroom"],
        needs=["projector"],
        requested_room=None,
        mandatory_for_groups=[],
        series_id=None,
        raw_text="Test event request",
    )
    db.add(request)
    return request


def test_health_cors_docs_openapi_and_dataset_routes(api_client):
    client, engine = api_client
    with Session(engine) as db:
        dataset, _ = add_dataset(db)
        db.commit()
        dataset_id = dataset.id

    health = client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
    assert health.status_code == 200
    assert health.json() == {"status": "ok", "service": "axiom-api"}
    assert health.headers["access-control-allow-origin"] == "http://localhost:5173"

    listing = client.get("/api/v1/datasets")
    assert listing.status_code == 200
    assert listing.json()[0]["source_dataset_id"] == "api-test"
    detail = client.get(f"/api/v1/datasets/{dataset_id}")
    assert detail.status_code == 200
    assert detail.json()["priority_order"][0] == "exam"
    assert client.get(f"/api/v1/datasets/{uuid4()}").status_code == 404
    assert client.get("/api/v1/datasets/not-a-uuid").status_code == 422

    docs = client.get("/docs")
    openapi = client.get("/openapi.json")
    assert docs.status_code == 200 and "swagger-ui" in docs.text.lower()
    assert openapi.status_code == 200
    paths = openapi.json()["paths"]
    assert "/api/v1/health" in paths
    assert "/api/v1/datasets/import" in paths
    assert "/api/v1/datasets/{dataset_id}/schedules/generate" in paths
    assert "/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/assignments" in paths
    assert "/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/export" in paths
    assert "/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/bookings/run" in paths
    assert "/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/booking-outcomes" in paths
    assert "DatasetDetailResponse" in openapi.text
    assert "TimetableGenerateResponse" in openapi.text
    generate_operation = paths["/api/v1/datasets/{dataset_id}/schedules/generate"]["post"]
    assert generate_operation["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith("/TimetableGenerateRequest")
    assert generate_operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/TimetableGenerateResponse")
    assert {"200", "404", "422", "503"} <= set(generate_operation["responses"])
    import_operation = paths["/api/v1/datasets/import"]["post"]
    assert import_operation["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith("/DatasetImportRequest")
    assert import_operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/DatasetImportResponse")
    for path in (
        "/api/v1/datasets/{dataset_id}/summary",
        "/api/v1/datasets/{dataset_id}/schedules",
        "/api/v1/datasets/{dataset_id}/rooms",
        "/api/v1/datasets/{dataset_id}/bookings",
        "/api/v1/assistant/bookings/parse",
        "/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/examinations",
        "/api/v1/datasets/import/upload",
    ):
        assert path in paths


def test_summary_and_schedule_list_use_bounded_database_round_trips(api_client):
    client, engine = api_client
    with Session(engine) as db:
        dataset, _schedule = add_dataset(db, "query-budget")
        db.add_all([
            Schedule(dataset_id=dataset.id, source_id=f"query-budget-{index}", team="API Test")
            for index in range(4)
        ])
        db.commit()
        dataset_id = dataset.id

    query_counts = {"summary": 0, "schedules": 0}
    current = "summary"

    def count_query(_conn, _cursor, _statement, _parameters, _context, _executemany):
        query_counts[current] += 1

    event.listen(engine, "before_cursor_execute", count_query)
    try:
        summary = client.get(f"/api/v1/datasets/{dataset_id}/summary")
        assert summary.status_code == 200
        current = "schedules"
        schedules = client.get(f"/api/v1/datasets/{dataset_id}/schedules")
        assert schedules.status_code == 200
    finally:
        event.remove(engine, "before_cursor_execute", count_query)

    assert query_counts["summary"] <= 12
    assert query_counts["schedules"] <= 3
    assert summary.json()["counts"]["timetable_sessions"] == 0
    assert schedules.json()[0]["assignment_count"] == 0
    assert len(schedules.json()) == 5


def test_dataset_import_validation_and_success(api_client, tmp_path, monkeypatch):
    client, engine = api_client
    monkeypatch.setattr(routes, "DATA_ROOT", tmp_path.resolve())
    valid = {
        "dataset_id": "mini-import",
        "institute": "Mini Institute",
        "calendar": {"days": ["MON"], "periods": [{"id": 1, "teaching": True}]},
        "priority_order": ["exam", "regular_session", "institute_event", "guest_lecture", "department_event", "club_event"],
        "role_category_cap": {"club": "club_event"},
        "faculty": [], "courses": [], "student_groups": [], "rooms": [], "sessions": [],
        "booking_requests": [], "room_unavailability": [], "cancellations": [], "exams": [],
    }
    (tmp_path / "mini.json").write_text(json.dumps(valid), encoding="utf-8")
    malformed = {"dataset_id": "invalid"}
    (tmp_path / "malformed.json").write_text(json.dumps(malformed), encoding="utf-8")

    success = client.post("/api/v1/datasets/import", json={"path": "mini.json"})
    assert success.status_code == 200
    assert success.json()["source_dataset_id"] == "mini-import"
    assert success.json()["counts"]["booking_requests"] == 0
    assert client.post("/api/v1/datasets/import", json={"path": "malformed.json"}).status_code == 422
    assert client.post("/api/v1/datasets/import", json={"path": "missing.json"}).status_code == 404
    assert client.post("/api/v1/datasets/import", json={"path": "../outside.json"}).status_code == 400
    assert client.post("/api/v1/datasets/import", json={"path": 7}).status_code == 422
    duplicate = client.post("/api/v1/datasets/import", json={"path": "mini.json"})
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["replace_existing_required"] is True
    replaced = client.post("/api/v1/datasets/import", json={"path": "mini.json", "replace_existing": True})
    assert replaced.status_code == 200

    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Dataset)) == 1


def test_multi_file_dataset_upload_and_path_safety(api_client):
    client, engine = api_client
    dataset = {
        "dataset_id": "upload-test", "institute": "Upload Institute",
        "calendar": {"days": ["MON"], "periods": [{"id": 1, "teaching": True}]},
        "priority_order": ["exam", "regular_session", "institute_event", "guest_lecture", "department_event", "club_event"],
        "role_category_cap": {"club": "club_event"},
        "faculty": [], "courses": [], "student_groups": [], "rooms": [], "sessions": [],
        "booking_requests": [], "room_unavailability": [], "cancellations": [], "exams": [],
    }
    dataset.pop("faculty")
    payload = [
        ("files", ("dataset.json", json.dumps(dataset), "application/json")),
        ("files", ("faculty.csv", "id,name,department,max_hours_per_day,needs_accessible,unavailable,preferences\nF1,Faculty,CSE,8,false,[],[]\n", "text/csv")),
    ]
    response = client.post("/api/v1/datasets/import/upload", files=payload)
    assert response.status_code == 200, response.text
    assert response.json()["counts"]["faculty"] == 1
    duplicate = client.post("/api/v1/datasets/import/upload", files=payload)
    assert duplicate.status_code == 409
    replacement = client.post("/api/v1/datasets/import/upload", files=payload, data={"replace_existing": "true"})
    assert replacement.status_code == 200
    unsafe = client.post("/api/v1/datasets/import/upload", files=[("files", ("../escape.json", json.dumps(dataset), "application/json"))])
    assert unsafe.status_code == 400


def test_timetable_generation_assignments_export_and_isolation(api_client):
    client, engine = api_client
    with Session(engine) as db:
        dataset, _ = add_dataset(db, "solver-target", with_schedule=False)
        other, other_schedule = add_dataset(db, "other-target")
        room = add_room(db, dataset)
        faculty = Faculty(
            dataset_id=dataset.id, source_id="F1", name="Faculty", department="CSE",
            max_hours_per_day=8, needs_accessible=False, unavailable=[], preferences=[],
        )
        course = Course(
            dataset_id=dataset.id, source_id="C1", title="Course", department="CSE",
            year=1, lecture_hours=1, tutorial_hours=0, lab_blocks=0,
        )
        group = StudentGroup(
            dataset_id=dataset.id, source_id="G1", name="Group", year=1,
            department="CSE", size=30, needs_accessible=False,
        )
        db.add_all([faculty, course, group])
        second_room = Room(
            dataset_id=dataset.id, source_id="R2", name="Test Room 2", building="Main",
            type="classroom", capacity=100, features=[], accessible=True,
            allowed_uses=["lecture", "event", "exam"],
        )
        exam = Examination(
            dataset_id=dataset.id, source_id="EX-1", course_ids=["C1"],
            group_ids=["G1"], size=90, duration_hours=2,
        )
        db.add_all([second_room, exam])
        db.flush()
        session = TimetableSession(
            dataset_id=dataset.id, source_id="S1", course_source_id=course.source_id,
            faculty_source_id=faculty.source_id, kind="lecture", size=30, duration=1,
            room_types=["classroom"], needs_accessible=False, basket_slot=None, fixed_slot=None,
        )
        db.add(session)
        db.flush()
        db.execute(session_groups.insert().values(dataset_id=dataset.id, session_source_id="S1", group_source_id="G1"))
        expected_room_id = room.source_id
        db.commit()
        dataset_id = dataset.id
        other_dataset_id = other.id
        other_schedule_id = other_schedule.id

    generated = client.post(f"/api/v1/datasets/{dataset_id}/schedules/generate", json={"team": "Test Team", "time_limit_seconds": 5})
    assert generated.status_code == 200, generated.text
    response = generated.json()
    assert response["status"] in {"optimal", "feasible"}
    assert response["scheduled_sessions"] == 1
    schedule_id = response["schedule_id"]

    assignments = client.get(f"/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/assignments")
    assert assignments.status_code == 200
    assert assignments.json()["status"] == "complete"
    assert assignments.json()["assignments"][0]["session_id"] == "S1"
    assert assignments.json()["assignments"][0]["course_name"] == "Course"
    assert assignments.json()["assignments"][0]["faculty_name"] == "Faculty"
    assert assignments.json()["assignments"][0]["student_groups"] == [{"id": "G1", "name": "Group"}]
    assert assignments.json()["assignments"][0]["end_period"] == assignments.json()["assignments"][0]["start_period"]
    export = client.get(f"/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/export")
    assert export.status_code == 200
    assert export.json()["dataset_id"] == "solver-target"
    assert export.json()["sessions"][0]["room_id"] == expected_room_id
    assert len(export.json()["exams"]) == 1
    assert len(export.json()["exams"][0]["rooms"]) == 2

    schedules = client.get(f"/api/v1/datasets/{dataset_id}/schedules")
    assert schedules.status_code == 200 and schedules.json()[0]["schedule_id"] == schedule_id
    assert schedules.json()[0]["status"] == "complete"
    detail = client.get(f"/api/v1/datasets/{dataset_id}/schedules/{schedule_id}")
    assert detail.status_code == 200 and detail.json()["created_at"]
    assert client.get(f"/api/v1/datasets/{dataset_id}/schedule-history").status_code == 200
    exams = client.get(f"/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/examinations")
    assert exams.status_code == 200
    assert len(exams.json()["examinations"][0]["rooms"]) == 2
    assert exams.json()["examinations"][0]["effective_allocated_capacity"] >= 90
    assignment = assignments.json()["assignments"][0]
    rooms = client.get(
        f"/api/v1/datasets/{dataset_id}/rooms",
        params={"schedule_id": schedule_id, "day": assignment["day"], "period": assignment["start_period"]},
    )
    assert rooms.status_code == 200
    room_by_id = {row["room_id"]: row for row in rooms.json()}
    assert room_by_id[assignment["room_id"]]["availability"] == "occupied"
    assert room_by_id[assignment["room_id"]]["utilization_percent"] is not None
    dashboard = client.get(f"/api/v1/datasets/{dataset_id}/summary")
    assert dashboard.status_code == 200
    assert dashboard.json()["counts"]["timetable_sessions"] == 1
    assert dashboard.json()["counts"]["examinations"] == 1
    assert dashboard.json()["latest_schedule"]["schedule_id"] == schedule_id
    assert dashboard.json()["room_utilisation_percent"] is not None

    assert client.get(f"/api/v1/datasets/{other_dataset_id}/schedules/{schedule_id}/assignments").status_code == 404
    assert client.get(f"/api/v1/datasets/{other_dataset_id}/schedules/{schedule_id}/export").status_code == 404
    assert client.get(f"/api/v1/datasets/{dataset_id}/schedules/{other_schedule_id}/assignments").status_code == 404
    assert client.post(f"/api/v1/datasets/{dataset_id}/schedules/{other_schedule_id}/bookings/run").status_code == 404
    assert client.get(f"/api/v1/datasets/{dataset_id}/schedules/not-a-uuid/assignments").status_code == 422
    assert client.post(f"/api/v1/datasets/{dataset_id}/schedules/generate", json={"team": "", "time_limit_seconds": 0}).status_code == 422


def test_booking_execution_outcome_retrieval_and_cross_dataset_protection(api_client):
    client, engine = api_client
    with Session(engine) as db:
        dataset, schedule = add_dataset(db, "booking-target")
        other, other_schedule = add_dataset(db, "booking-other")
        add_room(db, dataset)
        add_request(db, dataset)
        db.commit()
        dataset_id, schedule_id = dataset.id, schedule.id
        other_id, other_schedule_id = other.id, other_schedule.id

    run = client.post(f"/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/bookings/run")
    assert run.status_code == 200
    assert run.json()["counts"] == {"approved": 1, "rejected": 0, "pending": 0}
    first = client.get(f"/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/booking-outcomes")
    assert first.status_code == 200
    assert first.json()[0]["status"] == "approved"
    repeated = client.post(f"/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/bookings/run")
    assert repeated.status_code == 200
    outcomes = client.get(f"/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/booking-outcomes")
    assert outcomes.json() == first.json()
    booking_records = client.get(f"/api/v1/datasets/{dataset_id}/bookings", params={"schedule_id": schedule_id})
    assert booking_records.status_code == 200
    assert booking_records.json()[0]["title"] == "Test event"
    assert booking_records.json()[0]["effective_category"] == "club_event"
    assert booking_records.json()[0]["reason"]
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(BookingOutcome).where(
            BookingOutcome.dataset_id == dataset_id,
            BookingOutcome.schedule_id == schedule_id,
        )) == 1

    assert client.get(f"/api/v1/datasets/{other_id}/schedules/{schedule_id}/booking-outcomes").status_code == 404
    assert client.get(f"/api/v1/datasets/{dataset_id}/schedules/{other_schedule_id}/booking-outcomes").status_code == 404
    assert client.post(f"/api/v1/datasets/not-a-uuid/schedules/{schedule_id}/bookings/run").status_code == 422


def test_booking_parser_and_reviewed_intake_api(api_client):
    client, engine = api_client
    with Session(engine) as db:
        dataset, _ = add_dataset(db, "booking-intake", with_schedule=False)
        dataset_id = dataset.id
        db.commit()

    parsed = client.post("/api/v1/assistant/bookings/parse", json={
        "message": "Requester: Robotics Club, role: club, department: CSE, title: Robotics Contest. Need a classroom Thursday 6 to 7 pm for 30 participants, 1 hour.",
        "requester": {"requester": "Robotics Club", "role": "club", "department": "CSE"},
    })
    assert parsed.status_code == 200
    assert parsed.json()["status"] == "proposal_ready"
    assert parsed.json()["proposal"]["type"] == "booking"

    payload = parsed.json()["proposal"]["data"]
    payload["requested_category"] = "club_event"
    create = client.post(f"/api/v1/datasets/{dataset_id}/booking-requests", json={
        "data": payload, "raw_text": "Robotics Club event", "source_id": "web-idempotency-key-1",
    })
    assert create.status_code == 201, create.text
    assert create.json()["status"] == "pending"
    assert create.json()["priority_rank"] == 6
    duplicate = client.post(f"/api/v1/datasets/{dataset_id}/booking-requests", json={
        "data": payload, "raw_text": "retry", "source_id": "web-idempotency-key-1",
    })
    assert duplicate.status_code == 409
    listed = client.get(f"/api/v1/datasets/{dataset_id}/bookings")
    assert listed.status_code == 200 and len(listed.json()) == 1
