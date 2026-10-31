"""Tests for deterministic booking/disruption intent classification."""

import pytest

from app.services.ai.intent import IntentClassification, classify_intent


@pytest.mark.parametrize(
    "message",
    [
        "I need a seminar hall tomorrow",
        "Book room 204 for a club meeting",
        "We need a classroom for 60 students",
        "Seminar hall chahiye kal shaam",
        "Could I get a venue for our event?",
        "Could you book room 204?",
    ],
)
def test_booking_messages_classify_as_booking(message: str) -> None:
    result = classify_intent(message)

    assert isinstance(result, IntentClassification)
    assert result.intent == "booking"
    assert result.reason


@pytest.mark.parametrize(
    "message",
    [
        "Room 204 is unavailable tomorrow",
        "The professor is absent today",
        "Cancel the 2 PM lecture",
        "Classroom mein AC kharab hai, room unavailable",
        "Please mark the seminar hall unavailable on Friday",
        "I need to cancel the 2 PM lecture",
        "Add an extra lecture on Thursday",
    ],
)
def test_disruption_messages_classify_as_disruption(message: str) -> None:
    result = classify_intent(message)

    assert result.intent == "disruption"
    assert result.reason


@pytest.mark.parametrize(
    "message",
    [
        "Hello, how are you?",
        "What is the capital of France?",
        "Room 204 is on the second floor.",
        "Tomorrow will be sunny.",
        "What rooms are available tomorrow?",
        "What if room 204 were unavailable tomorrow?",
        "Should I book a seminar hall?",
        "I need to know whether room 204 is available.",
        "Is room 204 unavailable tomorrow?",
    ],
)
def test_unrelated_hypothetical_or_ambiguous_messages_are_unknown(message: str) -> None:
    result = classify_intent(message)

    assert result.intent == "unknown"
    assert result.reason


@pytest.mark.parametrize(
    "message",
    [
        "We need to book a classroom, but the professor is absent.",
        "Book a room 204 and cancel the 2 PM lecture.",
    ],
)
def test_mixed_intent_messages_are_conservatively_unknown(message: str) -> None:
    assert classify_intent(message).intent == "unknown"


def test_accepts_existing_assistant_request_model() -> None:
    from app.services.ai.schemas import AssistantRequest

    request = AssistantRequest(message="I need a seminar hall tomorrow")
    assert classify_intent(request).intent == "booking"


def test_normalization_does_not_resolve_ambiguous_temporal_words() -> None:
    result = classify_intent("Seminar hall chahiye kal parso")

    assert result.intent == "booking"
    assert "kal" not in result.reason
