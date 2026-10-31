import pytest
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session

from app.database.session import Base
from app.models import (
    Course, Dataset, ExamRoomAllocation, Examination, Faculty, Room,
    RoomUnavailability, Schedule, ScheduleSessionAssignment, StudentGroup,
    TimetableSession,
)
from app.models.entities import session_groups
from app.services.timetable.solver import (
    InfeasibleTimetableError,
    _score_solution,
    export_schedule,
    generate_schedule,
    get_schedule_assignments,
)
from app.main import app


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


def add_dataset(db, source="solver-test", days=None):
    days = days or ["MON", "TUE"]
    dataset = Dataset(
        source_dataset_id=source,
        institute="Solver Test Institute",
        calendar={
            "days": days,
            "periods": [{"id": period, "teaching": True} for period in range(1, 10)],
            "lunch": {"after_period": 5},
            "lab_start_periods": [2, 6],
            "exam_week": {"days": ["MON", "TUE"], "sessions": [{"id": "AM"}, {"id": "PM"}]},
        },
        priority_order=["exam", "regular_session", "institute_event", "guest_lecture", "department_event", "club_event"],
        role_category_cap={"admin": "institute_event"},
    )
    db.add(dataset)
    db.flush()
    return dataset


def add_faculty(db, dataset, source, *, max_hours=8, unavailable=None, preferences=None):
    faculty = Faculty(
        dataset_id=dataset.id, source_id=source, name=source, department="CSE",
        max_hours_per_day=max_hours, needs_accessible=False,
        unavailable=unavailable or [], preferences=preferences or [],
    )
    db.add(faculty)
    db.flush()
    return faculty


def add_room(db, dataset, source, *, room_type="classroom", capacity=100, features=None, accessible=True, allowed=None):
    room = Room(
        dataset_id=dataset.id, source_id=source, name=source, building="Main",
        type=room_type, capacity=capacity, features=features or [], accessible=accessible,
        allowed_uses=allowed or ["lecture", "tutorial", "lab", "exam"],
    )
    db.add(room)
    db.flush()
    return room


def add_group(db, dataset, source):
    group = StudentGroup(
        dataset_id=dataset.id, source_id=source, name=source, year=3,
        department="CSE", size=30, needs_accessible=False,
    )
    db.add(group)
    db.flush()
    return group


def add_session(db, dataset, source, faculty, groups, *, course=None, kind="lecture", duration=1, basket=None, fixed=None, size=20, room_types=None, accessible=False):
    course = course or f"C-{source}"
    if db.scalar(select(Course).where(Course.dataset_id == dataset.id, Course.source_id == course)) is None:
        db.add(Course(dataset_id=dataset.id, source_id=course, title=course, department="CSE", year=3, lecture_hours=1, tutorial_hours=0, lab_blocks=0))
        db.flush()
    session = TimetableSession(
        dataset_id=dataset.id, source_id=source, course_source_id=course,
        faculty_source_id=faculty.source_id, kind=kind, size=size, duration=duration,
        room_types=room_types or (["lab_cs"] if kind == "lab" else ["classroom"]),
        needs_accessible=accessible, basket_slot=basket, fixed_slot=fixed,
    )
    db.add(session)
    db.flush()
    for group in groups:
        db.execute(session_groups.insert().values(dataset_id=dataset.id, session_source_id=source, group_source_id=group.source_id))
    return session


def test_basket_synchronizes_and_combined_session_reserves_all_groups(db):
    dataset = add_dataset(db)
    group_a, group_b = add_group(db, dataset, "G-A"), add_group(db, dataset, "G-B")
    rooms = [add_room(db, dataset, f"R{i}") for i in range(1, 4)]
    f1, f2, f3 = [add_faculty(db, dataset, f"F{i}") for i in range(1, 4)]
    add_session(db, dataset, "OE-1", f1, [group_a, group_b], course="OE1", basket="OEB")
    add_session(db, dataset, "OE-2", f2, [group_a, group_b], course="OE2", basket="OEB")
    add_session(db, dataset, "COMBINED", f3, [group_a, group_b], course="COMBINED")
    db.commit()

    result = generate_schedule(db, dataset.id, time_limit_seconds=10)
    placements = get_schedule_assignments(db, dataset.id, result.schedule_id)["assignments"]
    by_id = {row["session_id"]: row for row in placements}
    assert result.scheduled_sessions == 3 and result.status in {"optimal", "feasible"}
    assert (by_id["OE-1"]["day"], by_id["OE-1"]["start_period"]) == (by_id["OE-2"]["day"], by_id["OE-2"]["start_period"])
    assert by_id["OE-1"]["room_id"] != by_id["OE-2"]["room_id"]
    assert (by_id["COMBINED"]["day"], by_id["COMBINED"]["start_period"]) != (by_id["OE-1"]["day"], by_id["OE-1"]["start_period"])


def test_three_hour_lab_starts_only_at_allowed_period(db):
    dataset = add_dataset(db, days=["MON"])
    group = add_group(db, dataset, "G")
    faculty = add_faculty(db, dataset, "F")
    add_room(db, dataset, "LAB", room_type="lab_cs", allowed=["lab"])
    add_session(db, dataset, "LAB-1", faculty, [group], kind="lab", duration=3, room_types=["lab_cs"])
    db.commit()
    result = generate_schedule(db, dataset.id, time_limit_seconds=10)
    assignment = get_schedule_assignments(db, dataset.id, result.schedule_id)["assignments"][0]
    assert assignment["start_period"] in {2, 6}


def test_fixed_slot_and_unavailability_are_hard_constraints(db):
    dataset = add_dataset(db, days=["MON", "TUE"])
    group = add_group(db, dataset, "G")
    faculty = add_faculty(db, dataset, "F", unavailable=[{"day": "MON", "periods": [2]}])
    add_room(db, dataset, "R")
    add_session(db, dataset, "FIXED", faculty, [group], fixed={"day": "TUE", "start_period": 4})
    db.add(RoomUnavailability(dataset_id=dataset.id, room_source_id="R", day="TUE", periods=[4], reason="maintenance"))
    add_room(db, dataset, "R2")
    db.commit()
    result = generate_schedule(db, dataset.id, time_limit_seconds=10)
    assignment = get_schedule_assignments(db, dataset.id, result.schedule_id)["assignments"][0]
    assert (assignment["day"], assignment["start_period"], assignment["room_id"]) == ("TUE", 4, "R2")


def test_faculty_unavailability_excluded_from_candidate_times(db):
    dataset = add_dataset(db, days=["MON"])
    group = add_group(db, dataset, "G")
    faculty = add_faculty(db, dataset, "F", unavailable=[{"day": "MON", "periods": list(range(1, 9))}])
    add_room(db, dataset, "R")
    add_session(db, dataset, "S", faculty, [group])
    db.commit()
    result = generate_schedule(db, dataset.id, time_limit_seconds=5)
    assignment = get_schedule_assignments(db, dataset.id, result.schedule_id)["assignments"][0]
    assert assignment["start_period"] == 9


@pytest.mark.parametrize(
    ("room_kwargs", "session_kwargs"),
    [
        ({"capacity": 10}, {"size": 100}),
        ({"room_type": "seminar_hall"}, {"room_types": ["classroom"]}),
        ({"accessible": False}, {"accessible": True}),
        ({"allowed": ["tutorial"]}, {"kind": "lecture"}),
    ],
)
def test_room_capacity_type_accessibility_and_use_are_hard(room_kwargs, session_kwargs, db):
    dataset = add_dataset(db, days=["MON"])
    group = add_group(db, dataset, "G")
    faculty = add_faculty(db, dataset, "F")
    add_room(db, dataset, "R", **room_kwargs)
    add_session(db, dataset, "S", faculty, [group], **session_kwargs)
    db.commit()
    with pytest.raises(InfeasibleTimetableError):
        generate_schedule(db, dataset.id, time_limit_seconds=5)


@pytest.mark.parametrize("conflict", ["room", "faculty", "group"])
def test_resource_clashes_are_hard(conflict, db):
    dataset = add_dataset(db, days=["MON"])
    groups = [add_group(db, dataset, f"G{i}") for i in range(2)]
    faculty = [add_faculty(db, dataset, f"F{i}") for i in range(2)]
    add_room(db, dataset, "R1")
    add_room(db, dataset, "R2")
    fixed = {"day": "MON", "start_period": 2}
    if conflict == "room":
        # Distinct groups/faculty, but both forced into the only allowed room.
        add_session(db, dataset, "S1", faculty[0], [groups[0]], fixed=fixed)
        add_session(db, dataset, "S2", faculty[1], [groups[1]], fixed=fixed)
        db.query(Room).filter_by(dataset_id=dataset.id, source_id="R2").one().allowed_uses = ["tutorial"]
    elif conflict == "faculty":
        add_session(db, dataset, "S1", faculty[0], [groups[0]], fixed=fixed)
        add_session(db, dataset, "S2", faculty[0], [groups[1]], fixed=fixed)
    else:
        add_session(db, dataset, "S1", faculty[0], [groups[0]], fixed=fixed)
        add_session(db, dataset, "S2", faculty[1], [groups[0]], fixed=fixed)
    db.commit()
    with pytest.raises(InfeasibleTimetableError):
        generate_schedule(db, dataset.id, time_limit_seconds=5)


def test_faculty_daily_hour_limit_is_hard(db):
    dataset = add_dataset(db, days=["MON"])
    group_a, group_b = add_group(db, dataset, "A"), add_group(db, dataset, "B")
    faculty = add_faculty(db, dataset, "F", max_hours=1)
    add_room(db, dataset, "R1")
    add_room(db, dataset, "R2")
    add_session(db, dataset, "S1", faculty, [group_a], fixed={"day": "MON", "start_period": 1})
    add_session(db, dataset, "S2", faculty, [group_b], fixed={"day": "MON", "start_period": 2})
    db.commit()
    with pytest.raises(InfeasibleTimetableError):
        generate_schedule(db, dataset.id, time_limit_seconds=5)


def test_infeasible_session_is_reported_and_not_persisted(db):
    dataset = add_dataset(db, days=["MON"])
    group = add_group(db, dataset, "G")
    faculty = add_faculty(db, dataset, "F")
    add_room(db, dataset, "TOO-SMALL", capacity=10)
    add_session(db, dataset, "TOO-LARGE", faculty, [group], size=100)
    db.commit()
    with pytest.raises(InfeasibleTimetableError, match="No legal room/time candidate"):
        generate_schedule(db, dataset.id, time_limit_seconds=5)
    assert db.scalar(select(func.count()).select_from(Schedule).where(Schedule.dataset_id == dataset.id)) == 0
    assert db.scalar(select(func.count()).select_from(ScheduleSessionAssignment)) == 0


def test_dataset_isolation_and_complete_export_in_validator_shape(db):
    first = add_dataset(db, "first", days=["MON"])
    second = add_dataset(db, "second", days=["MON"])
    g1, g2 = add_group(db, first, "G"), add_group(db, second, "G")
    f1, f2 = add_faculty(db, first, "F"), add_faculty(db, second, "F")
    add_room(db, first, "R")
    add_room(db, second, "R")
    add_session(db, first, "S", f1, [g1])
    add_session(db, second, "S", f2, [g2])
    db.add(Examination(dataset_id=first.id, source_id="EX-1", course_ids=[], group_ids=["G"], size=30, duration_hours=2))
    db.commit()
    generated = generate_schedule(db, first.id, team="AXIOM", time_limit_seconds=10)
    assert db.scalar(select(func.count()).select_from(ScheduleSessionAssignment).where(ScheduleSessionAssignment.dataset_id == second.id)) == 0
    assert db.scalar(select(func.count()).select_from(ExamRoomAllocation).where(ExamRoomAllocation.dataset_id == first.id)) >= 1
    output = export_schedule(db, first.id, generated.schedule_id)
    assert set(output) == {"team", "dataset_id", "sessions", "exams"}
    assert output["dataset_id"] == "first"
    assert output["sessions"] == [{"session_id": "S", "day": "MON", "start_period": output["sessions"][0]["start_period"], "room_id": "R"}]
    assert output["exams"][0]["exam_id"] == "EX-1"
    assert len(output["exams"][0]["rooms"]) == 1


def test_same_group_exams_cannot_share_exam_slot(db):
    dataset = add_dataset(db, days=["MON"])
    dataset.calendar = {**dataset.calendar, "exam_week": {"days": ["MON"], "sessions": [{"id": "AM"}]}}
    add_room(db, dataset, "R", capacity=100)
    db.add(Examination(dataset_id=dataset.id, source_id="EX1", course_ids=[], group_ids=["G"], size=30, duration_hours=2))
    db.add(Examination(dataset_id=dataset.id, source_id="EX2", course_ids=[], group_ids=["G"], size=30, duration_hours=2))
    db.commit()
    with pytest.raises(InfeasibleTimetableError, match="infeasible"):
        generate_schedule(db, dataset.id, time_limit_seconds=5)


def test_validator_soft_weights_match_exact_s1_to_s6_and_exam_penalty():
    faculty = Faculty(source_id="F", preferences=[{"type": "avoid", "days": ["MON"], "periods": [1]}])
    high_room = Room(source_id="R", capacity=100)
    small_room = Room(source_id="SMALL", capacity=100)
    other_faculty = Faculty(source_id="F2", preferences=[])
    sessions = []
    assignment = {}
    group_map = {}
    # G spends seven consecutive hours on the same day, including a repeated course.
    for index, period in enumerate(range(1, 8)):
        source = f"G-{index}"
        course = "REPEAT" if index < 2 else f"C{index}"
        sessions.append(TimetableSession(source_id=source, course_source_id=course, faculty_source_id="F", kind="lecture", duration=1, basket_slot=None, size=50))
        assignment[source] = ("MON", period, "R")
        group_map[source] = {"G"}
    # H creates one gap; I incurs low utilization and a P9 soft cost.
    for source, course, group, period, room_id, size in [
            ("H1", "H1", "H", 1, "R", 50), ("H2", "H2", "H", 3, "R", 50),
        ("I", "I", "I", 9, "SMALL", 20),
    ]:
        sessions.append(TimetableSession(source_id=source, course_source_id=course, faculty_source_id="F2", kind="tutorial", duration=1, basket_slot=None, size=size))
        assignment[source] = ("MON", period, room_id)
        group_map[source] = {group}
    exams = [
        Examination(source_id="EX1", group_ids=["H"]),
        Examination(source_id="EX2", group_ids=["H"]),
    ]
    exam_assignment = {"EX1": ("MON", "AM", ["R"]), "EX2": ("MON", "PM", ["R"])}
    penalties, total, exam_penalty = _score_solution(
        sessions, group_map, {"F": faculty, "F2": other_faculty}, {"R": high_room, "SMALL": small_room},
        assignment, exam_assignment, exams, ["MON"],
    )
    assert penalties == {"S1": 2, "S2": 1, "S3": 3, "S4": 3, "S5": 1, "S6": 1}
    assert total == 11
    assert exam_penalty == 5


def test_timetable_api_contract_paths_are_registered():
    paths = app.openapi()["paths"]
    assert "/api/v1/datasets/{dataset_id}/schedules/generate" in paths
    assert "/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/assignments" in paths
    assert "/api/v1/datasets/{dataset_id}/schedules/{schedule_id}/export" in paths
