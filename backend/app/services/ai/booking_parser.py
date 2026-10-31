"""Deterministic booking parser built from the AI module's existing stages."""

from __future__ import annotations

from app.services.ai.entities import EntityConflict, extract_entities
from app.services.ai.intent import classify_intent
from app.services.ai.normalization import normalize_text
from app.services.ai.schemas import (
    AssistantIntent,
    AssistantRequest,
    AssistantResponse,
    AssistantStatus,
    BookingProposal,
    BookingRequestData,
    Clarification,
    Error,
    ExtractedEntities,
    Warning,
)


_REQUIRED_FIELDS = (
    "requester",
    "role",
    "title",
    "attendance",
    "duration_periods",
    "windows",
    "room_types",
)

_QUESTIONS = {
    "requester": "Who is submitting this booking request?",
    "role": "What is the requester's role: admin, department_coordinator, faculty, or club?",
    "title": "What is the title or purpose of the event?",
    "attendance": "How many people are expected?",
    "duration_periods": "How many hours or periods should the booking last?",
    "room_types": "What room type is needed, such as a classroom, seminar hall, or lab?",
}


def _empty_response(
    intent: AssistantIntent,
    status: AssistantStatus,
    *,
    error: Error | None = None,
) -> AssistantResponse:
    """Build a contract-valid response for messages this parser does not handle."""

    return AssistantResponse(
        intent=intent,
        status=status,
        extracted_entities=ExtractedEntities(),
        error=error,
    )


def _temporal_question(expressions: tuple[str, ...]) -> str | None:
    if not expressions:
        return None
    word = expressions[0]
    if word == "kal":
        return '“Kal” is ambiguous. Which weekday or date do you mean?'
    if word == "parso":
        return '“Parso” is ambiguous. Which weekday or date do you mean?'
    return f"What explicit weekday should I use for “{word}”?"


def _schedule_question(entities) -> str:
    if entities.weekdays and entities.time_expressions:
        day_names = ", ".join(day.title() for day in entities.weekdays)
        return f"What start and end time should I use for {day_names}?"
    if entities.weekdays:
        day_names = ", ".join(day.title() for day in entities.weekdays)
        return f"What start and end time should I use on {day_names}?"
    if entities.time_expressions:
        expression = entities.time_expressions[0]
        return f"What weekday and end time should I use for “{expression}”?"
    return "What weekday and start/end time should I use for this booking?"


def _clarification_question(
    missing_fields: list[str],
    entities,
    unresolved_temporal: tuple[str, ...],
    conflicts: list[EntityConflict],
) -> str:
    for field in missing_fields:
        conflict = next((item for item in conflicts if item.field == field), None)
        if conflict:
            values = ", ".join(conflict.values)
            return f"I found conflicting {field.replace('_', ' ')} values ({values}). Which one should I use?"

    temporal = _temporal_question(unresolved_temporal) if "windows" in missing_fields else None
    if temporal:
        return temporal

    if "windows" in missing_fields and any(
        conflict.field in {"weekday", "windows"} for conflict in conflicts
    ):
        return "The schedule details conflict. Which weekday and time range should I use?"

    questions = [
        _schedule_question(entities)
        if field == "windows"
        else _QUESTIONS[field]
        for field in missing_fields
        if field in _QUESTIONS or field == "windows"
    ]
    return " ".join(questions)


def _context_conflicts(request: AssistantRequest, entities) -> list[EntityConflict]:
    """Find message/context disagreements for transparent response warnings."""

    conflicts: list[EntityConflict] = []
    requester_info = request.requester
    if requester_info is None:
        return conflicts

    for field in ("requester", "role", "department"):
        message_value = getattr(entities, field)
        context_value = getattr(requester_info, field)
        if (
            message_value is not None
            and context_value is not None
            and message_value.casefold() != context_value.casefold()
        ):
            conflicts.append(
                EntityConflict(field=field, values=(str(message_value), str(context_value)))
            )
    return conflicts


def parse_booking_request(request: AssistantRequest) -> AssistantResponse:
    """Interpret a booking request into a clarification or review-only proposal.

    This function does not resolve relative dates, calculate durations from
    start times, select venues, check availability, or make booking decisions.
    """

    # Normalize explicitly at this orchestration boundary, then reuse the
    # existing classifier and extractor rather than maintaining parallel rules.
    normalized = normalize_text(request.message)
    classification = classify_intent(request)
    if classification.intent == "unknown":
        return _empty_response("unknown", "unsupported")
    if classification.intent != "booking":
        return _empty_response(
            classification.intent,
            "error",
            error=Error(
                code="INTENT_NOT_SUPPORTED_BY_BOOKING_PARSER",
                message="This parser only accepts booking requests.",
            ),
        )

    extraction = extract_entities(request)
    booking = extraction.booking
    requester_info = request.requester
    context_conflicts = _context_conflicts(request, booking)
    conflicts = [*extraction.conflicts, *context_conflicts]
    # Requester identity and role are required contract inputs from the
    # structured requester context. Message-extracted values remain visible,
    # but cannot satisfy these required fields or override the context.
    blocking_conflicts = [
        *extraction.conflicts,
        *(conflict for conflict in context_conflicts if conflict.field == "department"),
    ]
    conflict_fields = {
        conflict.field
        for conflict in blocking_conflicts
        if conflict.field not in {"requester", "role"}
    }

    requester = requester_info.requester if requester_info else None
    role = requester_info.role if requester_info else None
    department = booking.department or (requester_info.department if requester_info else None)

    # Optional department conflicts keep their prior clarification/warning behavior.
    if "department" in conflict_fields:
        department = None

    extracted = ExtractedEntities(
        requester=booking.requester or requester,
        role=booking.role or role,
        department=department,
        requested_category=None,
        title=booking.title,
        attendance=booking.attendance,
        duration_periods=booking.duration_periods,
        windows=list(booking.windows) or None,
        room_types=list(booking.room_types) or None,
        needs=list(booking.needs),
        requested_room=booking.requested_room,
        mandatory_for_groups=list(booking.mandatory_for_groups),
        series_id=None,
    )

    missing_fields: list[str] = []
    for field in _REQUIRED_FIELDS:
        if field == "requester":
            value = requester
        elif field == "role":
            value = role
        else:
            value = getattr(extracted, field)
        if isinstance(value, str) and not value.strip():
            value = None
        if value is None or value == [] or field in conflict_fields:
            missing_fields.append(field)

    unresolved_temporal = tuple(
        dict.fromkeys(
            (*normalized.ambiguous_temporal_terms, *extraction.unresolved_temporal_expressions)
        )
    )
    if unresolved_temporal and "windows" not in missing_fields:
        # A relative date can invalidate an otherwise explicit weekday window;
        # this parser has no approved date-resolution behavior.
        missing_fields.append("windows")

    warnings: list[Warning] = []
    for conflict in conflicts:
        if conflict.field in {"requester", "role"}:
            context_value = getattr(requester_info, conflict.field) if requester_info else None
            if context_value is not None:
                warnings.append(
                    Warning(
                        code=f"MESSAGE_CONTEXT_{conflict.field.upper()}_MISMATCH",
                        message=(
                            f"The message and requester context contain different {conflict.field} "
                            f"values; the requester context value {context_value!r} is used."
                        ),
                    )
                )
        elif conflict.field not in _REQUIRED_FIELDS:
            warnings.append(
                Warning(
                    code=f"AMBIGUOUS_{conflict.field.upper()}",
                    message=(
                        f"Conflicting {conflict.field.replace('_', ' ')} values were found; "
                        "no value was selected."
                    ),
                )
            )

    if missing_fields:
        question = _clarification_question(
            missing_fields,
            booking,
            unresolved_temporal,
            [
                conflict
                for conflict in blocking_conflicts
                if conflict.field not in {"requester", "role"}
            ],
        )
        clarification_fields = list(missing_fields)
        conflicting_required = next(
            (field for field in missing_fields if field in conflict_fields), None
        )
        if conflicting_required is not None:
            clarification_fields = [conflicting_required]
        elif "windows" in missing_fields and _temporal_question(unresolved_temporal):
            clarification_fields = ["windows"]
        return AssistantResponse(
            intent="booking",
            status="clarification_required",
            extracted_entities=extracted,
            missing_fields=missing_fields,
            clarification=Clarification(
                id="booking-required-fields",
                question=question,
                fields=clarification_fields,
            ),
            assumptions=[],
            warnings=warnings,
            error=None,
        )

    proposal = BookingProposal(
        type="booking",
        data=BookingRequestData(
            requester=requester,
            role=role,
            department=department,
            requested_category=None,
            title=booking.title,
            attendance=booking.attendance,
            duration_periods=booking.duration_periods,
            windows=list(booking.windows),
            room_types=list(booking.room_types),
            needs=list(booking.needs),
            requested_room=booking.requested_room,
            mandatory_for_groups=list(booking.mandatory_for_groups),
            series_id=None,
        ),
    )
    return AssistantResponse(
        intent="booking",
        status="proposal_ready",
        extracted_entities=extracted,
        missing_fields=[],
        clarification=None,
        proposal=proposal,
        assumptions=[],
        warnings=warnings,
        error=None,
    )
