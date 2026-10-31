"""Tests for deterministic, review-only disruption parsing."""

import json
from pathlib import Path

import pytest

from app.services.ai.disruption_parser import parse_disruption_request
from app.services.ai.schemas import AssistantRequest, AssistantResponse


def parse(message: str) -> AssistantResponse:
    return parse_disruption_request(AssistantRequest(message=message))


def test_faculty_unavailable_extracts_id_weekday_periods_and_reason() -> None:
    result = parse("Professor F07 is absent Monday periods 1 to 3 because of conference travel")
    assert result.status == "proposal_ready"
    change = result.proposal.data.changes[0]
    assert change.type == "faculty_unavailable"
    assert change.faculty_id == "F07"
    assert change.days == ["MON"]
    assert change.periods == [1, 2, 3]
    assert change.reason == "conference travel"


def test_room_unavailable_extracts_room_and_discrete_periods() -> None:
    result = parse("Room CR-102 is unavailable Tuesday periods 2 and 4 because of a water leak")
    assert result.status == "proposal_ready"
    change = result.proposal.data.changes[0]
    assert change.type == "room_unavailable"
    assert change.room_id == "CR-102"
    assert change.days == ["TUE"]
    assert change.periods == [2, 4]
    assert change.reason == "a water leak"


def test_add_faculty_accepts_explicit_dataset_record_shape() -> None:
    record = {
        "id": "F30", "name": "Dr. Mira Shah", "department": "CSE",
        "max_hours_per_day": 4, "needs_accessible": False,
        "unavailable": [], "preferences": [],
    }
    result = parse("Add faculty record: " + json.dumps({"type": "add_faculty", "faculty": record}))
    assert result.status == "proposal_ready"
    change = result.proposal.data.changes[0]
    assert change.type == "add_faculty"
    assert change.faculty.id == "F30"
    assert change.faculty.unavailable == []


def test_add_session_accepts_explicit_dataset_record_shape() -> None:
    record = {
        "id": "CS202-T2", "course_id": "CS202", "kind": "tutorial",
        "groups": ["CSE-2"], "faculty_id": "F06", "size": 80,
        "duration": 1, "room_types": ["classroom"], "needs_accessible": False,
        "basket_slot": None, "fixed_slot": None,
    }
    result = parse("Add session record: " + json.dumps({"type": "add_session", "session": record}))
    assert result.status == "proposal_ready"
    change = result.proposal.data.changes[0]
    assert change.type == "add_session"
    assert change.session.id == "CS202-T2"
    assert change.session.fixed_slot is None


def test_remove_session_extracts_session_id() -> None:
    result = parse("Cancel session CS202-T2")
    assert result.status == "proposal_ready"
    change = result.proposal.data.changes[0]
    assert change.type == "remove_session"
    assert change.session_id == "CS202-T2"


@pytest.mark.parametrize(
    "message,field",
    [
        ("Professor Ananya is absent Monday periods 1 to 3 because conference", "faculty_id"),
        ("A room is unavailable Monday periods 1 to 3 because maintenance", "room_id"),
        ("Room CR-102 is unavailable Monday because maintenance", "periods"),
        ("Room CR-102 is unavailable Monday periods 1 to 3", "reason"),
        ("Add a new faculty member", "faculty"),
        ("Add a new session", "session"),
        ("Cancel the lecture", "session_id"),
    ],
)
def test_missing_required_information_requests_clarification(message: str, field: str) -> None:
    result = parse(message)
    assert result.status == "clarification_required"
    assert result.proposal is None
    assert result.missing_fields
    assert any(field in item for item in result.missing_fields)
    assert result.clarification is not None


@pytest.mark.parametrize("temporal", ["kal", "parso"])
def test_relative_temporal_terms_are_not_resolved(temporal: str) -> None:
    result = parse(f"Room CR-102 is unavailable {temporal} periods 1 to 3 because maintenance")
    assert result.status == "clarification_required"
    assert "days" in result.missing_fields
    assert temporal in result.clarification.question.lower()


def test_competing_disruption_types_request_clarification() -> None:
    result = parse(
        "Room CR-102 is unavailable Monday periods 1 to 3 because maintenance, "
        "and Professor F07 is absent Tuesday periods 2 to 4 because travel"
    )
    assert result.status == "clarification_required"
    assert result.proposal is None
    assert any("disruption_type" in field for field in result.missing_fields)


def test_documented_json_multiple_changes_are_supported() -> None:
    sample_path = Path(__file__).parents[2] / "examples" / "sample_disruption.json"
    result = parse(sample_path.read_text(encoding="utf-8"))
    assert result.status == "proposal_ready"
    assert [change.type for change in result.proposal.data.changes] == [
        "faculty_unavailable", "room_unavailable", "add_session"
    ]


def test_multiple_separated_natural_changes_are_not_discarded() -> None:
    result = parse(
        "Room CR-102 is unavailable Monday periods 1 to 2 because maintenance; "
        "Professor F07 is absent Tuesday periods 3 to 4 because conference"
    )
    assert result.status == "proposal_ready"
    assert [change.type for change in result.proposal.data.changes] == [
        "room_unavailable", "faculty_unavailable"
    ]


def test_invalid_nested_disruption_record_requests_clarification() -> None:
    result = parse(
        'Add session record: {"type":"add_session","session":'
        '{"id":"CS202-T2","course_id":"CS202","kind":"tutorial",'
        '"groups":["CSE-2"],"faculty_id":"F06","size":0,"duration":1,'
        '"room_types":["classroom"],"needs_accessible":false,'
        '"basket_slot":null,"fixed_slot":null}}'
    )
    assert result.status == "clarification_required"
    assert result.proposal is None
    assert any("size" in field for field in result.missing_fields)


def test_unknown_intent_does_not_produce_disruption_proposal() -> None:
    result = parse("Hello, can you explain the timetable?")
    assert result.intent == "unknown"
    assert result.status == "unsupported"
    assert result.proposal is None


def test_booking_intent_is_rejected_by_disruption_parser() -> None:
    result = parse("Please book a room for our lecture")
    assert result.intent == "booking"
    assert result.status == "error"
    assert result.proposal is None


def test_proposal_serializes_through_existing_pydantic_models() -> None:
    result = parse("Room CR-102 is unavailable Monday periods 1 to 2 because maintenance")
    payload = result.model_dump(mode="json")
    restored = AssistantResponse.model_validate(payload)
    assert restored.proposal.type == "disruption"
    assert restored.proposal.data.changes[0].room_id == "CR-102"


def test_original_request_message_is_preserved() -> None:
    message = "  Room CR-102 is unavailable Monday periods 1 to 2 because maintenance!  "
    request = AssistantRequest(message=message)
    parse_disruption_request(request)
    assert request.message == message
