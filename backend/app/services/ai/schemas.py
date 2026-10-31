"""Pydantic transport and proposal schemas for the AXIOM AI assistant.

These models describe interpretation and handoff data only. They do not make
booking decisions or apply timetable disruptions.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PositiveInt,
    field_validator,
    model_validator,
)


BookingDay = Literal["MON", "TUE", "WED", "THU", "FRI"]
RequesterRole = Literal["admin", "department_coordinator", "faculty", "club"]
AssistantIntent = Literal["booking", "disruption", "unknown"]
AssistantStatus = Literal[
    "clarification_required", "proposal_ready", "unsupported", "error"
]
TimetablePeriod = Annotated[int, Field(ge=1, le=13)]


class StrictModel(BaseModel):
    """Base model that rejects fields outside the reviewed contract."""

    model_config = ConfigDict(extra="forbid")


class RequesterInfo(StrictModel):
    """Optional requester context; message text is not trusted identity data."""

    requester: str | None = None
    role: RequesterRole | None = None
    department: str | None = None


class ConversationMessage(StrictModel):
    """One prior conversational turn supplied as context."""

    role: Literal["user", "assistant"]
    content: str


class AssistantRequest(StrictModel):
    """Natural-language input plus optional context for relative date parsing."""

    message: str = Field(min_length=1)
    requester: RequesterInfo | None = None
    context: list[ConversationMessage] = Field(default_factory=list)
    reference_datetime: datetime | None = None
    timezone: str | None = None
    conversation_id: str | None = None

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message must contain non-whitespace text")
        return value

    @field_validator("reference_datetime")
    @classmethod
    def reference_datetime_must_include_offset(
        cls, value: datetime | None
    ) -> datetime | None:
        if value is not None and value.utcoffset() is None:
            raise ValueError("reference_datetime must include a UTC offset")
        return value

    @field_validator("timezone")
    @classmethod
    def timezone_must_be_iana(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError) as exc:
                raise ValueError("timezone must be a valid IANA timezone") from exc
        return value


class BookingWindow(StrictModel):
    """A permissible day/period range, not a final room allocation."""

    day: BookingDay
    from_period: PositiveInt
    to_period: PositiveInt

    @model_validator(mode="after")
    def end_must_not_precede_start(self) -> BookingWindow:
        if self.to_period < self.from_period:
            raise ValueError("to_period must be greater than or equal to from_period")
        return self


class BookingRequestData(StrictModel):
    """Dataset-shaped booking request proposed for backend review."""

    requester: str = Field(min_length=1)
    role: RequesterRole
    department: str | None = None
    requested_category: str | None = None
    title: str = Field(min_length=1)
    attendance: PositiveInt
    duration_periods: PositiveInt
    windows: list[BookingWindow] = Field(min_length=1)
    room_types: list[str]
    needs: list[str] = Field(default_factory=list)
    requested_room: str | None = None
    mandatory_for_groups: list[str] = Field(default_factory=list)
    series_id: str | None = None


class BookingProposal(StrictModel):
    """A booking interpretation; it carries no approval/decision fields."""

    type: Literal["booking"]
    data: BookingRequestData


class PeriodSlot(StrictModel):
    """Dataset fixed-slot structure for a session."""

    day: BookingDay
    start_period: TimetablePeriod


class FacultyUnavailability(StrictModel):
    """One unavailable day and its periods from a faculty record."""

    day: BookingDay
    periods: list[TimetablePeriod]
    reason: str | None = None


class FacultyPreference(StrictModel):
    """Dataset faculty preference structure."""

    type: Literal["avoid"]
    days: list[BookingDay]
    periods: list[TimetablePeriod]
    note: str


class FacultyRecord(StrictModel):
    """Faculty record shape used by the documented add_faculty change."""

    id: str
    name: str
    department: str
    max_hours_per_day: PositiveInt
    needs_accessible: bool
    unavailable: list[FacultyUnavailability]
    preferences: list[FacultyPreference]


class SessionRecord(StrictModel):
    """Session record shape used by the documented add_session change."""

    id: str
    course_id: str
    kind: Literal["lecture", "tutorial", "lab"]
    groups: list[str]
    faculty_id: str
    size: PositiveInt
    duration: PositiveInt
    room_types: list[str]
    needs_accessible: bool
    basket_slot: str | None
    fixed_slot: PeriodSlot | None


class FacultyUnavailableChange(StrictModel):
    """Mark faculty unavailable for specified weekdays and periods."""

    type: Literal["faculty_unavailable"]
    faculty_id: str
    days: list[BookingDay]
    periods: list[TimetablePeriod]
    reason: str


class RoomUnavailableChange(StrictModel):
    """Mark a room unavailable for specified weekdays and periods."""

    type: Literal["room_unavailable"]
    room_id: str
    days: list[BookingDay]
    periods: list[TimetablePeriod]
    reason: str


class AddFacultyChange(StrictModel):
    """Add a faculty record using the dataset record shape."""

    type: Literal["add_faculty"]
    faculty: FacultyRecord


class AddSessionChange(StrictModel):
    """Add a session using the dataset record shape."""

    type: Literal["add_session"]
    session: SessionRecord


class RemoveSessionChange(StrictModel):
    """Remove the identified session."""

    type: Literal["remove_session"]
    session_id: str


DisruptionChange = Annotated[
    FacultyUnavailableChange
    | RoomUnavailableChange
    | AddFacultyChange
    | AddSessionChange
    | RemoveSessionChange,
    Field(discriminator="type"),
]


class DisruptionRequest(StrictModel):
    """One or more documented change requests; no repair is performed here."""

    changes: list[DisruptionChange] = Field(min_length=1)


class DisruptionProposal(StrictModel):
    """A disruption interpretation for timetable-system review."""

    type: Literal["disruption"]
    data: DisruptionRequest


class Clarification(StrictModel):
    """A follow-up question and the fields it is intended to resolve."""

    id: str
    question: str
    fields: list[str] = Field(min_length=1)


class Warning(StrictModel):
    """A non-blocking interpretation caveat for the user or frontend."""

    code: str
    message: str


class Error(StrictModel):
    """A machine-readable assistant processing error."""

    code: str
    message: str


class ExtractedEntities(StrictModel):
    """Plain extracted values using dataset booking terminology."""

    requester: str | None = None
    role: RequesterRole | None = None
    department: str | None = None
    requested_category: str | None = None
    title: str | None = None
    attendance: PositiveInt | None = None
    duration_periods: PositiveInt | None = None
    windows: list[BookingWindow] | None = None
    room_types: list[str] | None = None
    needs: list[str] = Field(default_factory=list)
    requested_room: str | None = None
    mandatory_for_groups: list[str] = Field(default_factory=list)
    series_id: str | None = None


class AssistantResponse(StrictModel):
    """Predictable response envelope for frontend rendering and review."""

    intent: AssistantIntent
    status: AssistantStatus
    extracted_entities: ExtractedEntities
    missing_fields: list[str] = Field(default_factory=list)
    clarification: Clarification | None = None
    proposal: BookingProposal | DisruptionProposal | None = Field(
        default=None, discriminator="type"
    )
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[Warning] = Field(default_factory=list)
    error: Error | None = None

    @model_validator(mode="after")
    def validate_status_payload(self) -> AssistantResponse:
        if self.status == "clarification_required":
            if (
                self.clarification is None
                or self.proposal is not None
                or self.error is not None
                or not self.missing_fields
                or self.intent == "unknown"
            ):
                raise ValueError(
                    "clarification_required needs a known intent, missing fields, and a question; "
                    "it cannot include proposal or error"
                )
        elif self.status == "proposal_ready":
            if (
                self.proposal is None
                or self.clarification is not None
                or self.error is not None
                or self.missing_fields
            ):
                raise ValueError(
                    "proposal_ready needs proposal and cannot include missing fields, "
                    "clarification, or error"
                )
            expected_intent = "booking" if self.proposal.type == "booking" else "disruption"
            if self.intent != expected_intent:
                raise ValueError("intent must match the proposal type")
        elif self.status == "unsupported":
            if (
                self.intent != "unknown"
                or self.proposal is not None
                or self.clarification is not None
                or self.error is not None
                or self.missing_fields
            ):
                raise ValueError(
                    "unsupported requires unknown intent and cannot include proposal, "
                    "missing fields, clarification, or error"
                )
        elif self.status == "error":
            if self.error is None or self.proposal is not None or self.clarification is not None:
                raise ValueError(
                    "error status needs error and cannot include proposal or clarification"
                )
        return self
