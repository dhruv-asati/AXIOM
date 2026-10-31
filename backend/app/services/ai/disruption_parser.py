"""Deterministic, review-only parser for documented timetable disruptions."""

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import TypeAdapter, ValidationError

from app.services.ai.entities import extract_entities
from app.services.ai.intent import classify_intent
from app.services.ai.normalization import normalize_text
from app.services.ai.schemas import (
    AssistantRequest,
    AssistantResponse,
    Clarification,
    DisruptionChange,
    DisruptionProposal,
    DisruptionRequest,
    Error,
    ExtractedEntities,
)


_CHANGE_ADAPTER = TypeAdapter(DisruptionChange)
_PERIODS = re.compile(
    r"\bperiods?\s*(?:are\s+|from\s+|[:=]\s*)?"
    r"(?P<values>\d{1,2}(?:\s*(?:,|and|to|through|[-–])\s*\d{1,2})*)",
    re.IGNORECASE,
)
_NUMBER = re.compile(r"\d{1,2}")
_REASON = re.compile(
    r"\b(?:reason\s*(?:is|:|=)|because\s+of|because|due\s+to)\s+"
    r"(?P<reason>[^.;\n]+)",
    re.IGNORECASE,
)
def _error(intent: str, code: str, message: str) -> AssistantResponse:
    return AssistantResponse(
        intent=intent,  # type: ignore[arg-type]
        status="error",
        extracted_entities=ExtractedEntities(),
        error=Error(code=code, message=message),
    )


def _periods(text: str, extracted: tuple[int, ...]) -> list[int]:
    match = _PERIODS.search(text)
    if not match:
        return list(extracted)
    numbers = [int(value) for value in _NUMBER.findall(match.group("values"))]
    if len(numbers) == 2 and re.search(r"\b(?:to|through)\b|[-–]", match.group("values")):
        first, last = numbers
        if last >= first:
            return list(range(first, last + 1))
    return list(dict.fromkeys(numbers))


def _reason(text: str) -> str | None:
    match = _REASON.search(text)
    return match.group("reason").strip(" ,") if match else None


def _json_changes(text: str) -> tuple[list[Any] | None, list[str]]:
    """Read an explicitly supplied documented disruption object, if present."""
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        return None, []
    try:
        payload = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None, []
    raw_changes = payload.get("changes") if isinstance(payload, dict) else None
    if raw_changes is None and isinstance(payload, dict) and "type" in payload:
        raw_changes = [payload]
    if not isinstance(raw_changes, list):
        return None, ["changes"]
    if not raw_changes:
        return [], ["changes"]
    valid: list[Any] = []
    missing: list[str] = []
    for index, item in enumerate(raw_changes):
        try:
            valid.append(_CHANGE_ADAPTER.validate_python(item))
        except ValidationError as exc:
            for error in exc.errors():
                path = ".".join(str(part) for part in error["loc"])
                missing.append(f"changes[{index}].{path}" if path else f"changes[{index}]")
    return valid, list(dict.fromkeys(missing))


def _natural_change(text: str) -> tuple[Any | None, list[str], str | None]:
    extraction = extract_entities(text)
    change = extraction.disruption
    kind = change.disruption_type
    if kind is None:
        return None, ["disruption_type"], "Which disruption change should I record?"

    conflicts = [conflict for conflict in extraction.conflicts if conflict.field in {
        "disruption_type", "faculty_id", "faculty_name", "requested_room", "session_id", "course_id"
    }]
    if conflicts:
        conflict = conflicts[0]
        return None, [conflict.field], f"I found conflicting {conflict.field.replace('_', ' ')} values ({', '.join(conflict.values)}). Which one is correct?"

    normalized = normalize_text(text)
    unresolved = tuple(dict.fromkeys((
        *normalized.ambiguous_temporal_terms,
        *extraction.unresolved_temporal_expressions,
    )))
    days = list(change.weekdays)
    periods = _periods(normalized.normalized_text, change.periods)
    reason = _reason(text)
    missing: list[str] = []

    if kind == "faculty_unavailable":
        faculty_id = change.faculty_id
        if not faculty_id:
            missing.append("faculty_id")
        if not days or unresolved:
            missing.append("days")
        if not periods:
            missing.append("periods")
        if not reason:
            missing.append("reason")
        if missing:
            return None, missing, _question(missing, change.faculty_name, unresolved)
        payload = {"type": kind, "faculty_id": faculty_id, "days": days, "periods": periods, "reason": reason}
    elif kind == "room_unavailable":
        room_id = change.room_id
        if not room_id:
            missing.append("room_id")
        if not days or unresolved:
            missing.append("days")
        if not periods:
            missing.append("periods")
        if not reason:
            missing.append("reason")
        if missing:
            return None, missing, _question(missing, room_id, unresolved)
        payload = {"type": kind, "room_id": room_id, "days": days, "periods": periods, "reason": reason}
    elif kind == "remove_session":
        if not change.session_id:
            missing.append("session_id")
        if missing:
            return None, missing, _question(missing, None, unresolved)
        payload = {"type": kind, "session_id": change.session_id}
    else:
        # The nested add_faculty/add_session contracts require complete dataset
        # records. Accept those records only when the user supplies the exact
        # nested JSON shape; prose is not enough to fill their many fields.
        return None, ["faculty" if kind == "add_faculty" else "session"], (
            "Please provide the complete faculty record using the documented fields."
            if kind == "add_faculty" else
            "Please provide the complete session record using the documented fields."
        )

    try:
        return _CHANGE_ADAPTER.validate_python(payload), [], None
    except ValidationError as exc:
        fields = [".".join(str(part) for part in error["loc"]) for error in exc.errors()]
        fields = fields or ["disruption"]
        return None, fields, _question(fields, None, unresolved)


def _question(fields: list[str], subject: str | None, unresolved: tuple[str, ...]) -> str:
    if unresolved and "days" in fields:
        word = unresolved[0]
        if word in {"kal", "parso"}:
            return f'“{word.title()}” is ambiguous. Which weekday do you mean?'
        return f"Which explicit weekday should I use for “{word}”?"
    if fields and fields[0] in {"faculty_id", "room_id", "session_id"} and subject:
        return f"I identified {subject!r}, but need its dataset {fields[0]} to continue. What is the ID?"
    labels = [field.replace("_", " ") for field in fields]
    return "Please provide: " + ", ".join(labels) + "."


def parse_disruption_request(request: AssistantRequest) -> AssistantResponse:
    """Interpret a disruption as a review-only proposal or clarification."""
    classification = classify_intent(request)
    if classification.intent == "unknown":
        return AssistantResponse(
            intent="unknown", status="unsupported", extracted_entities=ExtractedEntities()
        )
    if classification.intent == "booking":
        return _error(
            "booking", "INTENT_NOT_SUPPORTED_BY_DISRUPTION_PARSER",
            "This parser only accepts timetable disruption requests.",
        )

    raw_changes, json_missing = _json_changes(request.message)
    if raw_changes is not None:
        if json_missing:
            return AssistantResponse(
                intent="disruption", status="clarification_required",
                extracted_entities=ExtractedEntities(), missing_fields=json_missing,
                clarification=Clarification(
                    id="disruption-required-fields",
                    question="The disruption record is incomplete or invalid. Please provide the listed fields.",
                    fields=json_missing,
                ),
            )
        try:
            data = DisruptionRequest(changes=raw_changes)
        except ValidationError as exc:
            fields = list(dict.fromkeys(
                ".".join(str(part) for part in error["loc"]) or "changes"
                for error in exc.errors()
            ))
            return AssistantResponse(
                intent="disruption", status="clarification_required",
                extracted_entities=ExtractedEntities(), missing_fields=fields,
                clarification=Clarification(
                    id="disruption-required-fields",
                    question="The disruption changes are invalid or incomplete. Please correct the listed fields.",
                    fields=fields,
                ),
            )
        return AssistantResponse(
            intent="disruption", status="proposal_ready",
            extracted_entities=ExtractedEntities(),
            proposal=DisruptionProposal(type="disruption", data=data),
        )

    # A recognized relative expression cannot safely become a schema weekday.
    # Split only on explicit clause separators so each requested change is kept.
    segments = [part.strip() for part in re.split(r"[;\n]+", request.message) if part.strip()]
    if not segments:
        segments = [request.message]
    changes: list[Any] = []
    missing: list[str] = []
    questions: list[str] = []
    for index, segment in enumerate(segments):
        segment_intent = classify_intent(segment).intent
        if segment_intent == "unknown":
            missing.append(f"changes[{index}]")
            questions.append("I could not identify a disruption change in one part of the message.")
            continue
        if segment_intent != "disruption":
            missing.append(f"changes[{index}]")
            questions.append("The message mixes disruption and non-disruption instructions. Which change should I process?")
            continue
        parsed, fields, question = _natural_change(segment)
        if parsed is None:
            missing.extend(f"changes[{index}].{field}" for field in fields)
            if question:
                questions.append(question)
        else:
            changes.append(parsed)

    if missing:
        missing = list(dict.fromkeys(missing))
        # For one change, keep concise dataset field paths in the contract.
        if len(segments) == 1:
            missing = [value.removeprefix("changes[0].") for value in missing]
        return AssistantResponse(
            intent="disruption", status="clarification_required",
            extracted_entities=ExtractedEntities(), missing_fields=missing,
            clarification=Clarification(
                id="disruption-required-fields",
                question=" ".join(dict.fromkeys(questions)) or "Please clarify the disruption details.",
                fields=missing,
            ),
        )
    return AssistantResponse(
        intent="disruption", status="proposal_ready",
        extracted_entities=ExtractedEntities(),
        proposal=DisruptionProposal(
            type="disruption", data=DisruptionRequest(changes=changes)
        ),
    )
