"""Pure deterministic rendering of structured AXIOM assistant responses."""

from __future__ import annotations

from app.services.ai.schemas import AssistantResponse, BookingWindow, DisruptionChange


def _humanize(value: str) -> str:
    return value.replace("_", " ").strip()


def _window(window: BookingWindow) -> str:
    if window.from_period == window.to_period:
        periods = f"period {window.from_period}"
    else:
        periods = f"periods {window.from_period}–{window.to_period}"
    return f"{window.day}, {periods}"


def _disruption_summary(change: DisruptionChange) -> str:
    if change.type == "faculty_unavailable":
        days = ", ".join(change.days)
        periods = ", ".join(str(value) for value in change.periods)
        return (
            f"Mark faculty {change.faculty_id} unavailable on {days}, "
            f"periods {periods} (reason: {change.reason})."
        )
    if change.type == "room_unavailable":
        days = ", ".join(change.days)
        periods = ", ".join(str(value) for value in change.periods)
        return (
            f"Mark room {change.room_id} unavailable on {days}, "
            f"periods {periods} (reason: {change.reason})."
        )
    if change.type == "add_faculty":
        faculty = change.faculty
        details = [faculty.name, f"ID {faculty.id}", faculty.department]
        return "Add faculty record: " + ", ".join(details) + "."
    if change.type == "add_session":
        session = change.session
        details = [f"session {session.id}", f"course {session.course_id}", session.kind]
        if session.groups:
            details.append("groups " + ", ".join(session.groups))
        return "Add " + ", ".join(details) + "."
    return f"Remove session {change.session_id}."


def _warnings(response: AssistantResponse) -> list[str]:
    return [f"Note: {warning.message}" for warning in response.warnings]


def format_assistant_response(response: AssistantResponse) -> str:
    """Render an existing response for the user without changing its meaning.

    The formatter reads only the validated response object. It performs no
    lookups, approvals, submissions, or timetable operations.
    """
    if response.status == "clarification_required":
        fields = list(dict.fromkeys(response.missing_fields))
        need = ", ".join(_humanize(field) for field in fields)
        text = f"I still need {need}. " if need else "I need one more detail. "
        if response.clarification is not None:
            text += response.clarification.question.strip()
        else:
            text += "Please clarify the request."
        return " ".join([text, *_warnings(response)]).strip()

    if response.status == "proposal_ready" and response.proposal is not None:
        if response.proposal.type == "booking":
            data = response.proposal.data
            details = [
                f"requester: {data.requester}",
                f"title: {data.title}",
                f"attendance: {data.attendance}",
                f"duration: {data.duration_periods} periods",
            ]
            if data.room_types:
                details.append("room type: " + ", ".join(_humanize(item) for item in data.room_types))
            if data.windows:
                details.append("window: " + "; ".join(_window(item) for item in data.windows))
            if data.requested_room:
                details.append(f"requested room: {data.requested_room}")
            if data.needs:
                details.append("needs: " + ", ".join(data.needs))
            text = (
                "Booking proposal for review: " + "; ".join(details)
                + ". This is not an approved reservation and has not been submitted."
            )
            if response.assumptions:
                text += " Assumptions: " + "; ".join(response.assumptions) + "."
            return " ".join([text, *_warnings(response)]).strip()

        summaries = [
            _disruption_summary(change)
            for change in response.proposal.data.changes
        ]
        text = (
            "Disruption proposal for review: " + " ".join(summaries)
            + " It has not been executed, and no timetable repair has been run."
        )
        if response.assumptions:
            text += " Assumptions: " + "; ".join(response.assumptions) + "."
        return " ".join([text, *_warnings(response)]).strip()

    if response.status == "unsupported":
        return (
            "I can help with room booking requests and timetable disruption requests. "
            "I couldn't identify either kind of request here."
        )

    # Keep internal codes out of user-facing text. The structured error remains
    # available to the caller for diagnostics.
    if response.error and response.error.code.startswith("INTENT_NOT_SUPPORTED"):
        return "This request needs a different assistant workflow. I have not made any changes."
    return "I couldn't safely prepare this request. Please check the details and try again. No changes were made."
