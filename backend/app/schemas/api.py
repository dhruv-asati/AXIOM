from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel


class ErrorResponse(BaseModel):
    detail: Any


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str


class DatasetSummaryResponse(BaseModel):
    id: UUID
    source_dataset_id: str
    institute: str
    created_at: datetime


class DatasetDetailResponse(BaseModel):
    id: UUID
    source_dataset_id: str
    institute: str
    calendar: dict
    priority_order: list[str]
    role_category_cap: dict[str, str]


class DatasetImportResponse(BaseModel):
    dataset_id: UUID
    source_dataset_id: str
    counts: dict[str, int]


class BookingRunCounts(BaseModel):
    approved: int
    rejected: int
    pending: int


class BookingRunResponse(BaseModel):
    dataset_id: UUID
    schedule_id: UUID
    counts: BookingRunCounts


class BookingOutcomeResponse(BaseModel):
    request_id: str
    status: Literal["approved", "rejected", "alternative_offered", "pending"]
    day: str | None = None
    start_period: int | None = None
    end_period: int | None = None
    room_id: str | None = None
    reason: str | None = None


class TimetableGenerateResponse(BaseModel):
    schedule_id: UUID
    source_id: str
    dataset_id: UUID
    status: Literal["optimal", "feasible"]
    scheduled_sessions: int
    unscheduled_sessions: int
    scheduled_exams: int
    soft_penalties: dict[str, int]
    soft_total: int
    exam_soft_penalty: int


class SessionAssignmentResponse(BaseModel):
    session_id: str
    day: str
    start_period: int
    room_id: str


class ScheduleAssignmentsResponse(BaseModel):
    schedule_id: UUID
    dataset_id: UUID
    status: Literal["complete", "incomplete"]
    assignments: list[SessionAssignmentResponse]


class ScheduleExportSession(BaseModel):
    session_id: str
    day: str
    start_period: int
    room_id: str


class ScheduleExportExam(BaseModel):
    exam_id: str
    day: str
    session: str
    rooms: list[str]


class ScheduleExportResponse(BaseModel):
    team: str
    dataset_id: str
    sessions: list[ScheduleExportSession]
    exams: list[ScheduleExportExam]
