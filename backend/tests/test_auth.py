from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api import routes
from app.api.routes import get_db
from app.api.security import _login_attempts
from app.api.security import hash_password
from app.database.session import Base
from app.main import app
from app.models import BookingRequest, Course, Dataset, Examination, Faculty, Schedule, ScheduleRepairProposal, StudentGroup, User
from app.services.disruptions.repair import RepairError, approve_repair_proposal

PASSWORDS = {
    "admin": "TempPass-admin-2026!",
    "coordinator": "TempPass-coord-2026!",
    "faculty": "TempPass-faculty-2026!",
    "club": "TempPass-club-2026!",
}


@pytest.fixture
def auth_client():
    _login_attempts.clear()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    with Session(engine) as db:
        dataset = Dataset(
            source_dataset_id="auth-test",
            institute="Auth Test Campus",
            calendar={"days": ["MON"], "periods": [{"id": 1, "teaching": True}]},
            priority_order=["exam", "regular_session", "institute_event", "guest_lecture", "department_event", "club_event"],
            role_category_cap={"admin": "institute_event", "department_coordinator": "department_event", "faculty": "guest_lecture", "club": "club_event"},
        )
        db.add(dataset); db.flush()
        other_dataset = Dataset(
            source_dataset_id="auth-other", institute="Other Campus", calendar={}, priority_order=[], role_category_cap={},
        )
        db.add(other_dataset)
        faculty = Faculty(dataset_id=dataset.id, source_id="FAC-1", name="Test Faculty", department="CS", max_hours_per_day=6, needs_accessible=False, unavailable=[], preferences=[])
        db.add(faculty)
        users = {
            "admin": User(username="demo-admin", password_hash=hash_password(PASSWORDS["admin"]), role="admin"),
            "department_coordinator": User(username="demo-coordinator", password_hash=hash_password(PASSWORDS["coordinator"]), role="department_coordinator", dataset=dataset, department="CS"),
            "faculty": User(username="demo-faculty", password_hash=hash_password(PASSWORDS["faculty"]), role="faculty", dataset=dataset, department="CS", faculty_source_id="FAC-1"),
            "club_representative": User(username="demo-club", password_hash=hash_password(PASSWORDS["club"]), role="club_representative", dataset=dataset, club_id="club-a"),
        }
        db.add_all(users.values())
        db.commit()
        ids = {role: row.id for role, row in users.items()}
        dataset_id, other_dataset_id = dataset.id, other_dataset.id

    def override_get_db():
        with Session(engine) as db:
            try:
                yield db
                if db.in_transaction():
                    db.commit()
            except Exception:
                db.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            yield client, engine, ids, dataset_id, other_dataset_id
    finally:
        app.dependency_overrides.clear()
        _login_attempts.clear()
        engine.dispose()


def login(client: TestClient, username: str, password: str):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password}, headers={"Origin": "http://testserver"})


def test_health_is_public_and_protected_api_requires_a_session(auth_client):
    client, _engine, _ids, dataset_id, _other = auth_client
    assert client.get("/api/v1/health").status_code == 200
    ready = client.get("/api/v1/ready")
    assert ready.status_code == 200
    assert ready.json() == {"status": "ready", "database": "available"}
    assert client.get(f"/api/v1/datasets/{dataset_id}/rooms").status_code == 401


def test_readiness_database_failure_is_safe_and_not_reported_as_healthy(auth_client):
    client, *_ = auth_client

    class BrokenSession:
        def execute(self, statement):
            raise OperationalError(str(statement), {}, Exception("private connection detail"))

    def broken_db():
        yield BrokenSession()

    app.dependency_overrides[get_db] = broken_db
    response = client.get("/api/v1/ready")
    assert response.status_code == 503
    assert response.json() == {"detail": "Database is unavailable or the required schema migration is pending."}
    assert "private connection detail" not in response.text
    assert client.get("/api/v1/health").status_code == 200


def test_invalid_credentials_are_rejected(auth_client):
    client, *_ = auth_client
    response = login(client, "demo-admin", "incorrect-password")
    assert response.status_code == 401
    assert "axiom_session" not in response.cookies


@pytest.mark.parametrize("role,username,password", [
    ("admin", "demo-admin", PASSWORDS["admin"]),
    ("department_coordinator", "demo-coordinator", PASSWORDS["coordinator"]),
    ("faculty", "demo-faculty", PASSWORDS["faculty"]),
    ("club_representative", "demo-club", PASSWORDS["club"]),
])
def test_each_official_role_gets_server_assigned_session(auth_client, role, username, password):
    client, *_ = auth_client
    response = login(client, username, password)
    assert response.status_code == 200
    assert response.json()["user"]["role"] == role
    assert response.cookies.get("axiom_session")
    assert "HttpOnly" in response.headers["set-cookie"]
    assert client.get("/api/v1/auth/session").json()["user"]["role"] == role


def test_session_logout_revokes_session(auth_client):
    client, *_ = auth_client
    response = login(client, "demo-admin", PASSWORDS["admin"])
    csrf = response.json()["csrf_token"]
    assert client.post("/api/v1/auth/logout", headers={"Origin": "http://testserver", "X-CSRF-Token": csrf}).status_code == 204
    assert client.get("/api/v1/auth/session").status_code == 401


def test_mutations_require_origin_and_csrf(auth_client):
    client, *_ = auth_client
    response = login(client, "demo-admin", PASSWORDS["admin"])
    assert client.post("/api/v1/auth/logout").status_code == 403
    assert client.post("/api/v1/auth/logout", headers={"Origin": "http://testserver", "X-CSRF-Token": "wrong"}).status_code == 403
    assert client.get("/api/v1/auth/session").status_code == 200


def test_login_rate_limit_blocks_repeated_failures(auth_client):
    client, *_ = auth_client
    for _ in range(10):
        assert login(client, "missing-account", "invalid-password").status_code == 401
    assert login(client, "missing-account", "invalid-password").status_code == 429


def test_role_cannot_escalate_and_dataset_scope_is_enforced(auth_client):
    client, _engine, _ids, dataset_id, other_dataset_id = auth_client
    response = login(client, "demo-club", PASSWORDS["club"])
    csrf = response.json()["csrf_token"]
    headers = {"Origin": "http://testserver", "X-CSRF-Token": csrf}
    assert client.put(f"/api/v1/datasets/{dataset_id}/priority-order", json={"priority_order": ["club_event"]}, headers=headers).status_code == 403
    assert client.get(f"/api/v1/datasets/{other_dataset_id}/rooms").status_code == 403


@pytest.mark.parametrize("username,password", [
    ("demo-coordinator", PASSWORDS["coordinator"]),
    ("demo-faculty", PASSWORDS["faculty"]),
    ("demo-club", PASSWORDS["club"]),
])
def test_non_admin_roles_cannot_access_demo_reset(auth_client, username, password):
    client, _engine, _ids, dataset_id, _other = auth_client
    auth = login(client, username, password)
    headers = {"Origin": "http://testserver", "X-CSRF-Token": auth.json()["csrf_token"]}
    response = client.post(f"/api/v1/datasets/{dataset_id}/demo-reset", headers=headers)
    assert response.status_code == 403


def test_club_booking_identity_is_derived_from_session(auth_client):
    client, _engine, _ids, dataset_id, _other = auth_client
    response = login(client, "demo-club", PASSWORDS["club"])
    csrf = response.json()["csrf_token"]
    result = client.post(
        f"/api/v1/datasets/{dataset_id}/booking-requests",
        headers={"Origin": "http://testserver", "X-CSRF-Token": csrf},
        json={"source_id": "web-role-test", "raw_text": "venue request", "data": {
            "requester": "spoofed identity", "role": "admin", "department": "spoofed",
            "requested_category": "club_event", "title": "Club meetup", "attendance": 12,
            "duration_periods": 1, "windows": [{"day": "MON", "from_period": 1, "to_period": 1}],
            "room_types": ["classroom"], "needs": [], "requested_room": None,
            "mandatory_for_groups": [], "series_id": None,
        }},
    )
    assert result.status_code == 201, result.text
    assert result.json()["requester"] == "demo-club"
    assert result.json()["role"] == "club"
    assert result.json()["department"] is None


def test_faculty_cannot_query_another_facultys_timetable(auth_client):
    client, *_rest, dataset_id, _other = auth_client
    login(client, "demo-faculty", PASSWORDS["faculty"])
    response = client.get(f"/api/v1/datasets/{dataset_id}/schedules/{uuid4()}/assignments?faculty_id=FAC-OTHER")
    assert response.status_code == 403


def test_club_cannot_cancel_another_users_request(auth_client):
    client, engine, ids, dataset_id, _other = auth_client
    with Session(engine) as db:
        request = BookingRequest(
            dataset_id=dataset_id, source_id="web-other-club", submitted_at=datetime.now(timezone.utc),
            requester="Other club", role="club_representative", requested_category="club_event", title="Event",
            attendance=12, duration_periods=1, windows=[{"day": "MON", "from_period": 1, "to_period": 1}],
            room_types=["classroom"], needs=[], requested_room=None, mandatory_for_groups=[], series_id=None,
            created_by_user_id=ids["admin"], club_id="other-club", raw_text="",
        )
        db.add(request); db.commit()
    response = login(client, "demo-club", PASSWORDS["club"])
    result = client.post(
        f"/api/v1/datasets/{dataset_id}/bookings/web-other-club/cancel",
        json={"reason": "cancel"}, headers={"Origin": "http://testserver", "X-CSRF-Token": response.json()["csrf_token"]},
    )
    assert result.status_code == 403


@pytest.mark.parametrize("role,username,password", [
    ("faculty", "demo-faculty", PASSWORDS["faculty"]),
    ("club_representative", "demo-club", PASSWORDS["club"]),
    ("admin", "demo-admin", PASSWORDS["admin"]),
])
def test_only_department_coordinator_can_access_lab_approval_routes(auth_client, role, username, password):
    client, _engine, _ids, dataset_id, _other = auth_client
    auth = login(client, username, password)
    headers = {"Origin": "http://testserver", "X-CSRF-Token": auth.json()["csrf_token"]}
    response = client.get(f"/api/v1/datasets/{dataset_id}/schedules/{uuid4()}/department-lab-bookings")
    assert response.status_code == 403
    decision = client.post(f"/api/v1/datasets/{dataset_id}/schedules/{uuid4()}/bookings/none/department-lab-decision", headers=headers, json={"decision": "approve", "room_id": "lab", "day": "MON", "start_period": 1})
    assert decision.status_code == 403


@pytest.mark.parametrize("username,password", [
    ("demo-coordinator", PASSWORDS["coordinator"]),
    ("demo-faculty", PASSWORDS["faculty"]),
    ("demo-club", PASSWORDS["club"]),
])
def test_only_admin_can_decide_class_move_booking_proposals(auth_client, username, password):
    client, _engine, _ids, dataset_id, _other = auth_client
    auth = login(client, username, password)
    headers = {"Origin": "http://testserver", "X-CSRF-Token": auth.json()["csrf_token"]}
    response = client.post(f"/api/v1/datasets/{dataset_id}/class-move-proposals/{uuid4()}/decision", headers=headers, json={"decision": "approve"})
    assert response.status_code == 403


def test_department_coordinator_cannot_change_another_department_availability(auth_client):
    _client, engine, ids, dataset_id, _other = auth_client
    with Session(engine) as db:
        db.add(Faculty(dataset_id=dataset_id, source_id="FAC-2", name="Other Department", department="EE", max_hours_per_day=6, needs_accessible=False, unavailable=[], preferences=[]))
        db.commit()
        coordinator = db.get(User, ids["department_coordinator"])
        with pytest.raises(HTTPException) as error:
            routes._assert_change_scope(db, dataset_id, coordinator, [SimpleNamespace(type="faculty_unavailable", faculty_id="FAC-2")])
        assert error.value.status_code == 403


def test_faculty_user_source_reference_is_same_dataset(auth_client):
    _client, engine, _ids, _dataset_id, other_dataset_id = auth_client
    with Session(engine) as db:
        invalid = User(
            username="cross-dataset-faculty", password_hash="unused", role="faculty",
            dataset_id=other_dataset_id, department="CS", faculty_source_id="FAC-1",
        )
        db.add(invalid)
        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()


def test_department_examination_view_filters_other_departments(auth_client):
    client, engine, _ids, dataset_id, _other = auth_client
    with Session(engine) as db:
        schedule = Schedule(dataset_id=dataset_id, source_id="exam-schedule", team="test")
        db.add(schedule); db.flush()
        db.add_all([
            Course(dataset_id=dataset_id, source_id="C-CS", title="CS exam", department="CS", year=1, lecture_hours=1, tutorial_hours=0, lab_blocks=0),
            Course(dataset_id=dataset_id, source_id="C-EE", title="EE exam", department="EE", year=1, lecture_hours=1, tutorial_hours=0, lab_blocks=0),
            StudentGroup(dataset_id=dataset_id, source_id="G-CS", name="CS group", year=1, department="CS", size=30, needs_accessible=False),
            StudentGroup(dataset_id=dataset_id, source_id="G-EE", name="EE group", year=1, department="EE", size=20, needs_accessible=False),
        ])
        db.add(Examination(dataset_id=dataset_id, source_id="EX-1", course_ids=["C-CS", "C-EE"], group_ids=["G-CS", "G-EE"], size=50, duration_hours=1))
        db.commit()
        schedule_id = schedule.id
    login(client, "demo-coordinator", PASSWORDS["coordinator"])
    response = client.get(f"/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/examinations")
    assert response.status_code == 200
    exam = response.json()["examinations"][0]
    assert exam["course_ids"] == ["C-CS"]
    assert exam["group_ids"] == ["G-CS"]
    assert exam["expected_attendance"] == 30


def test_repair_service_rejects_self_approval_and_database_check_is_present(auth_client):
    _client, engine, ids, dataset_id, _other = auth_client
    with Session(engine) as db:
        schedule = Schedule(dataset_id=dataset_id, source_id="auth-schedule", team="test")
        db.add(schedule); db.flush()
        proposal = ScheduleRepairProposal(
            dataset_id=dataset_id, baseline_schedule_id=schedule.id, status="proposed",
            input_fingerprint="0" * 64, changes=[], assignments=[], exam_allocations=[],
            affected_session_ids=[], changed_session_ids=[], objective={}, explanation="proposal",
            created_by_user_id=ids["admin"],
        )
        db.add(proposal); db.commit()
        with pytest.raises(RepairError, match="cannot approve their own"):
            approve_repair_proposal(db, dataset_id, schedule.id, proposal.id, decided_by_user_id=ids["admin"])
        proposal.status = "approved"
        proposal.decided_by_user_id = ids["admin"]
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
