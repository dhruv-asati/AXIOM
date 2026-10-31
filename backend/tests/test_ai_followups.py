"""Tests for deterministic continuation of booking clarifications."""

import pytest

from app.services.ai.booking_parser import parse_booking_request
from app.services.ai.followups import continue_booking_request
from app.services.ai.schemas import (
    AssistantRequest,
    AssistantResponse,
    Clarification,
    ExtractedEntities,
    RequesterInfo,
)


def prior_response(message: str | None = None, *, requester: RequesterInfo | None = None):
    message = message or (
        "Title: Robotics contest. Need an electronics lab Thursday 6 to 8 pm, for 60 people, 2 hours."
    )
    return parse_booking_request(AssistantRequest(message=message, requester=requester))


def request(message: str, requester: RequesterInfo | None = None) -> AssistantRequest:
    return AssistantRequest(message=message, requester=requester)


def draft_with_missing(*fields: str, requester: RequesterInfo | None = None):
    response = prior_response(requester=requester)
    entities = response.extracted_entities.model_copy()
    for field in fields:
        setattr(entities, field, None)
    missing = list(fields)
    return AssistantResponse(
        intent="booking",
        status="clarification_required",
        extracted_entities=entities,
        missing_fields=missing,
        clarification=Clarification(
            id="booking-required-fields", question="Please provide the missing details.", fields=missing
        ),
    )


def test_followup_fills_one_missing_field() -> None:
    prior = draft_with_missing("attendance", requester=RequesterInfo(requester="Robotics Club", role="club"))
    result = continue_booking_request(request("Need a seminar hall for 60 people", requester=RequesterInfo(requester="Robotics Club", role="club")), prior)
    assert result.status == "proposal_ready"
    assert result.proposal.data.attendance == 60


def test_followup_fills_multiple_requested_fields() -> None:
    prior = draft_with_missing("attendance", "duration_periods", requester=RequesterInfo(requester="Robotics Club", role="club"))
    result = continue_booking_request(request("Need a seminar hall for 60 people, 2 hours", requester=RequesterInfo(requester="Robotics Club", role="club")), prior)
    assert result.status == "proposal_ready"
    assert result.proposal.data.attendance == 60
    assert result.proposal.data.duration_periods == 2


def test_previously_extracted_fields_are_preserved() -> None:
    prior = draft_with_missing("attendance", requester=RequesterInfo(requester="Robotics Club", role="club"))
    result = continue_booking_request(request("Need a seminar hall for 60 people", requester=RequesterInfo(requester="Robotics Club", role="club")), prior)
    assert result.extracted_entities.title == "robotics contest"
    assert result.extracted_entities.windows == prior.extracted_entities.windows
    assert result.extracted_entities.needs == prior.extracted_entities.needs


def test_unrequested_fields_are_not_merged() -> None:
    prior = draft_with_missing("attendance", requester=RequesterInfo(requester="Robotics Club", role="club"))
    result = continue_booking_request(request("Need a seminar hall for 60 people, title: Unasked event", requester=RequesterInfo(requester="Robotics Club", role="club")), prior)
    assert result.extracted_entities.attendance == 60
    assert result.extracted_entities.title == "robotics contest"


def test_conflicting_followup_value_triggers_clarification() -> None:
    prior = draft_with_missing("attendance", requester=RequesterInfo(requester="Robotics Club", role="club"))
    prior.extracted_entities.attendance = 50
    result = continue_booking_request(request("Need a seminar hall for 60 people", requester=RequesterInfo(requester="Robotics Club", role="club")), prior)
    assert result.status == "clarification_required"
    assert result.extracted_entities.attendance == 50
    assert "attendance" in result.missing_fields
    assert "50" in result.clarification.question and "60" in result.clarification.question
    assert result.proposal is None


@pytest.mark.parametrize("temporal", ["kal", "parso"])
def test_ambiguous_relative_day_remains_unresolved(temporal: str) -> None:
    prior = draft_with_missing("windows", requester=RequesterInfo(requester="Robotics Club", role="club"))
    result = continue_booking_request(request(f"Need a lab {temporal} 6 to 8 pm", requester=RequesterInfo(requester="Robotics Club", role="club")), prior)
    assert result.status == "clarification_required"
    assert "windows" in result.missing_fields
    assert result.extracted_entities.windows is None
    assert temporal in result.clarification.question.lower()


def test_missing_requester_context_cannot_be_filled_from_followup_text() -> None:
    prior = prior_response()
    assert "requester" in prior.missing_fields
    result = continue_booking_request(request("Requester: Robotics Club, role: club. Need a lab for 60 people"), prior)
    assert result.status == "clarification_required"
    assert "requester" in result.missing_fields and "role" in result.missing_fields
    assert result.extracted_entities.requester == "Robotics Club"
    assert result.extracted_entities.role == "club"


def test_partial_requester_context_remains_partial() -> None:
    prior = prior_response(requester=RequesterInfo(requester="Robotics Club"))
    result = continue_booking_request(request("Role: club. Need a lab for 60 people", requester=RequesterInfo(requester="Robotics Club")), prior)
    assert result.status == "clarification_required"
    assert "role" in result.missing_fields
    assert "requester" not in result.missing_fields
    assert result.extracted_entities.role == "club"  # transparent text extraction only


def test_structured_requester_context_overrides_message_extracted_requester() -> None:
    prior = draft_with_missing("attendance", requester=RequesterInfo(requester="Authoritative Club", role="club"))
    result = continue_booking_request(request("Requester: Other Club. Need a seminar hall for 60 people", requester=RequesterInfo(requester="Authoritative Club", role="club")), prior)
    assert result.status == "proposal_ready"
    assert result.proposal.data.requester == "Authoritative Club"
    assert result.extracted_entities.requester == "Authoritative Club"
    assert any(w.code == "MESSAGE_CONTEXT_REQUESTER_MISMATCH" for w in result.warnings)


@pytest.mark.parametrize(
    "message,expected_intent,expected_status",
    [("Hello there", "unknown", "unsupported"), ("Room CR-102 is unavailable Monday", "disruption", "error")],
)
def test_non_booking_intent_does_not_resume_pending_booking(message, expected_intent, expected_status) -> None:
    result = continue_booking_request(request(message), draft_with_missing("attendance", requester=RequesterInfo(requester="Robotics Club", role="club")))
    assert (result.intent, result.status) == (expected_intent, expected_status)
    assert result.proposal is None


def test_missing_prior_clarification_is_rejected_safely() -> None:
    prior = AssistantResponse.model_construct(
        intent="booking", status="clarification_required", extracted_entities=ExtractedEntities(),
        missing_fields=["attendance"], clarification=None, proposal=None, assumptions=[], warnings=[], error=None,
    )
    result = continue_booking_request(request("Need a seminar hall for 60 people"), prior)
    assert result.status == "error"
    assert result.error.code == "INVALID_PRIOR_RESPONSE"


def test_invalid_prior_response_is_rejected_safely() -> None:
    prior = AssistantResponse.model_construct(
        intent="bogus", status="clarification_required", extracted_entities=ExtractedEntities(),
        missing_fields=["attendance"], clarification=Clarification(id="x", question="x", fields=["attendance"]),
        proposal=None, assumptions=[], warnings=[], error=None,
    )
    result = continue_booking_request(request("Need a seminar hall for 60 people"), prior)
    assert result.status == "error"
    assert result.error.code == "INVALID_PRIOR_RESPONSE"


def test_fully_resolved_result_is_valid_pydantic_booking_proposal() -> None:
    prior = draft_with_missing("attendance", requester=RequesterInfo(requester="Robotics Club", role="club"))
    result = continue_booking_request(request("Need a seminar hall for 60 people", requester=RequesterInfo(requester="Robotics Club", role="club")), prior)
    payload = result.model_dump(mode="json")
    assert AssistantResponse.model_validate(payload).proposal.type == "booking"
    assert payload["proposal"]["data"]["requester"] == "Robotics Club"


def test_current_original_message_is_preserved() -> None:
    message = "  Need a seminar hall for 60 people!  "
    current = request(message, RequesterInfo(requester="Robotics Club", role="club"))
    continue_booking_request(current, draft_with_missing("attendance", requester=RequesterInfo(requester="Robotics Club", role="club")))
    assert current.message == message
