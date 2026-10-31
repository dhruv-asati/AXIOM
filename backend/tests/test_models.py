import unittest
import uuid
import warnings
import ast
from pathlib import Path

from sqlalchemy import ForeignKeyConstraint, UniqueConstraint, create_engine, event
from sqlalchemy.exc import IntegrityError, SAWarning
from sqlalchemy.orm import Session, configure_mappers

from app.database.session import Base
from app.models import (
    BookingOutcome, BookingRequest, Course, Dataset, ExamRoomAllocation, Examination,
    Faculty, Room, Schedule, ScheduleOverride, ScheduleSessionAssignment,
    StudentGroup, TimetableSession,
)

EXPECTED_TABLES = {
    "datasets", "faculty", "courses", "student_groups", "rooms", "room_unavailability",
    "session_groups", "timetable_sessions", "booking_requests", "cancellations",
    "schedules", "schedule_session_assignments", "booking_outcomes", "examinations",
    "exam_room_allocations", "schedule_overrides",
}


class ModelMetadataTests(unittest.TestCase):
    def test_all_models_import_and_register(self):
        self.assertEqual(EXPECTED_TABLES, set(Base.metadata.tables))

    def test_mapper_configuration_has_no_sa_warnings(self):
        with warnings.catch_warnings():
            warnings.simplefilter("error", SAWarning)
            configure_mappers()

    def test_source_records_have_dataset_scoped_unique_keys(self):
        for name in ("faculty", "courses", "student_groups", "rooms", "timetable_sessions", "booking_requests", "examinations", "schedules"):
            table = Base.metadata.tables[name]
            self.assertTrue(any(isinstance(c, UniqueConstraint) and {col.name for col in c.columns} == {"dataset_id", "source_id"} for c in table.constraints), name)

    def test_all_composite_fks_have_matching_unique_or_primary_target(self):
        for table in Base.metadata.tables.values():
            for fk in table.foreign_key_constraints:
                if len(fk.column_keys) < 2:
                    continue
                target = list(fk.elements)[0].column.table
                cols = {e.column.name for e in fk.elements}
                valid = set(target.primary_key.columns.keys()) == cols or any(isinstance(c, UniqueConstraint) and {x.name for x in c.columns} == cols for c in target.constraints)
                self.assertTrue(valid, f"{table.name}: {fk.name} targets non-unique {target.name}{cols}")

    def test_schedule_children_keep_composite_dataset_foreign_keys(self):
        expected = {
            "schedule_session_assignments": {"schedules": {"schedule_id", "dataset_id"}},
            "booking_outcomes": {"schedules": {"schedule_id", "dataset_id"}},
            "exam_room_allocations": {"schedules": {"schedule_id", "dataset_id"}},
            "schedule_overrides": {"schedules": {"schedule_id", "dataset_id"}},
        }
        for table_name, targets in expected.items():
            table = Base.metadata.tables[table_name]
            for target, local_cols in targets.items():
                self.assertTrue(any(set(fk.column_keys) == local_cols and {e.column.table.name for e in fk.elements} == {target} for fk in table.foreign_key_constraints), table_name)

    def test_source_id_composite_fks_are_dataset_scoped(self):
        required = {
            "timetable_sessions": {"courses": {"dataset_id", "course_source_id"}, "faculty": {"dataset_id", "faculty_source_id"}},
            "room_unavailability": {"rooms": {"dataset_id", "room_source_id"}},
            "session_groups": {"timetable_sessions": {"dataset_id", "session_source_id"}, "student_groups": {"dataset_id", "group_source_id"}},
        }
        for table_name, targets in required.items():
            table = Base.metadata.tables[table_name]
            for target, local in targets.items():
                self.assertTrue(any(set(fk.column_keys) == local and {e.column.table.name for e in fk.elements} == {target} for fk in table.foreign_key_constraints), f"{table_name}->{target}")

    def test_relationship_sync_pairs_exclude_dataset_id(self):
        expected = [
            (ScheduleSessionAssignment, "session", "source_id", "session_source_id"),
            (ScheduleSessionAssignment, "room", "source_id", "room_source_id"),
            (BookingOutcome, "schedule", "id", "schedule_id"),
            (BookingOutcome, "request", "source_id", "request_source_id"),
            (ExamRoomAllocation, "schedule", "id", "schedule_id"),
            (ExamRoomAllocation, "examination", "source_id", "examination_source_id"),
            (ExamRoomAllocation, "room", "source_id", "room_source_id"),
            (ScheduleOverride, "schedule", "id", "schedule_id"),
            (ScheduleOverride, "session", "source_id", "session_source_id"),
        ]
        for model, relname, parent_col, child_col in expected:
            rel = model.__mapper__.relationships[relname]
            self.assertFalse(rel.viewonly, (model.__name__, relname))
            pairs = {(a.name, b.name) for a, b in rel.synchronize_pairs}
            self.assertEqual({(parent_col, child_col)}, pairs, (model.__name__, relname, pairs))
            self.assertNotIn("dataset_id", {b for _, b in pairs})

    def test_assignment_does_not_overwrite_dataset_id(self):
        dataset_id = uuid.uuid4()
        engine = create_engine("sqlite://")
        @event.listens_for(engine, "connect")
        def enable_foreign_keys(dbapi_connection, _):
            dbapi_connection.execute("PRAGMA foreign_keys=ON")
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            ds = Dataset(source_dataset_id="dataset-one", institute="Test", calendar={}, priority_order=[], role_category_cap={})
            db.add(ds)
            db.flush()
            room = Room(dataset_id=ds.id, source_id="R1", name="Room", building="B", type="classroom", capacity=10, features=[], accessible=False, allowed_uses=[])
            course = Course(dataset_id=ds.id, source_id="C1", title="Course", department="X", year=1, lecture_hours=1, tutorial_hours=0, lab_blocks=0)
            faculty = Faculty(dataset_id=ds.id, source_id="F1", name="Faculty", department="X", max_hours_per_day=4, needs_accessible=False, unavailable=[], preferences=[])
            schedule = Schedule(dataset_id=ds.id, source_id="schedule-one", team="Team")
            db.add_all([room, course, faculty, schedule])
            db.flush()
            session = TimetableSession(dataset_id=ds.id, source_id="S1", course_source_id="C1", faculty_source_id="F1", kind="lecture", size=10, duration=1, room_types=[], needs_accessible=False)
            db.add(session)
            db.flush()
            assignment = ScheduleSessionAssignment(dataset_id=ds.id, schedule_id=schedule.id, session_source_id="S1", room_source_id="R1", day="MON", start_period=1)
            db.add(assignment)
            db.flush()
            assignment.dataset_id = ds.id
            assignment.session = session
            assignment.room = room
            db.flush()
            self.assertEqual(ds.id, assignment.dataset_id)
            self.assertEqual("S1", assignment.session_source_id)
            self.assertEqual("R1", assignment.room_source_id)
            db.expire(assignment, ["session", "room"])
            self.assertEqual("S1", assignment.session.source_id)
            self.assertEqual("R1", assignment.room.source_id)

            other = Dataset(source_dataset_id="dataset-two", institute="Other", calendar={}, priority_order=[], role_category_cap={})
            db.add(other)
            db.flush()
            foreign_schedule = Schedule(dataset_id=other.id, source_id="schedule-two", team="Other")
            db.add(foreign_schedule)
            db.flush()
            invalid = ScheduleSessionAssignment(
                dataset_id=ds.id,
                schedule_id=foreign_schedule.id,
                session_source_id="S1",
                room_source_id="R1",
                day="MON",
                start_period=2,
            )
            db.add(invalid)
            with self.assertRaises(IntegrityError):
                db.flush()

    def test_initial_migration_matches_registered_tables(self):
        migration_files = list((Path(__file__).parents[1] / "migrations" / "versions").glob("*_initial_schema.py"))
        self.assertEqual(1, len(migration_files))
        tree = ast.parse(migration_files[0].read_text(encoding="utf-8"))
        creates = [n.args[0].value for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == "create_table"]
        drops = [n.args[0].value for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == "drop_table"]
        self.assertEqual(EXPECTED_TABLES, set(creates))
        self.assertEqual(EXPECTED_TABLES, set(drops))


if __name__ == "__main__":
    unittest.main()
