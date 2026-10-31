import copy
import json
import pathlib
import pytest
from sqlalchemy import create_engine, event, select, func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.database.session import Base
from app.models import Dataset, Faculty, Course, StudentGroup, Room, RoomUnavailability, TimetableSession, BookingRequest, Cancellation, Examination
from app.models.entities import session_groups
from app.services.datasets.importer import import_dataset, DatasetImportError, load_dataset

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "cit_public.json"

@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    @event.listens_for(engine, "connect")
    def fk_on(conn, _): conn.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()

def count(db, model): return db.scalar(select(func.count()).select_from(model))

def test_import_full_dataset_and_preserve_relationships(db):
    result = import_dataset(db, DATA)
    assert result["source_dataset_id"] == "cit-public-v1"
    assert result["counts"] == {"faculty":40,"courses":62,"student_groups":14,"rooms":27,"room_unavailability":2,"timetable_sessions":189,"session_groups":sum(len(s['groups']) for s in json.loads(DATA.read_text())['sessions']),"booking_requests":25,"cancellations":1,"examinations":41}
    assert count(db, Dataset) == 1
    assert count(db, Faculty) == 40 and count(db, Course) == 62 and count(db, Room) == 27
    assert count(db, TimetableSession) == 189 and count(db, BookingRequest) == 25
    assert count(db, Examination) == 41 and count(db, Cancellation) == 1
    first = db.scalar(select(TimetableSession).where(TimetableSession.source_id == "MA101-AB-L1"))
    assert first.course.source_id == "MA101"
    assert first.faculty.source_id == "F19"
    assert {g.source_id for g in first.groups} == {"Y1-A", "Y1-B"}

def test_reimport_is_idempotent(db):
    first = import_dataset(db, DATA)
    second = import_dataset(db, DATA)
    assert first["dataset_id"] == second["dataset_id"]
    assert count(db, Dataset) == 1
    assert count(db, Faculty) == 40 and count(db, TimetableSession) == 189
    assert count(db, RoomUnavailability) == 2
    assert count(db, session_groups) == first["counts"]["session_groups"]

def test_malformed_data_rejected_before_write(db, tmp_path):
    payload = json.loads(DATA.read_text())
    payload["courses"][0].pop("title")
    target = tmp_path / "malformed.json"
    target.write_text(json.dumps(payload))
    with pytest.raises(DatasetImportError, match="title"):
        import_dataset(db, target)
    assert count(db, Dataset) == 0

def test_csv_supplements_a_collection_missing_from_json(tmp_path):
    payload = json.loads(DATA.read_text())
    payload.pop("faculty")
    (tmp_path / "dataset.json").write_text(json.dumps(payload))
    csv_dir = tmp_path / "csv"
    csv_dir.mkdir()
    (csv_dir / "faculty.csv").write_text("id,name,department,max_hours_per_day,needs_accessible,unavailable,preferences\nF-x,Example,CSE,4,false,[],[]\n")
    loaded = load_dataset(tmp_path)
    assert loaded["faculty"] == [{"id":"F-x","name":"Example","department":"CSE","max_hours_per_day":4,"needs_accessible":False,"unavailable":[],"preferences":[]}]

def test_database_failure_rolls_back_entire_import(db, tmp_path):
    payload = json.loads(DATA.read_text())
    payload["faculty"][0]["max_hours_per_day"] = -1
    target = tmp_path / "bad-check.json"
    target.write_text(json.dumps(payload))
    with pytest.raises(IntegrityError):
        import_dataset(db, target)
    db.rollback()
    assert count(db, Dataset) == 0
    assert count(db, Faculty) == 0
