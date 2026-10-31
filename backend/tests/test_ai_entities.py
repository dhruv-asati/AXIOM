"""Tests for explicit, deterministic booking and disruption entity extraction."""

import pytest

from app.services.ai.entities import EntityExtraction, extract_entities


def test_extracts_complete_booking_information_explicitly() -> None:
    message = (
        "Requester: Robotics Club, role: club, department: CSE, title: Line follower workshop. "
        "Need Electronics Lab 1 on Thursday 6 to 9 pm for 60 participants, "
        "projector and mic, compulsory for CSE-3."
    )
    result = extract_entities(message)

    assert result.booking.requester == "Robotics Club"
    assert result.booking.role == "club"
    assert result.booking.department == "CSE"
    assert result.booking.requested_room == "ELEC-LAB-1"
    assert result.booking.room_types == ("lab_elec",)
    assert result.booking.title == "line follower workshop"
    assert result.booking.attendance == 60
    assert result.booking.duration_periods is None
    assert result.booking.weekdays == ("THU",)
    assert len(result.booking.windows) == 1
    assert (result.booking.windows[0].from_period, result.booking.windows[0].to_period) == (10, 12)
    assert result.booking.needs == ("projector", "pa_system")
    assert result.booking.mandatory_for_groups == ("CSE-3",)


def test_leaves_unmentioned_booking_entities_missing() -> None:
    result = extract_entities("Need a seminar hall kal shaam")

    assert result.booking.room_types == ("seminar_hall",)
    assert result.booking.attendance is None
    assert result.booking.duration_periods is None
    assert result.booking.weekdays == ()
    assert result.booking.windows == ()
    assert "kal" in result.unresolved_temporal_expressions


def test_extracts_hinglish_and_mixed_language_values_without_date_guessing() -> None:
    result = extract_entities(
        "Seminar hall chahiye kal shaam 6 baje, 2 ghante, 100 log, mic chahiye"
    )

    assert result.intent == "booking"
    assert result.booking.room_types == ("seminar_hall",)
    assert result.booking.duration_periods == 2
    assert result.booking.attendance == 100
    assert result.booking.needs == ("pa_system",)
    assert result.booking.weekdays == ()
    assert result.booking.windows == ()
    assert result.booking.time_expressions == ("6 baje", "evening")
    assert result.unresolved_temporal_expressions == ("kal",)


def test_extracts_dataset_room_names_and_room_types() -> None:
    result = extract_entities("Book Seminar Hall 2 for a poster session")

    assert result.booking.requested_room == "SH-2"
    assert result.booking.room_types == ("seminar_hall",)


def test_room_number_does_not_imply_a_room_type_or_dataset_id() -> None:
    result = extract_entities("Book room 204 for a club meeting")

    assert result.booking.requested_room == "room 204"
    assert result.booking.room_types == ()


def test_extracts_attendance_and_duration_without_deriving_duration_from_time() -> None:
    complete = extract_entities("Need a classroom for 45 people for 2 hours on Tuesday")
    time_only = extract_entities("Need a classroom Tuesday 6 pm to 8 pm")

    assert complete.booking.attendance == 45
    assert complete.booking.duration_periods == 2
    assert time_only.booking.duration_periods is None
    assert time_only.booking.windows[0].from_period == 10
    assert time_only.booking.windows[0].to_period == 11


@pytest.mark.parametrize(
    "message,day,start,end",
    [
        ("Book a room on Monday from 8 am to 10 am", "MON", 1, 2),
        ("Book a room Friday 6 to 8 pm", "FRI", 10, 11),
        ("Book a room Thursday 6 se 8 baje shaam", "THU", 10, 11),
    ],
)
def test_extracts_weekday_and_explicit_period_range(
    message: str, day: str, start: int, end: int
) -> None:
    result = extract_entities(message)

    assert result.booking.weekdays == (day,)
    assert len(result.booking.windows) == 1
    assert (result.booking.windows[0].from_period, result.booking.windows[0].to_period) == (
        start,
        end,
    )


def test_ambiguous_kal_and_parso_are_not_resolved() -> None:
    result = extract_entities("Need a seminar hall kal ya parso shaam")

    assert result.unresolved_temporal_expressions == ("kal", "parso")
    assert result.booking.weekdays == ()
    assert result.booking.windows == ()


def test_extracts_each_documented_disruption_variant() -> None:
    cases = [
        (
            "Professor F07 is absent on Monday",
            "faculty_unavailable",
            "F07",
        ),
        (
            "Room CR-102 is unavailable on Monday from 8 am to 10 am",
            "room_unavailable",
            "CR-102",
        ),
        (
            "Add a new faculty member F41 in CSE",
            "add_faculty",
            "F41",
        ),
        (
            "Add a session CS202-T2 for course CS202 on Thursday",
            "add_session",
            "CS202-T2",
        ),
        (
            "Cancel the 2 PM lecture MA101-AB-L1",
            "remove_session",
            "MA101-AB-L1",
        ),
    ]

    for message, expected_type, expected_target in cases:
        result = extract_entities(message)
        assert result.disruption.disruption_type == expected_type
        assert expected_target in {
            result.disruption.room_id,
            result.disruption.faculty_id,
            result.disruption.session_id,
        }


def test_disruption_extraction_includes_course_day_periods_and_details() -> None:
    result = extract_entities(
        "Add session CS202-T2 for course CS202 on Thursday from 2 pm to 4 pm, "
        "replacing the Thursday lecture with this session."
    )

    assert result.disruption.disruption_type == "add_session"
    assert result.disruption.course_id == "CS202"
    assert result.disruption.weekdays == ("THU",)
    assert result.disruption.periods == (6, 7)
    assert result.disruption.addition_details
    assert result.disruption.replacement_details


def test_missing_and_conflicting_entities_are_reported_without_guessing() -> None:
    missing = extract_entities("Need a seminar hall for an event")
    conflicting = extract_entities("Need a classroom for 40 people or 60 people")
    room_conflict = extract_entities("Book SH-1 or SH-2 for Friday")

    assert missing.booking.attendance is None
    assert missing.booking.duration_periods is None
    assert conflicting.booking.attendance is None
    assert any(conflict.field == "attendance" for conflict in conflicting.conflicts)
    assert room_conflict.booking.requested_room is None
    assert any(conflict.field == "requested_room" for conflict in room_conflict.conflicts)


def test_original_message_is_preserved_exactly() -> None:
    message = "  Seminar hall chahiye kal shaam 6 baje!  "
    result = extract_entities(message)

    assert isinstance(result, EntityExtraction)
    assert result.original_message == message
    assert result.original_message is message
