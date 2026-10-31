from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.services.ai.schemas import (
    AssistantRequest, AssistantResponse, BookingRequestData, DisruptionRequest,
)


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


class DatasetStatsResponse(BaseModel):
    faculty: int
    student_groups: int
    courses: int
    rooms: int
    timetable_sessions: int
    examinations: int
    booking_requests: int


class ScheduleSummaryResponse(BaseModel):
    schedule_id: UUID
    source_id: str
    team: str
    created_at: datetime
    status: Literal["complete", "incomplete"]
    assignment_count: int
    examination_count: int


class ScheduleDetailResponse(ScheduleSummaryResponse):
    dataset_id: UUID


class RoomRecordResponse(BaseModel):
    room_id: str
    name: str
    building: str
    room_type: str
    capacity: int
    features: list[str]
    accessible: bool
    allowed_uses: list[str]
    availability: Literal["available", "occupied", "unavailable", "not_checked"]
    scheduled_periods: int
    unavailable_periods: int
    utilization_percent: float | None


class ExaminationRoomResponse(BaseModel):
    room_id: str
    name: str
    capacity: int
    effective_capacity: int


class ExaminationRecordResponse(BaseModel):
    exam_id: str
    course_ids: list[str]
    course_names: list[str]
    group_ids: list[str]
    group_names: list[str]
    expected_attendance: int
    day: str | None
    session: str | None
    rooms: list[ExaminationRoomResponse]
    effective_allocated_capacity: int


class ExaminationsResponse(BaseModel):
    dataset_id: UUID
    schedule_id: UUID
    examinations: list[ExaminationRecordResponse]


class BookingRequestCreate(BaseModel):
    data: BookingRequestData
    raw_text: str = ""
    source_id: str | None = Field(default=None, min_length=1, max_length=160)


class BookingRequestRecordResponse(BaseModel):
    request_id: str
    submitted_at: datetime
    requester: str
    role: str
    department: str | None
    requested_category: str
    effective_category: str
    priority_rank: int
    title: str
    attendance: int
    duration_periods: int
    windows: list[dict[str, Any]]
    room_types: list[str]
    needs: list[str]
    requested_room: str | None
    mandatory_for_groups: list[str]
    cancelled: bool
    status: Literal["approved", "rejected", "alternative_offered", "pending"]
    day: str | None
    start_period: int | None
    end_period: int | None
    room_id: str | None
    reason: str | None


class DashboardSummaryResponse(BaseModel):
    dataset_id: UUID
    source_dataset_id: str
    institute: str
    counts: DatasetStatsResponse
    schedule_count: int
    latest_schedule: ScheduleSummaryResponse | None
    booking_counts: dict[str, int]
    room_utilisation_percent: float | None
    room_utilisation_definition: str
    upcoming_sessions: list[dict[str, Any]]
    recent_repair_proposals: list[dict[str, Any]]


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
    solver_objective: int = 0
    best_objective_bound: float = 0
    solve_time_seconds: float = 0


class RepairProposalRequest(DisruptionRequest):
    time_limit_seconds: float = Field(default=60, ge=1, le=600)


class AssistantRepairRequest(AssistantRequest):
    time_limit_seconds: float = Field(default=60, ge=1, le=600)


class AssistantRepairResponse(BaseModel):
    status: Literal["clarification_required", "proposal_ready", "unsupported", "error"]
    interpretation: AssistantResponse
    repair: "RepairProposalResponse | None" = None


class RepairProposalResponse(BaseModel):
    proposal_id: UUID
    dataset_id: UUID
    baseline_schedule_id: UUID
    approved_schedule_id: UUID | None
    status: Literal["proposed", "approved", "rejected"]
    changes: list[dict[str, Any]]
    assignments: list[dict[str, Any]]
    exam_allocations: list[dict[str, Any]]
    affected_session_ids: list[str]
    changed_session_ids: list[str]
    objective: dict[str, Any]
    explanation: str
    created_at: datetime
    decided_at: datetime | None


AssistantRepairResponse.model_rebuild()


class RepairRejectRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class SessionAssignmentResponse(BaseModel):
    session_id: str
    course_id: str
    course_name: str
    department: str
    year: int
    kind: str
    duration: int
    faculty_id: str
    faculty_name: str
    day: str
    start_period: int
    end_period: int
    room_id: str
    room_name: str
    student_groups: list[dict[str, Any]]


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
