import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker

from app.commands import provision_demo_accounts
from app.commands.provision_demo_accounts import _read_accounts
from app.database.session import Base
from app.models import Course, Dataset, Faculty, StudentGroup, User


def valid_accounts():
    roles = ["admin", "department_coordinator", "faculty", "club_representative"]
    return [
        {"username": f"user-{index}@example.invalid", "password": "a-long-demo-password-123", "role": role}
        for index, role in enumerate(roles)
    ]


def test_demo_configuration_requires_each_official_role_once():
    accounts = _read_accounts(__import__("json").dumps(valid_accounts()))
    assert {row["role"] for row in accounts} == {"admin", "department_coordinator", "faculty", "club_representative"}
    assert all(row["username"] == row["username"].casefold() for row in accounts)


def test_demo_configuration_rejects_missing_roles_duplicate_names_and_weak_passwords():
    accounts = valid_accounts()
    with pytest.raises(ValueError, match="exactly four"):
        _read_accounts(__import__("json").dumps(accounts[:3]))
    accounts[1]["username"] = accounts[0]["username"].upper()
    with pytest.raises(ValueError, match="unique username"):
        _read_accounts(__import__("json").dumps(accounts))
    accounts = valid_accounts()
    accounts[0]["password"] = "short"
    with pytest.raises(ValueError, match="at least 14"):
        _read_accounts(__import__("json").dumps(accounts))


def test_provision_is_idempotent_and_never_resets_or_overwrites_existing_accounts(monkeypatch):
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(provision_demo_accounts, "SessionLocal", factory)
    with Session(engine) as db:
        dataset = Dataset(source_dataset_id="provision-test", institute="Test", calendar={}, priority_order=[], role_category_cap={})
        db.add(dataset); db.flush()
        db.add_all([
            Faculty(dataset_id=dataset.id, source_id="FAC-1", name="Faculty", department="CSE", max_hours_per_day=6, needs_accessible=False, unavailable=[], preferences=[]),
            Course(dataset_id=dataset.id, source_id="COURSE-1", title="Course", department="CSE", year=1, lecture_hours=1, tutorial_hours=0, lab_blocks=0),
            StudentGroup(dataset_id=dataset.id, source_id="GROUP-1", name="Group", year=1, department="CSE", size=30, needs_accessible=False),
        ])
        db.commit()
    accounts = [
        {"username": "admin", "password": "Admin-seed-secret-2026", "role": "admin"},
        {"username": "coordinator", "password": "Coordinator-seed-2026", "role": "department_coordinator", "dataset_source_id": "provision-test", "department": "CSE"},
        {"username": "faculty", "password": "Faculty-seed-secret-2026", "role": "faculty", "dataset_source_id": "provision-test", "faculty_source_id": "FAC-1"},
        {"username": "club", "password": "Club-seed-secret-2026", "role": "club_representative", "dataset_source_id": "provision-test", "club_id": "club-cse"},
    ]
    provision_demo_accounts.provision(accounts)
    with Session(engine) as db:
        initial = {row.username: row.password_hash for row in db.scalars(select(User)).all()}
    provision_demo_accounts.provision(accounts)
    with Session(engine) as db:
        saved = {row.username: row for row in db.scalars(select(User)).all()}
        assert {key: row.password_hash for key, row in saved.items()} == initial
        assert saved["coordinator"].department == "CSE"
        assert saved["faculty"].faculty_source_id == "FAC-1"
    changed = [dict(row) for row in accounts]
    changed[0]["password"] = "Different-admin-secret-2026"
    with pytest.raises(ValueError, match="refusing to reset"):
        provision_demo_accounts.provision(changed)
    with Session(engine) as db:
        assert db.scalar(select(User).where(User.username == "admin")).password_hash == initial["admin"]
    engine.dispose()
