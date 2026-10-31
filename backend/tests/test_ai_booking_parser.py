"""Tests for the booking parser's clarification and proposal behavior."""

import pytest

from app.services.ai.booking_parser import parse_booking_request
from app.services.ai.schemas import AssistantRequest, RequesterInfo


def complete_message() -> str:
    return (
        "Requester: Robotics Club, role: club, department: CSE, "
        "title: Robotics Contest. Need Electronics Lab 1 on Thursday "
        "6 to 9 pm for 60 participants, 3 hours, projector and mic."
    )


def make_request(message: str, *, requester: RequesterInfo | None = None) -> AssistantRequest:
    return AssistantRequest(message=message, requester=requester)


def complete_request() -> AssistantRequest:
    return make_request(
        complete_message(),
        requester=RequesterInfo(requester="Robotics Club", role="club"),
    )


def test_complete_booking_request_returns_reviewable_proposal() -> None:
    response = parse_booking_request(complete_request())

    assert response.intent == "booking"
    assert response.status == "proposal_ready"
    assert response.missing_fields == []
    assert response.clarification is None
    assert response.proposal is not None
    data = response.proposal.data
    assert data.requester == "Robotics Club"
    assert data.role == "club"
    assert data.department == "CSE"
    assert data.title == "robotics contest"
    assert data.attendance == 60
    assert data.duration_periods == 3
    assert data.requested_room == "ELEC-LAB-1"
    assert data.room_types == ["lab_elec"]
    assert data.needs == ["projector", "pa_system"]
    assert data.mandatory_for_groups == []
    assert data.requested_category is None
    assert data.series_id is None


def test_requester_context_supplies_only_provided_requester_fields() -> None:
    response = parse_booking_request(
        make_request(
            "Title: Poster session. Need a seminar hall Friday 6 to 8 pm "
            "for 60 people, 2 hours.",
            requester=RequesterInfo(requester="Photography Club", role="club"),
        )
    )

    assert response.status == "proposal_ready"
    assert response.proposal.data.requester == "Photography Club"
    assert response.proposal.data.role == "club"
    assert response.proposal.data.department is None


def test_message_requester_does_not_replace_missing_requester_context() -> None:
    response = parse_booking_request(
        make_request(
            "Requester: Robotics Club, role: club, title: Contest. Need a lab "
            "Thursday 6 to 8 pm for 60 people, 2 hours."
        )
    )

    assert response.status == "clarification_required"
    assert response.proposal is None
    assert "requester" in response.missing_fields
    assert "role" in response.missing_fields
    assert response.extracted_entities.requester == "Robotics Club"
    assert response.extracted_entities.role == "club"


def test_requester_context_is_authoritative_when_message_also_names_requester() -> None:
    response = parse_booking_request(
        make_request(
            complete_message(),
            requester=RequesterInfo(requester="Authoritative Club", role="club"),
        )
    )

    assert response.status == "proposal_ready"
    assert response.proposal.data.requester == "Authoritative Club"
    assert response.extracted_entities.requester == "Robotics Club"
    assert any(
        warning.code == "MESSAGE_CONTEXT_REQUESTER_MISMATCH"
        for warning in response.warnings
    )


def test_partially_populated_requester_context_does_not_use_message_role() -> None:
    response = parse_booking_request(
        make_request(
            complete_message(),
            requester=RequesterInfo(requester="Robotics Club"),
        )
    )

    assert response.status == "clarification_required"
    assert response.proposal is None
    assert "role" in response.missing_fields
    assert "requester" not in response.missing_fields
    assert response.extracted_entities.role == "club"


@pytest.mark.parametrize(
    "message,requester,field",
    [
        (
            "Requester: Robotics Club, role: club, title: Contest. Need a lab "
            "Thursday 6 to 8 pm for 60 people, 2 hours.",
            None,
            "requester",
        ),
        (
            "Requester: Robotics Club, title: Contest. Need a lab Thursday "
            "6 to 8 pm for 60 people, 2 hours.",
            None,
            "role",
        ),
        (
            "Requester: Robotics Club, role: club. Need a lab Thursday "
            "6 to 8 pm for 60 people, 2 hours.",
            None,
            "title",
        ),
        (
            "Requester: Robotics Club, role: club, title: Contest. Need a lab "
            "Thursday 6 to 8 pm for 2 hours.",
            None,
            "attendance",
        ),
        (
            "Requester: Robotics Club, role: club, title: Contest. Need a lab "
            "Thursday 6 to 8 pm for 60 people.",
            None,
            "duration_periods",
        ),
        (
            "Requester: Robotics Club, role: club, title: Contest. Need a lab "
            "for 60 people, 2 hours.",
            None,
            "windows",
        ),
        (
            "Requester: Robotics Club, role: club, title: Contest. Need room SH-1 "
            "Thursday 6 to 8 pm for 60 people, 2 hours.",
            None,
            "room_types",
        ),
    ],
)
def test_missing_required_booking_information_requests_clarification(
    message: str, requester: RequesterInfo | None, field: str
) -> None:
    response = parse_booking_request(make_request(message, requester=requester))

    assert response.status == "clarification_required"
    assert response.proposal is None
    assert field in response.missing_fields
    assert response.clarification is not None
    assert response.clarification.question


def test_ambiguous_relative_date_is_not_resolved() -> None:
    response = parse_booking_request(
        make_request(
            "Requester: Robotics Club, role: club, title: Quiz. Need a seminar hall "
            "kal shaam 6 to 8 pm for 100 people, 2 hours."
        )
    )

    assert response.status == "clarification_required"
    assert "windows" in response.missing_fields
    assert response.proposal is None
    assert "ambiguous" in response.clarification.question.lower()


def test_hinglish_booking_uses_context_and_preserves_date_ambiguity() -> None:
    response = parse_booking_request(
        make_request(
            "Title: Quiz prelims. Seminar hall chahiye kal shaam 6 se 8 baje, "
            "2 ghante, 100 log, mic chahiye.",
            requester=RequesterInfo(requester="Quiz Club", role="club"),
        )
    )

    assert response.status == "clarification_required"
    assert response.extracted_entities.attendance == 100
    assert response.extracted_entities.duration_periods == 2
    assert response.extracted_entities.windows is None
    assert "windows" in response.missing_fields


@pytest.mark.parametrize(
    "message,expected_intent,expected_status",
    [
        ("Hello, how are you?", "unknown", "unsupported"),
        ("Room CR-102 is unavailable on Monday", "disruption", "error"),
    ],
)
def test_non_booking_intents_are_not_processed(
    message: str, expected_intent: str, expected_status: str
) -> None:
    response = parse_booking_request(make_request(message))

    assert response.intent == expected_intent
    assert response.status == expected_status
    assert response.proposal is None
    if expected_intent == "disruption":
        assert response.error.code == "INTENT_NOT_SUPPORTED_BY_BOOKING_PARSER"


def test_parser_preserves_original_request_message() -> None:
    message = "  " + complete_message() + "  "
    request = make_request(
        message,
        requester=RequesterInfo(requester="Robotics Club", role="club"),
    )
    response = parse_booking_request(request)

    assert request.message == message
    assert response.status == "proposal_ready"


def test_proposal_serializes_through_existing_pydantic_models() -> None:
    response = parse_booking_request(complete_request())

    encoded = response.model_dump(mode="json")
    assert encoded["status"] == "proposal_ready"
    assert encoded["proposal"]["type"] == "booking"
    assert encoded["proposal"]["data"]["windows"] == [
        {"day": "THU", "from_period": 10, "to_period": 12}
    ]
