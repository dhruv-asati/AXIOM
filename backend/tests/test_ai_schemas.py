"""Validation tests for the AI assistant's reviewed Pydantic contracts."""

from datetime import datetime

import pytest
from pydantic import ValidationError

from app.services.ai.schemas import (
    AssistantRequest,
    AssistantResponse,
    BookingProposal,
    BookingRequestData,
    DisruptionRequest,
)


def sample_booking_data() -> dict:
    return {
        "requester": "Dramatics Society",
        "role": "club",
        "department": None,
        "requested_category": "club_event",
        "title": "Stage play: Andha Yug",
        "attendance": 130,
        "duration_periods": 3,
        "windows": [{"day": "THU", "from_period": 10, "to_period": 12}],
        "room_types": ["seminar_hall", "auditorium"],
        "needs": ["stage", "pa_system"],
        "requested_room": "SH-1",
        "mandatory_for_groups": [],
        "series_id": None,
    }


def sample_session() -> dict:
    return {
        "id": "CS202-T2",
        "course_id": "CS202",
        "kind": "tutorial",
        "groups": ["CSE-2"],
        "faculty_id": "F06",
        "size": 80,
        "duration": 1,
        "room_types": ["classroom", "lecture_hall", "auditorium"],
        "needs_accessible": False,
        "basket_slot": None,
        "fixed_slot": None,
    }


def sample_faculty() -> dict:
    return {
        "id": "F41",
        "name": "Dr. Example Faculty",
        "department": "CSE",
        "max_hours_per_day": 4,
        "needs_accessible": False,
        "unavailable": [
            {"day": "WED", "periods": [6, 7, 8, 9], "reason": "HOD meeting"}
        ],
        "preferences": [
            {
                "type": "avoid",
                "days": ["MON", "TUE", "WED", "THU", "FRI"],
                "periods": [1],
                "note": "Prefers not to teach at 8 AM",
            }
        ],
    }


def test_valid_assistant_request_preserves_message_and_context() -> None:
    request = AssistantRequest.model_validate(
        {
            "message": " seminar hall kal shaam 6 baje ",
            "requester": {"requester": "Quiz Club", "role": "club"},
            "context": [{"role": "user", "content": "We need a venue."}],
            "reference_datetime": "2026-10-31T14:30:00+05:30",
            "timezone": "Asia/Kolkata",
        }
    )
    assert request.message == " seminar hall kal shaam 6 baje "
    assert request.reference_datetime == datetime.fromisoformat("2026-10-31T14:30:00+05:30")


@pytest.mark.parametrize(
    "payload",
    [
        {"message": "   "},
        {"message": "Book a room", "reference_datetime": "not-a-date"},
        {"message": "Book a room", "reference_datetime": "2026-10-31T14:30:00"},
        {"message": "Book a room", "timezone": "Mars/Olympus"},
        {"message": "Book a room", "unexpected": True},
    ],
)
def test_invalid_assistant_request(payload: dict) -> None:
    with pytest.raises(ValidationError):
        AssistantRequest.model_validate(payload)


def test_valid_booking_proposal_serializes() -> None:
    proposal = BookingProposal.model_validate({"type": "booking", "data": sample_booking_data()})
    encoded = proposal.model_dump(mode="json")
    assert encoded["data"]["requested_room"] == "SH-1"
    assert encoded["type"] == "booking"


def test_missing_required_booking_field_is_rejected() -> None:
    payload = sample_booking_data()
    del payload["attendance"]
    with pytest.raises(ValidationError):
        BookingRequestData.model_validate(payload)


@pytest.mark.parametrize("field,value", [("attendance", 0), ("duration_periods", 0)])
def test_non_positive_booking_numbers_are_rejected(field: str, value: int) -> None:
    payload = sample_booking_data()
    payload[field] = value
    with pytest.raises(ValidationError):
        BookingRequestData.model_validate(payload)


def test_invalid_booking_weekday_is_rejected() -> None:
    payload = sample_booking_data()
    payload["windows"][0]["day"] = "SAT"
    with pytest.raises(ValidationError):
        BookingRequestData.model_validate(payload)


def test_invalid_or_reversed_booking_period_range_is_rejected() -> None:
    payload = sample_booking_data()
    payload["windows"][0].update(from_period=0, to_period=12)
    with pytest.raises(ValidationError):
        BookingRequestData.model_validate(payload)
    payload["windows"][0].update(from_period=12, to_period=10)
    with pytest.raises(ValidationError):
        BookingRequestData.model_validate(payload)


def test_booking_window_length_need_not_equal_duration() -> None:
    payload = sample_booking_data()
    payload["windows"][0].update(from_period=6, to_period=13)
    parsed = BookingRequestData.model_validate(payload)
    assert parsed.duration_periods == 3
    assert parsed.windows[0].to_period - parsed.windows[0].from_period + 1 == 8


def test_booking_period_14_is_preserved_due_to_dataset_example() -> None:
    payload = sample_booking_data()
    payload["duration_periods"] = 2
    payload["windows"] = [{"day": "WED", "from_period": 13, "to_period": 14}]
    parsed = BookingRequestData.model_validate(payload)
    assert parsed.windows[0].to_period == 14


def test_valid_faculty_unavailability_change() -> None:
    parsed = DisruptionRequest.model_validate(
        {
            "changes": [
                {
                    "type": "faculty_unavailable",
                    "faculty_id": "F07",
                    "days": ["MON"],
                    "periods": [1, 2, 3, 4, 5, 6, 7, 8, 9],
                    "reason": "Conference travel",
                }
            ]
        }
    )
    assert parsed.changes[0].type == "faculty_unavailable"


def test_valid_room_unavailability_change() -> None:
    parsed = DisruptionRequest.model_validate(
        {
            "changes": [
                {
                    "type": "room_unavailable",
                    "room_id": "CR-102",
                    "days": ["MON", "TUE"],
                    "periods": [1, 2, 3],
                    "reason": "Water leak",
                }
            ]
        }
    )
    assert parsed.changes[0].type == "room_unavailable"


def test_valid_add_faculty_change() -> None:
    parsed = DisruptionRequest.model_validate(
        {"changes": [{"type": "add_faculty", "faculty": sample_faculty()}]}
    )
    assert parsed.changes[0].type == "add_faculty"


def test_valid_add_session_change() -> None:
    parsed = DisruptionRequest.model_validate(
        {"changes": [{"type": "add_session", "session": sample_session()}]}
    )
    assert parsed.changes[0].type == "add_session"


def test_valid_remove_session_change() -> None:
    parsed = DisruptionRequest.model_validate(
        {"changes": [{"type": "remove_session", "session_id": "HS201-H2-L2"}]}
    )
    assert parsed.changes[0].type == "remove_session"


def test_invalid_disruption_variant_is_rejected() -> None:
    with pytest.raises(ValidationError):
        DisruptionRequest.model_validate({"changes": [{"type": "move_room"}]})


def test_missing_nested_disruption_fields_are_rejected() -> None:
    with pytest.raises(ValidationError):
        DisruptionRequest.model_validate(
            {"changes": [{"type": "add_session", "session": {"id": "CS202-T2"}}]}
        )
    with pytest.raises(ValidationError):
        DisruptionRequest.model_validate(
            {"changes": [{"type": "add_faculty", "faculty": {"id": "F41"}}]}
        )


def response_base(intent: str, status: str) -> dict:
    return {
        "intent": intent,
        "status": status,
        "extracted_entities": {},
    }


def test_correct_clarification_response() -> None:
    payload = response_base("booking", "clarification_required")
    payload["missing_fields"] = ["attendance"]
    payload["clarification"] = {
        "id": "attendance",
        "question": "How many people are expected?",
        "fields": ["attendance"],
    }
    assert AssistantResponse.model_validate(payload).status == "clarification_required"


def test_correct_proposal_ready_response() -> None:
    payload = response_base("booking", "proposal_ready")
    payload["proposal"] = {"type": "booking", "data": sample_booking_data()}
    assert AssistantResponse.model_validate(payload).proposal.type == "booking"


def test_correct_unsupported_response() -> None:
    payload = response_base("unknown", "unsupported")
    assert AssistantResponse.model_validate(payload).status == "unsupported"


def test_correct_error_response() -> None:
    payload = response_base("unknown", "error")
    payload["error"] = {"code": "INVALID_INPUT", "message": "Request could not be parsed."}
    assert AssistantResponse.model_validate(payload).error.code == "INVALID_INPUT"


@pytest.mark.parametrize(
    "intent,status,extra",
    [
        ("booking", "clarification_required", {}),
        ("booking", "proposal_ready", {"proposal": {"type": "booking", "data": sample_booking_data()}, "error": {"code": "X", "message": "X"}}),
        ("booking", "proposal_ready", {"proposal": {"type": "disruption", "data": {"changes": [{"type": "remove_session", "session_id": "S1"}]}}}),
        ("booking", "unsupported", {}),
    ],
)
def test_inconsistent_response_combinations_are_rejected(
    intent: str, status: str, extra: dict
) -> None:
    payload = response_base(intent, status)
    payload.update(extra)
    with pytest.raises(ValidationError):
        AssistantResponse.model_validate(payload)
