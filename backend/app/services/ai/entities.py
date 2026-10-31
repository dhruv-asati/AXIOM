"""Deterministic entity extraction for English and Hinglish AXIOM requests.

Extracted values are internal interpretation data, not booking/disruption
proposals. Values are populated only when supported by explicit text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from app.services.ai.intent import classify_intent
from app.services.ai.normalization import NormalizationResult, normalize_text
from app.services.ai.schemas import (
    AssistantIntent,
    AssistantRequest,
    BookingDay,
    BookingWindow,
    RequesterRole,
)


_WEEKDAYS: tuple[tuple[re.Pattern[str], BookingDay], ...] = (
    (re.compile(r"\b(?:mon|monday)\b"), "MON"),
    (re.compile(r"\b(?:tue|tues|tuesday)\b"), "TUE"),
    (re.compile(r"\b(?:wed|wednesday)\b"), "WED"),
    (re.compile(r"\b(?:thu|thur|thurs|thursday)\b"), "THU"),
    (re.compile(r"\b(?:fri|friday)\b"), "FRI"),
)
_RELATIVE_TEMPORAL = re.compile(
    r"\b(?:today|tomorrow|tonight|yesterday|kal|parso|aaj|next\s+week|"
    r"this\s+week|next\s+(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|"
    r"thu(?:r|rs|rsday)?|fri(?:day)?))\b"
)
_ATTENDANCE = re.compile(
    r"\b(?P<number>\d[\d,]*)\s*(?:people|persons|students|participants|"
    r"attendees|audience|guests|log)\b"
)
_DURATION = re.compile(
    r"\b(?P<number>\d{1,3})\s*-?\s*(?:hours?|hrs?|periods?)\b"
)
_CLOCK = r"(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|midnight|noon)"
_CLOCK_RANGE = re.compile(
    rf"\b(?:from\s+)?(?P<start>{_CLOCK})\s*(?:to|se|tak|[-–])\s*(?P<end>{_CLOCK})\b"
)
_SINGLE_CLOCK = re.compile(
    r"\b(?:\d{1,2}(?::\d{2})\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm)|"
    r"\d{1,2}\s+baje|midnight|noon)\b"
)
_TIME_OF_DAY = re.compile(r"\b(?:morning|afternoon|evening|night|after\s+lunch)\b")
_AMBIGUOUS_RELATIVE = re.compile(r"\b(?:kal|parso)\b")
_ROLE = re.compile(
    r"\b(?:role\s*(?:is|:)?\s*|as\s+(?:an?\s+)?|i\s+am\s+(?:an?\s+)?)"
    r"(?P<role>department coordinator|admin(?:istrator)?|faculty|club)\b"
)
_DEPARTMENT = re.compile(
    r"\b(?:(?P<dept1>cse|ece|ee|me|ce|common)\s+department|"
    r"department\s+(?:of\s+)?(?P<dept2>cse|ece|ee|me|ce|common)|"
    r"department\s*[:=]\s*(?P<dept3>cse|ece|ee|me|ce|common))\b"
)
_REQUESTER = re.compile(
    r"\b(?:requester|organization|organisation)\s*(?:is|:|=)\s*"
    r"(?P<value>[^,.;]+?)(?=\s+(?:role|department|needs?|wants?|requests?|book|for|on|at|with)\b|[,.;]|$)|"
    r"\bfrom\s+(?P<from>[A-Z][\w&'-]*(?:\s+[A-Z][\w&'-]*){0,5}\s+(?:Club|Society|Cell|Team|Department))",
    re.IGNORECASE,
)
_ORG_PREFIX = re.compile(
    r"\bour\s+(?P<value>[\w&'-]+(?:\s+[\w&'-]+){0,4}\s+(?:club|society|cell|team|department))\b",
    re.IGNORECASE,
)
_ROOM_ID = re.compile(
    r"\b(?:AUD|OAT|SH-\d+|LH-\d+|CR-\d+|CS-LAB-\d+|ELEC-LAB-\d+|"
    r"PHY-LAB|MECH-WS|CIVIL-LAB)\b",
    re.IGNORECASE,
)
_ROOM_NUMBER = re.compile(r"\broom\s+\d+[a-z]?\b", re.IGNORECASE)
_ROOM_NAMES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bmain auditorium\b", re.IGNORECASE), "AUD"),
    (re.compile(r"\bopen[- ]air theatre\b", re.IGNORECASE), "OAT"),
    (re.compile(r"\bseminar hall\s*(\d+)\b", re.IGNORECASE), "SH"),
    (re.compile(r"\blecture hall\s*(\d+)\b", re.IGNORECASE), "LH"),
    (re.compile(r"\bclassroom\s+[ab]-?(\d{3})\b", re.IGNORECASE), "CR"),
    (re.compile(r"\bcomput(?:ing|er) lab\s*(\d+)\b", re.IGNORECASE), "CS-LAB"),
    (re.compile(r"\belectronics lab\s*(\d+)\b", re.IGNORECASE), "ELEC-LAB"),
    (re.compile(r"\bphysics lab\b", re.IGNORECASE), "PHY-LAB"),
    (re.compile(r"\bcivil engineering lab\b", re.IGNORECASE), "CIVIL-LAB"),
    (re.compile(r"\bcentral workshop\b", re.IGNORECASE), "MECH-WS"),
)
_ROOM_TYPES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bseminar hall\b"), "seminar_hall"),
    (re.compile(r"\bauditorium\b"), "auditorium"),
    (re.compile(r"\blecture hall\b"), "lecture_hall"),
    (re.compile(r"\bclassroom\b"), "classroom"),
    (re.compile(r"\b(?:computer|computing) lab\b"), "lab_cs"),
    (re.compile(r"\b(?:electronics|elec) lab\b"), "lab_elec"),
    (re.compile(r"\bphysics lab\b"), "lab_phy"),
    (re.compile(r"\bcivil lab\b"), "lab_civil"),
    (re.compile(r"\b(?:central )?workshop\s+(?:room|space|shed)\b"), "workshop"),
    (re.compile(r"\bcentral workshop\b"), "workshop"),
    (re.compile(r"\bopen[- ]air theatre\b"), "outdoor"),
    (re.compile(r"\boutdoor\b"), "outdoor"),
)
_NEEDS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bprojector\b"), "projector"),
    (re.compile(r"\b(?:mic|microphone|sound|pa system)\b"), "pa_system"),
    (re.compile(r"\bstage\b"), "stage"),
    (re.compile(r"\bcomputers?\b"), "computers"),
    (re.compile(r"\b(?:wheelchair[- ]accessible|accessible|accessibility)\b"), "accessible"),
    (re.compile(r"\b(?:air conditioning|air conditioned|ac)\b"), "ac"),
    (re.compile(r"\b(?:power points?|power benches)\b"), "power_benches"),
)
_NEED_CUE = re.compile(
    r"\b(?:need(?:s|ed)?|require(?:s|d)?|want|with|please|accessible|"
    r"accessibility|wheelchair)\b"
)
_MANDATORY_GROUP = re.compile(
    r"\b(?:compulsory|mandatory|required)\s+for\s+((?:y\d-[a-d]|(?:cse|ece|ee|me|ce)-\d)(?:\s*(?:,|and|&)?\s*(?:y\d-[a-d]|(?:cse|ece|ee|me|ce)-\d))*)\b",
    re.IGNORECASE,
)
_TITLE = re.compile(
    r"\b(?:for|hosting|host(?:ing)?|titled|called|title\s*[:=]?|"
    r"purpose\s*[:=]?|event\s*[:=])\s+"
    r"(?:a|an|the)?\s*(?:\d{1,3}\s*-?\s*(?:hours?|hrs?)\s+)?"
    r"(?P<title>[a-z][a-z0-9' -]{1,65})",
    re.IGNORECASE,
)
_TITLE_END = re.compile(
    r"\b(?:on|at|from|between|with|for|need|needing|around|about|expecting|"
    r"compulsory|mandatory|please|monday|tuesday|wednesday|thursday|friday|"
    r"mon|tue|wed|thu|fri)\b|\d",
    re.IGNORECASE,
)
_FACULTY_ID = re.compile(r"\bF\d{2}\b", re.IGNORECASE)
_FACULTY_NAME = re.compile(
    r"\b(?:Dr\.?\s+(?P<doctor>[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})|"
    r"(?:professor|faculty|teacher|lecturer)\s+(?P<person>[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}))\b"
)
_COURSE_ID = re.compile(r"\b[A-Z]{2}\d{3}\b", re.IGNORECASE)
_SESSION_ID = re.compile(r"\b[A-Z]{2,3}\d{2,3}(?:-[A-Z0-9]+)+\b", re.IGNORECASE)
_GROUP_ID = re.compile(r"\b(?:Y\d-[A-D]|(?:CSE|ECE|EE|ME|CE)-\d)\b", re.IGNORECASE)
_DISRUPTION_ADD_FACULTY = re.compile(
    r"\badd\s+(?:a\s+)?(?:new\s+)?faculty(?:\s+member)?\b"
)
_DISRUPTION_ADD_SESSION = re.compile(
    r"\badd\s+(?:a\s+)?(?:new\s+)?(?:session|class|lecture|tutorial|lab)\b"
)
_DISRUPTION_REMOVE_SESSION = re.compile(
    r"\b(?:cancel|remove)\b.*\b(?:session|class|lecture|tutorial|lab|course)\b"
)
_DISRUPTION_ROOM = re.compile(
    r"\b(?:room|classroom|hall|auditorium|venue|lab)\b.*"
    r"\b(?:unavailable|not available|closed|broken|faulty|kharab|not working|out of order)\b"
)
_DISRUPTION_FACULTY = re.compile(
    r"\b(?:faculty|professor|teacher|lecturer)\b.*\b(?:unavailable|absent|sick|ill)\b"
)
_REPLACEMENT = re.compile(
    r"\b(?:instead\b[^.;,]*|replac(?:e|es|ed|ing)\b.*?\bwith\b[^.;,]*)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class EntityConflict:
    """Two or more different explicit values for one scalar field."""

    field: str
    values: tuple[str, ...]


@dataclass(frozen=True)
class BookingEntities:
    """Explicit booking entities, using dataset field names where available."""

    requester: str | None = None
    role: RequesterRole | None = None
    department: str | None = None
    requested_room: str | None = None
    room_types: tuple[str, ...] = ()
    title: str | None = None
    attendance: int | None = None
    duration_periods: int | None = None
    weekdays: tuple[BookingDay, ...] = ()
    time_expressions: tuple[str, ...] = ()
    windows: tuple[BookingWindow, ...] = ()
    needs: tuple[str, ...] = ()
    mandatory_for_groups: tuple[str, ...] = ()


@dataclass(frozen=True)
class DisruptionEntities:
    """Explicit targets and change details for a timetable disruption."""

    disruption_type: Literal[
        "faculty_unavailable",
        "room_unavailable",
        "add_faculty",
        "add_session",
        "remove_session",
    ] | None = None
    room_id: str | None = None
    faculty_id: str | None = None
    faculty_name: str | None = None
    session_id: str | None = None
    course_id: str | None = None
    weekdays: tuple[BookingDay, ...] = ()
    periods: tuple[int, ...] = ()
    addition_details: tuple[str, ...] = ()
    replacement_details: tuple[str, ...] = ()


@dataclass(frozen=True)
class EntityExtraction:
    """Extraction result; unresolved text is separate from explicit values."""

    original_message: str
    intent: AssistantIntent
    booking: BookingEntities
    disruption: DisruptionEntities
    unresolved_temporal_expressions: tuple[str, ...] = ()
    conflicts: tuple[EntityConflict, ...] = ()


def _unique(values: list[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))


def _single_or_conflict(
    field_name: str, values: list[str], conflicts: list[EntityConflict]
) -> str | None:
    distinct = _unique(values)
    if not distinct:
        return None
    if len(distinct) > 1:
        conflicts.append(EntityConflict(field=field_name, values=distinct))
        return None
    return distinct[0]


def _weekdays(text: str) -> tuple[BookingDay, ...]:
    found: list[tuple[int, BookingDay]] = []
    for pattern, day in _WEEKDAYS:
        found.extend((match.start(), day) for match in pattern.finditer(text))
    found.sort(key=lambda item: item[0])
    return tuple(dict.fromkeys(day for _, day in found))


def _clock_minutes(
    value: str,
    fallback_meridiem: str | None,
    time_of_day: str | None,
    *,
    is_end: bool = False,
) -> int | None:
    if value.strip() == "midnight":
        return 24 * 60 if is_end else 0
    if value.strip() == "noon":
        return 12 * 60
    match = re.fullmatch(r"\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*", value)
    if match is None:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    meridiem = match.group(3) or fallback_meridiem
    if minute not in {0, 30}:
        return None
    if meridiem:
        if not 1 <= hour <= 12:
            return None
        hour = (hour % 12) + (12 if meridiem == "pm" else 0)
    elif hour > 23:
        return None
    elif hour <= 12 and time_of_day:
        if time_of_day in {"evening", "night"} and hour < 12:
            hour += 12
        elif time_of_day == "afternoon" and 1 <= hour <= 6:
            hour += 12
        elif time_of_day == "morning" and hour == 12:
            hour = 0
    elif hour <= 12:
        return None
    return hour * 60 + minute


def _start_period(minutes: int) -> int | None:
    return {
        8 * 60: 1,
        9 * 60: 2,
        10 * 60: 3,
        11 * 60: 4,
        12 * 60: 5,
        14 * 60: 6,
        15 * 60: 7,
        16 * 60: 8,
        17 * 60: 9,
        18 * 60: 10,
        19 * 60: 11,
        20 * 60: 12,
        21 * 60: 13,
    }.get(minutes)


def _end_period(minutes: int) -> int | None:
    return {
        9 * 60: 1,
        10 * 60: 2,
        11 * 60: 3,
        12 * 60: 4,
        13 * 60: 5,
        14 * 60: 5,
        15 * 60: 6,
        16 * 60: 7,
        17 * 60: 8,
        18 * 60: 9,
        19 * 60: 10,
        20 * 60: 11,
        21 * 60: 12,
        22 * 60: 13,
        24 * 60: 14,
    }.get(minutes)


def _period_at(minutes: int) -> int | None:
    """Return the calendar period containing an explicitly stated time."""

    periods = (
        (1, 8 * 60, 9 * 60),
        (2, 9 * 60, 10 * 60),
        (3, 10 * 60, 11 * 60),
        (4, 11 * 60, 12 * 60),
        (5, 12 * 60, 13 * 60),
        (6, 14 * 60, 15 * 60),
        (7, 15 * 60, 16 * 60),
        (8, 16 * 60, 17 * 60),
        (9, 17 * 60, 18 * 60),
        (10, 18 * 60, 19 * 60),
        (11, 19 * 60, 20 * 60),
        (12, 20 * 60, 21 * 60),
        (13, 21 * 60, 22 * 60),
    )
    return next((period for period, start, end in periods if start <= minutes < end), None)


def _time_data(text: str, weekdays: tuple[BookingDay, ...]) -> tuple[tuple[str, ...], tuple[BookingWindow, ...], tuple[int, ...]]:
    time_of_day_match = _TIME_OF_DAY.search(text)
    time_of_day = time_of_day_match.group(0) if time_of_day_match else None
    expressions: list[str] = []
    ranges: list[tuple[int, int]] = []
    single_periods: list[int] = []
    consumed: list[tuple[int, int]] = []

    for match in _CLOCK_RANGE.finditer(text):
        start_text, end_text = match.group("start"), match.group("end")
        start_suffix = re.search(r"(am|pm)\s*$", start_text)
        end_suffix = re.search(r"(am|pm)\s*$", end_text)
        fallback = (end_suffix or start_suffix).group(1) if (end_suffix or start_suffix) else None
        start_minutes = _clock_minutes(start_text, fallback, time_of_day)
        end_minutes = _clock_minutes(end_text, fallback, time_of_day, is_end=True)
        expression = match.group(0).strip()
        expressions.append(expression)
        consumed.append(match.span())
        if start_minutes is None or end_minutes is None or end_minutes <= start_minutes:
            continue
        start_period = _start_period(start_minutes)
        end_period = _end_period(end_minutes)
        if start_period is not None and end_period is not None and end_period >= start_period:
            ranges.append((start_period, end_period))

    for match in _SINGLE_CLOCK.finditer(text):
        if any(start < match.end() and match.start() < end for start, end in consumed):
            continue
        expressions.append(match.group(0).strip())
        clock_text = re.sub(r"\s+baje$", "", match.group(0).strip())
        minutes = _clock_minutes(clock_text, None, time_of_day)
        if minutes is not None:
            period = _period_at(minutes)
            if period is not None:
                single_periods.append(period)

    for match in _TIME_OF_DAY.finditer(text):
        expressions.append(match.group(0).strip())

    windows: list[BookingWindow] = []
    # Pair one stated time range with any explicitly listed alternative days.
    # If several days and ranges appear, their association is ambiguous; keep
    # the components but do not manufacture a cross-product of windows.
    can_pair_windows = len(weekdays) <= 1 or len(ranges) <= 1
    if weekdays and ranges and can_pair_windows:
        for day in weekdays:
            for start_period, end_period in ranges:
                windows.append(
                    BookingWindow(
                        day=day,
                        from_period=start_period,
                        to_period=end_period,
                    )
                )
    period_values = [
        period
        for start, end in ranges
        for period in range(start, min(end, 13) + 1)
    ]
    period_values.extend(single_periods)
    return _unique(expressions), tuple(windows), tuple(dict.fromkeys(period_values))


def _requester(original: str) -> str | None:
    for pattern in (_REQUESTER, _ORG_PREFIX):
        match = pattern.search(original)
        if match:
            value = match.groupdict().get("value") or match.groupdict().get("from")
            if value:
                return value.strip(" \t\r\n'\"“”‘’")
    return None


def _role(text: str, conflicts: list[EntityConflict]) -> str | None:
    roles: list[str] = []
    for match in _ROLE.finditer(text):
        value = match.group("role")
        normalized = "department_coordinator" if value == "department coordinator" else (
            "admin" if value.startswith("admin") else value
        )
        roles.append(normalized)
    return _single_or_conflict("role", roles, conflicts)


def _department(text: str, conflicts: list[EntityConflict]) -> str | None:
    values: list[str] = []
    for match in _DEPARTMENT.finditer(text):
        values.append(next(value for value in match.groups() if value).upper())
    return _single_or_conflict("department", values, conflicts)


def _requested_room(text: str, conflicts: list[EntityConflict]) -> str | None:
    values = [match.group(0).upper() for match in _ROOM_ID.finditer(text)]
    for pattern, prefix in _ROOM_NAMES:
        for match in pattern.finditer(text):
            if prefix == "AUD":
                values.append(prefix)
            else:
                values.append(f"{prefix}-{match.group(1)}")
    if not values:
        values = [match.group(0).lower() for match in _ROOM_NUMBER.finditer(text)]
    return _single_or_conflict("requested_room", values, conflicts)


def _title(text: str, conflicts: list[EntityConflict]) -> str | None:
    values: list[str] = []
    for match in _TITLE.finditer(text):
        candidate = match.group("title").strip(" -")
        if _GROUP_ID.fullmatch(candidate) or re.match(
            r"(?:course|session)\s+[a-z]*\d", candidate
        ):
            continue
        boundary = _TITLE_END.search(candidate)
        if boundary:
            candidate = candidate[: boundary.start()].strip(" -")
        if candidate and candidate not in {"room", "venue", "hall", "space"}:
            values.append(candidate)
    return _single_or_conflict("title", values, conflicts)


def _disruption_type(text: str, conflicts: list[EntityConflict]) -> str | None:
    values: list[str] = []
    if _DISRUPTION_ADD_FACULTY.search(text):
        values.append("add_faculty")
    if _DISRUPTION_ADD_SESSION.search(text):
        values.append("add_session")
    if _DISRUPTION_REMOVE_SESSION.search(text):
        values.append("remove_session")
    if _DISRUPTION_ROOM.search(text):
        values.append("room_unavailable")
    if _DISRUPTION_FACULTY.search(text):
        values.append("faculty_unavailable")
    if not values:
        return None
    return _single_or_conflict("disruption_type", values, conflicts)


def _unresolved_temporal(normalized: NormalizationResult) -> tuple[str, ...]:
    values = list(_RELATIVE_TEMPORAL.findall(normalized.normalized_text))
    values.extend(_AMBIGUOUS_RELATIVE.findall(normalized.normalized_text))
    return _unique(values)


def extract_entities(request: AssistantRequest | str) -> EntityExtraction:
    """Extract explicitly stated entities without creating domain proposals.

    A string or existing ``AssistantRequest`` may be supplied. Relative dates
    remain in ``unresolved_temporal_expressions``; this function never resolves
    them against the calendar. Conflicting scalar values are left unset and
    listed in ``conflicts``.
    """

    original = request.message if isinstance(request, AssistantRequest) else request
    normalized = normalize_text(original)
    text = normalized.normalized_text
    conflicts: list[EntityConflict] = []
    days = _weekdays(text)
    time_expressions, windows, periods = _time_data(text, days)

    attendance_values = [
        str(int(match.group("number").replace(",", "")))
        for match in _ATTENDANCE.finditer(text)
    ]
    attendance_value = _single_or_conflict("attendance", attendance_values, conflicts)
    duration_values = [match.group("number") for match in _DURATION.finditer(text)]
    duration_value = _single_or_conflict("duration_periods", duration_values, conflicts)

    role_value = _role(text, conflicts)
    department_value = _department(text, conflicts)
    requester_value = _requester(original)
    requested_room = _requested_room(text, conflicts)
    room_types = _unique([value for pattern, value in _ROOM_TYPES if pattern.search(text)])
    needs = (
        _unique([value for pattern, value in _NEEDS if pattern.search(text)])
        if _NEED_CUE.search(text)
        else ()
    )

    mandatory_groups: list[str] = []
    for match in _MANDATORY_GROUP.finditer(text):
        mandatory_groups.extend(group.upper() for group in _GROUP_ID.findall(match.group(1)))

    booking = BookingEntities(
        requester=requester_value,
        role=role_value,
        department=department_value,
        requested_room=requested_room,
        room_types=room_types,
        title=_title(text, conflicts),
        attendance=int(attendance_value) if attendance_value is not None else None,
        duration_periods=int(duration_value) if duration_value is not None else None,
        weekdays=days,
        time_expressions=time_expressions,
        windows=windows,
        needs=needs,
        mandatory_for_groups=_unique(mandatory_groups),
    )

    disruption_type = _disruption_type(text, conflicts)
    room_id = requested_room if re.search(
        r"\b(?:room|classroom|hall|auditorium|venue|lab)\b", text
    ) else None
    faculty_id = _single_or_conflict(
        "faculty_id", [match.group(0).upper() for match in _FACULTY_ID.finditer(original)], conflicts
    )
    faculty_names = [
        match.group("doctor") or match.group("person")
        for match in _FACULTY_NAME.finditer(original)
    ]
    faculty_name = _single_or_conflict("faculty_name", faculty_names, conflicts)
    session_id = _single_or_conflict(
        "session_id", [match.group(0).upper() for match in _SESSION_ID.finditer(original)], conflicts
    )
    course_id = _single_or_conflict(
        "course_id", [match.group(0).upper() for match in _COURSE_ID.finditer(original)], conflicts
    )
    addition_details = tuple(
        match.group(0).strip() for match in re.finditer(r"\badd\b[^.;,]*", original, re.IGNORECASE)
    )
    replacement_details = tuple(match.group(0).strip() for match in _REPLACEMENT.finditer(original))

    disruption = DisruptionEntities(
        disruption_type=disruption_type,
        room_id=room_id,
        faculty_id=faculty_id,
        faculty_name=faculty_name,
        session_id=session_id,
        course_id=course_id,
        weekdays=days,
        periods=periods,
        addition_details=addition_details,
        replacement_details=replacement_details,
    )

    return EntityExtraction(
        original_message=original,
        intent=classify_intent(request).intent,
        booking=booking,
        disruption=disruption,
        unresolved_temporal_expressions=_unresolved_temporal(normalized),
        conflicts=tuple(conflicts),
    )
