"""Tests for pure user-facing rendering of AssistantResponse models."""

from app.services.ai.booking_parser import parse_booking_request
from app.services.ai.disruption_parser import parse_disruption_request
from app.services.ai.responses import format_assistant_response
from app.services.ai.schemas import (
    AssistantRequest,
    AssistantResponse,
    BookingProposal,
    BookingRequestData,
    DisruptionProposal,
    DisruptionRequest,
    ExtractedEntities,
    FacultyRecord,
    RequesterInfo,
    SessionRecord,
)


def booking_response(**overrides) -> AssistantResponse:
    data = {
        "requester": "Robotics Club", "role": "club", "title": "Robotics contest",
        "attendance": 60, "duration_periods": 2,
        "windows": [{"day": "THU", "from_period": 10, "to_period": 11}],
        "room_types": ["lab_elec"],
    }
    data.update(overrides)
    return AssistantResponse(
        intent="booking", status="proposal_ready", extracted_entities=ExtractedEntities(),
        proposal=BookingProposal(type="booking", data=BookingRequestData(**data)),
    )


def disruption_response(change) -> AssistantResponse:
    return AssistantResponse(
        intent="disruption", status="proposal_ready", extracted_entities=ExtractedEntities(),
        proposal=DisruptionProposal(
            type="disruption", data=DisruptionRequest(changes=[change])
        ),
    )


def test_clarification_uses_question_and_names_missing_fields() -> None:
    response = parse_booking_request(AssistantRequest(message="Need a seminar hall Thursday"))
    message = format_assistant_response(response)
    assert response.status == "clarification_required"
    assert response.clarification.question in message
    assert "requester" in message
    assert "attendance" in message


def test_booking_proposal_summary_uses_present_fields_and_review_status() -> None:
    message = format_assistant_response(booking_response())
    assert "Booking proposal for review" in message
    assert "Robotics Club" in message
    assert "Robotics contest" in message
    assert "60" in message and "2 periods" in message
    assert "lab elec" in message
    assert "THU" in message and "periods 10–11" in message
    assert "not an approved reservation" in message
    assert "has not been submitted" in message


def test_optional_booking_fields_are_omitted_when_empty() -> None:
    message = format_assistant_response(
        booking_response(department=None, requested_category=None, requested_room=None, needs=[])
    )
    assert "department" not in message
    assert "requested room" not in message
    assert "needs:" not in message


def test_faculty_unavailable_summary() -> None:
    message = format_assistant_response(disruption_response({
        "type": "faculty_unavailable", "faculty_id": "F07", "days": ["MON"],
        "periods": [1, 2], "reason": "conference travel",
    }))
    assert "Mark faculty F07 unavailable" in message
    assert "MON" in message and "periods 1, 2" in message
    assert "conference travel" in message


def test_room_unavailable_summary() -> None:
    message = format_assistant_response(disruption_response({
        "type": "room_unavailable", "room_id": "CR-102", "days": ["TUE"],
        "periods": [3], "reason": "water leak",
    }))
    assert "Mark room CR-102 unavailable" in message
    assert "TUE" in message and "periods 3" in message


def test_add_faculty_summary() -> None:
    record = FacultyRecord(
        id="F30", name="Dr. Mira Shah", department="CSE", max_hours_per_day=4,
        needs_accessible=False, unavailable=[], preferences=[],
    )
    message = format_assistant_response(disruption_response({"type": "add_faculty", "faculty": record}))
    assert "Add faculty record" in message
    assert "Dr. Mira Shah" in message and "F30" in message and "CSE" in message


def test_add_session_summary() -> None:
    record = SessionRecord(
        id="CS202-T2", course_id="CS202", kind="tutorial", groups=["CSE-2"],
        faculty_id="F06", size=80, duration=1, room_types=["classroom"],
        needs_accessible=False, basket_slot=None, fixed_slot=None,
    )
    message = format_assistant_response(disruption_response({"type": "add_session", "session": record}))
    assert "Add session CS202-T2" in message
    assert "course CS202" in message and "tutorial" in message and "CSE-2" in message


def test_remove_session_summary() -> None:
    message = format_assistant_response(disruption_response({
        "type": "remove_session", "session_id": "CS202-T2",
    }))
    assert "Remove session CS202-T2" in message


def test_multiple_disruption_changes_are_all_summarized() -> None:
    response = parse_disruption_request(AssistantRequest(message=(
        "Room CR-102 is unavailable Monday periods 1 to 2 because maintenance; "
        "Professor F07 is absent Tuesday periods 3 to 4 because conference"
    )))
    message = format_assistant_response(response)
    assert "CR-102" in message and "F07" in message
    assert message.count("Mark ") == 2
    assert "not been executed" in message
    assert "no timetable repair has been run" in message


def test_unsupported_response_explains_supported_request_types_only() -> None:
    response = parse_booking_request(AssistantRequest(message="Hello there"))
    message = format_assistant_response(response)
    assert "room booking requests" in message
    assert "timetable disruption requests" in message
    assert "Hello" not in message


def test_error_response_is_nontechnical_and_hides_code() -> None:
    response = parse_disruption_request(AssistantRequest(message="Please book a room"))
    message = format_assistant_response(response)
    assert "different assistant workflow" in message
    assert "INTENT_NOT_SUPPORTED" not in message
    assert "Traceback" not in message and "backend/" not in message
    assert "not made any changes" in message


def test_proposals_are_never_described_as_approved_or_executed() -> None:
    booking = format_assistant_response(booking_response()).lower()
    disruption = format_assistant_response(disruption_response({
        "type": "remove_session", "session_id": "CS202-T2",
    })).lower()
    assert "not an approved reservation" in booking
    assert "has not been submitted" in booking
    assert "not been executed" in disruption
    assert "approved" not in disruption


def test_formatter_is_deterministic_and_does_not_mutate_response() -> None:
    response = booking_response()
    before = response.model_dump(mode="json")
    first = format_assistant_response(response)
    second = format_assistant_response(response)
    assert first == second
    assert response.model_dump(mode="json") == before

