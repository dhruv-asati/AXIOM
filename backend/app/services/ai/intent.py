"""Conservative, deterministic intent classification for AXIOM requests."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.ai.normalization import normalize_text
from app.services.ai.schemas import AssistantIntent, AssistantRequest


_BOOKING_TARGET = re.compile(
    r"\b(?:room|classroom|lecture hall|seminar hall|hall|auditorium|venue|"
    r"lab|laboratory|space)\b"
)
_DISRUPTION_TARGET = re.compile(
    r"\b(?:room|classroom|lecture hall|seminar hall|hall|auditorium|venue|"
    r"lab|laboratory|professor|faculty|teacher|lecturer|lecture|class|"
    r"session|course|timetable|schedule|a\s*c|ac|air conditioner)\b"
)
_BOOKING_ACTION = re.compile(
    r"\b(?:book(?:ing)?|reserv(?:e|ation)|need|want|require|request|"
    r"looking\s+for)\b|\b(?:can|could)\s+(?:i|we|you)\s+"
    r"(?:get|book|reserve)\b"
)
_DISRUPTION_STATE = re.compile(
    r"\b(?:unavailable|not\s+available|absent|broken|faulty|"
    r"malfunction(?:ing)?|not\s+working|"
    r"kharab|maintenance|water\s+leak|power\s+outage|out\s+of\s+order)\b"
)
_DISRUPTION_ACTION = re.compile(
    r"\b(?:cancel(?:s|led|ed|ing)?|remove|mark|report|reschedule|"
    r"repair|fix|close)\b"
)
_ADD_SCHEDULE_ITEM = re.compile(
    r"\badd\b.*\b(?:faculty|professor|teacher|session|class|lecture)\b"
)
_HYPOTHETICAL = re.compile(
    r"\b(?:what\s+if|suppose|imagine|hypothetically|"
    r"should\s+(?:i|we)|do\s+(?:i|we)\s+need\s+to)\b"
)
_INFORMATION_SEEKING = re.compile(
    r"\b(?:need|want)\s+to\s+know\b|\b(?:information|details|status)\s+about\b"
)
_NEGATED_BOOKING = re.compile(
    r"\b(?:do\s+not|don['’]?t|never)\s+(?:need|want|book|reserve)\b"
)
_NEGATED_DISRUPTION = re.compile(
    r"\bnot\s+(?:unavailable|absent|broken|faulty|kharab)\b"
)


@dataclass(frozen=True)
class IntentClassification:
    """Predicted intent and a concise explanation of the rule match."""

    intent: AssistantIntent
    reason: str


def classify_intent(
    request: AssistantRequest | str,
) -> IntentClassification:
    """Classify text as booking, disruption, or unknown using explicit cues.

    ``AssistantRequest`` is accepted directly for the normal API path; a raw
    string is also accepted for focused service use and tests. No entities are
    extracted and no dates, bookings, or timetable changes are resolved.
    """

    original_text = request.message if isinstance(request, AssistantRequest) else request
    normalized = normalize_text(original_text).normalized_text
    if not normalized:
        return IntentClassification("unknown", "The message is empty.")

    if _HYPOTHETICAL.search(normalized):
        return IntentClassification(
            "unknown", "Hypothetical wording does not establish an actual request."
        )

    if _INFORMATION_SEEKING.search(normalized):
        return IntentClassification(
            "unknown", "The message asks for information rather than requesting an action."
        )

    booking_target = bool(_BOOKING_TARGET.search(normalized))
    disruption_target = bool(_DISRUPTION_TARGET.search(normalized))
    booking_action = bool(_BOOKING_ACTION.search(normalized)) and not bool(
        _NEGATED_BOOKING.search(normalized)
    )
    disruption_state = bool(_DISRUPTION_STATE.search(normalized)) and not bool(
        _NEGATED_DISRUPTION.search(normalized)
    )
    disruption_action = bool(_DISRUPTION_ACTION.search(normalized)) or bool(
        _ADD_SCHEDULE_ITEM.search(normalized)
    )

    # A state report or an applicable change action must have a domain target.
    disruption_evidence = disruption_target and (disruption_state or disruption_action)
    booking_evidence = booking_target and booking_action

    # A question about a possible state is not itself a disruption report.
    if disruption_evidence and original_text.rstrip().endswith("?") and not disruption_action:
        disruption_evidence = False

    if booking_evidence and disruption_evidence:
        return IntentClassification(
            "unknown", "The message contains competing booking and disruption cues."
        )
    if booking_evidence:
        return IntentClassification(
            "booking", "The message includes a venue reference and a booking request."
        )
    if disruption_evidence:
        return IntentClassification(
            "disruption", "The message describes an operational or timetable disruption."
        )

    return IntentClassification(
        "unknown", "There is not enough explicit evidence for booking or disruption."
    )
