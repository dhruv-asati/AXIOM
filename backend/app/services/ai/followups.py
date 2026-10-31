"""In-memory deterministic continuation of booking clarifications."""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from app.services.ai.booking_parser import _context_conflicts
from app.services.ai.entities import extract_entities
from app.services.ai.intent import classify_intent
from app.services.ai.normalization import normalize_text
from app.services.ai.schemas import (
    AssistantRequest,
    AssistantResponse,
    BookingProposal,
    BookingRequestData,
    Clarification,
    Error,
    ExtractedEntities,
    Warning,
)


_REQUIRED = (
    "requester", "role", "title", "attendance", "duration_periods",
    "windows", "room_types",
)
_MERGEABLE = set(ExtractedEntities.model_fields)
_QUESTIONS = {
    "requester": "Who is submitting this booking request?",
    "role": "What is the requester's role: admin, department_coordinator, faculty, or club?",
    "title": "What is the title or purpose of the event?",
    "attendance": "How many people are expected?",
    "duration_periods": "How many hours or periods should the booking last?",
    "windows": "What explicit weekday and start/end time should I use?",
    "room_types": "What room type is needed, such as a classroom, seminar hall, or lab?",
}


def _failure(code: str, message: str, intent: str = "booking") -> AssistantResponse:
    """Return a contract-valid error when a draft cannot safely be resumed."""
    return AssistantResponse(
        intent=intent,  # type: ignore[arg-type]
        status="error",
        extracted_entities=ExtractedEntities(),
        error=Error(code=code, message=message),
    )


def _value(entities: ExtractedEntities, field: str) -> Any:
    value = getattr(entities, field)
    return value if value not in (None, []) else None


def _as_value(extraction, field: str) -> Any:
    if field == "windows":
        return list(extraction.booking.windows) or None
    if field == "room_types":
        return list(extraction.booking.room_types) or None
    if field == "needs":
        return list(extraction.booking.needs)
    if field == "mandatory_for_groups":
        return list(extraction.booking.mandatory_for_groups)
    return getattr(extraction.booking, field, None)


def _same(left: Any, right: Any) -> bool:
    if isinstance(left, list) and isinstance(right, list):
        return left == right
    return left == right


def _clarification_text(fields: list[str], conflicts: dict[str, tuple[Any, Any]], temporal: tuple[str, ...]) -> str:
    if "windows" in conflicts:
        old, new = conflicts["windows"]
        return f"I found conflicting schedule values ({old!r} and {new!r}). Which weekday and time range should I use?"
    if "windows" in fields and temporal:
        word = temporal[0]
        if word in {"kal", "parso"}:
            return f'“{word.title()}” is ambiguous. Which weekday or date do you mean?'
    if conflicts:
        field, (old, new) = next(iter(conflicts.items()))
        return f"I found conflicting {field.replace('_', ' ')} values ({old!r} and {new!r}). Which one is correct?"
    return " ".join(_QUESTIONS[field] for field in fields if field in _QUESTIONS) or "Please clarify the requested booking details."


def continue_booking_request(
    request: AssistantRequest, prior_response: AssistantResponse
) -> AssistantResponse:
    """Merge an explicitly supplied booking clarification draft with a follow-up.

    The prior structured response is the only draft state. This function does
    not persist it, inspect assistant text in ``request.context``, or submit a
    booking. Requester identity and role always come from this request's
    structured requester context.
    """
    try:
        prior_response = AssistantResponse.model_validate(prior_response.model_dump())
    except (AttributeError, TypeError, ValidationError):
        return _failure("INVALID_PRIOR_RESPONSE", "The prior assistant response is invalid.")

    if (
        prior_response.intent != "booking"
        or prior_response.status != "clarification_required"
        or prior_response.clarification is None
    ):
        return _failure(
            "PRIOR_CLARIFICATION_REQUIRED",
            "A valid booking clarification response is required to continue.",
        )

    classification = classify_intent(request)
    if classification.intent == "unknown":
        return AssistantResponse(
            intent="unknown", status="unsupported", extracted_entities=ExtractedEntities()
        )
    if classification.intent == "disruption":
        return _failure(
            "INTENT_NOT_SUPPORTED_BY_BOOKING_FOLLOWUP",
            "This continuation only accepts booking follow-ups.",
            intent="disruption",
        )

    requested = list(dict.fromkeys(prior_response.clarification.fields))
    if not requested or any(field not in _MERGEABLE for field in requested):
        return _failure("INVALID_PRIOR_CLARIFICATION", "The prior clarification fields are invalid.")

    extraction = extract_entities(request)
    current_values = normalize_text(request.message)
    temporal = tuple(dict.fromkeys((
        *current_values.ambiguous_temporal_terms,
        *extraction.unresolved_temporal_expressions,
    )))
    old = prior_response.extracted_entities
    merged = old.model_dump()
    conflicts: dict[str, tuple[Any, Any]] = {}
    unresolved_conflicts: set[str] = set()

    # Context owns required requester identity and role. Never inherit these
    # values from prior extraction, which may have originated in message text.
    context = request.requester
    # Keep current message-extracted identity visible when context is absent,
    # but never treat it as satisfying required requester information.
    merged["requester"] = (
        context.requester if context and context.requester
        else extraction.booking.requester or old.requester
    )
    merged["role"] = (
        context.role if context and context.role
        else extraction.booking.role or old.role
    )
    resolved_this_turn = {
        field for field, value in (
            ("requester", context.requester if context else None),
            ("role", context.role if context else None),
        )
        if value is not None
    }
    context_conflicts = _context_conflicts(request, extraction.booking)
    warnings = list(prior_response.warnings)
    for conflict in context_conflicts:
        if conflict.field in {"requester", "role"}:
            value = getattr(context, conflict.field) if context else None
            if value is not None:
                warning = Warning(
                    code=f"MESSAGE_CONTEXT_{conflict.field.upper()}_MISMATCH",
                    message=(f"The message and requester context contain different {conflict.field} "
                             f"values; the requester context value {value!r} is used."),
                )
                if warning not in warnings:
                    warnings.append(warning)

    for field in requested:
        if field in {"requester", "role"}:
            # Supplied structured context may satisfy the requested field; text may not.
            continue
        new_value = _as_value(extraction, field)
        if new_value is None or new_value == []:
            continue
        old_value = _value(old, field)
        if old_value is not None and not _same(old_value, new_value):
            conflicts[field] = (old_value, new_value)
            unresolved_conflicts.add(field)
        else:
            merged[field] = new_value
            resolved_this_turn.add(field)

    if "windows" in requested and temporal:
        unresolved_conflicts.add("windows")

    # Carry only requested-field conflicts forward as unresolved. Unrequested
    # entities from this message are deliberately ignored.
    missing = list(dict.fromkeys(prior_response.missing_fields))
    missing = [field for field in missing if field not in resolved_this_turn]
    for field in _REQUIRED:
        if field == "requester":
            value = context.requester if context else None
        elif field == "role":
            value = context.role if context else None
        else:
            value = merged.get(field)
        if value is None or value == []:
            if field not in missing:
                missing.append(field)
        else:
            missing = [item for item in missing if item != field]
    missing = [field for field in missing if field in _REQUIRED]
    missing = list(dict.fromkeys([*missing, *unresolved_conflicts]))

    try:
        entities = ExtractedEntities.model_validate(merged)
    except ValidationError:
        return _failure("INVALID_MERGED_ENTITIES", "The merged booking details are invalid.")

    if missing:
        # Retain only conflict/ambiguity warnings relevant to the current turn,
        # while preserving prior warnings for transparency.
        question_fields = [field for field in missing if field in requested]
        question_fields = question_fields or missing
        clarification = Clarification(
            id=prior_response.clarification.id,
            question=_clarification_text(question_fields, conflicts, temporal),
            fields=question_fields,
        )
        return AssistantResponse(
            intent="booking", status="clarification_required", extracted_entities=entities,
            missing_fields=missing, clarification=clarification,
            assumptions=list(prior_response.assumptions), warnings=warnings,
        )

    try:
        proposal = BookingProposal(
            type="booking",
            data=BookingRequestData(
                requester=entities.requester,
                role=entities.role,
                department=entities.department,
                requested_category=entities.requested_category,
                title=entities.title,
                attendance=entities.attendance,
                duration_periods=entities.duration_periods,
                windows=entities.windows,
                room_types=entities.room_types,
                needs=entities.needs,
                requested_room=entities.requested_room,
                mandatory_for_groups=entities.mandatory_for_groups,
                series_id=entities.series_id,
            ),
        )
    except ValidationError:
        return _failure("INVALID_MERGED_BOOKING", "The completed booking details failed schema validation.")

    return AssistantResponse(
        intent="booking", status="proposal_ready", extracted_entities=entities,
        proposal=proposal, assumptions=list(prior_response.assumptions), warnings=warnings,
    )
