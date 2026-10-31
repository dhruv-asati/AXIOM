from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, JSON, String, Text, UniqueConstraint, Uuid, and_
from sqlalchemy.orm import Mapped, foreign, mapped_column, relationship

from app.database.session import Base


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)


def json_column(nullable: bool = False) -> Mapped[Any]:
    return mapped_column(JSON, nullable=nullable)


class Dataset(Base):
    __tablename__ = "datasets"

    id = uuid_pk()
    source_dataset_id: Mapped[str] = mapped_column(String(160), nullable=False)
    institute: Mapped[str] = mapped_column(String(255), nullable=False)
    calendar: Mapped[dict[str, Any]] = json_column()
    priority_order: Mapped[list[str]] = json_column()
    role_category_cap: Mapped[dict[str, str]] = json_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    __table_args__ = (UniqueConstraint("source_dataset_id", name="uq_datasets_source_dataset_id"),)

    faculty: Mapped[list[Faculty]] = relationship(back_populates="dataset", cascade="all, delete-orphan")
    courses: Mapped[list[Course]] = relationship(back_populates="dataset", cascade="all, delete-orphan")
    groups: Mapped[list[StudentGroup]] = relationship(back_populates="dataset", cascade="all, delete-orphan")
    rooms: Mapped[list[Room]] = relationship(back_populates="dataset", cascade="all, delete-orphan")
    sessions: Mapped[list[TimetableSession]] = relationship(back_populates="dataset", viewonly=True)
    booking_requests: Mapped[list[BookingRequest]] = relationship(back_populates="dataset", cascade="all, delete-orphan")
    examinations: Mapped[list[Examination]] = relationship(back_populates="dataset", cascade="all, delete-orphan")
    schedules: Mapped[list[Schedule]] = relationship(back_populates="dataset", cascade="all, delete-orphan")
    repair_proposals: Mapped[list[ScheduleRepairProposal]] = relationship(back_populates="dataset", cascade="all, delete-orphan")


class DatasetEntity:
    """Mixin for source records whose IDs are unique only within a dataset."""
    id: Mapped[uuid.UUID]
    dataset_id: Mapped[uuid.UUID]
    source_id: Mapped[str]

    @classmethod
    def source_constraints(cls, table: str) -> tuple[Any, ...]:
        return (
            ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
            UniqueConstraint("dataset_id", "source_id", name=f"uq_{table}_dataset_source"),
        )


class Faculty(Base):
    __tablename__ = "faculty"
    id = uuid_pk()
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str] = mapped_column(String(120), nullable=False)
    max_hours_per_day: Mapped[int] = mapped_column(Integer, nullable=False)
    needs_accessible: Mapped[bool] = mapped_column(Boolean, nullable=False)
    unavailable: Mapped[list[dict[str, Any]]] = json_column()
    preferences: Mapped[list[dict[str, Any]]] = json_column()
    __table_args__ = (ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"), UniqueConstraint("dataset_id", "source_id", name="uq_faculty_dataset_source"), CheckConstraint("max_hours_per_day >= 0", name="ck_faculty_max_hours_nonnegative"), Index("ix_faculty_dataset_department", "dataset_id", "department"))
    dataset: Mapped[Dataset] = relationship(back_populates="faculty")
    sessions: Mapped[list[TimetableSession]] = relationship(back_populates="faculty", viewonly=True)


class Course(Base):
    __tablename__ = "courses"
    id = uuid_pk()
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str] = mapped_column(String(120), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    lecture_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    tutorial_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    lab_blocks: Mapped[int] = mapped_column(Integer, nullable=False)
    __table_args__ = (ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"), UniqueConstraint("dataset_id", "source_id", name="uq_courses_dataset_source"), Index("ix_courses_dataset_department_year", "dataset_id", "department", "year"))
    dataset: Mapped[Dataset] = relationship(back_populates="courses")
    sessions: Mapped[list[TimetableSession]] = relationship(back_populates="course", viewonly=True)


class StudentGroup(Base):
    __tablename__ = "student_groups"
    id = uuid_pk()
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    department: Mapped[str] = mapped_column(String(120), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    needs_accessible: Mapped[bool] = mapped_column(Boolean, nullable=False)
    __table_args__ = (ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"), UniqueConstraint("dataset_id", "source_id", name="uq_student_groups_dataset_source"), Index("ix_student_groups_dataset_department_year", "dataset_id", "department", "year"))
    dataset: Mapped[Dataset] = relationship(back_populates="groups")
    sessions: Mapped[list[TimetableSession]] = relationship(secondary="session_groups", back_populates="groups")


class Room(Base):
    __tablename__ = "rooms"
    id = uuid_pk()
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    building: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    features: Mapped[list[str]] = json_column()
    accessible: Mapped[bool] = mapped_column(Boolean, nullable=False)
    allowed_uses: Mapped[list[str]] = json_column()
    __table_args__ = (ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"), UniqueConstraint("dataset_id", "source_id", name="uq_rooms_dataset_source"), Index("ix_rooms_dataset_type_capacity", "dataset_id", "type", "capacity"))
    dataset: Mapped[Dataset] = relationship(back_populates="rooms")
    unavailability: Mapped[list[RoomUnavailability]] = relationship(back_populates="room", viewonly=True)
    allocations: Mapped[list[ScheduleSessionAssignment]] = relationship(back_populates="room", viewonly=True)


class RoomUnavailability(Base):
    __tablename__ = "room_unavailability"
    id = uuid_pk()
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    room_source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    day: Mapped[str] = mapped_column(String(24), nullable=False)
    periods: Mapped[list[int]] = json_column()
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    __table_args__ = (ForeignKeyConstraint(["dataset_id", "room_source_id"], ["rooms.dataset_id", "rooms.source_id"], ondelete="CASCADE"), Index("ix_room_unavailability_dataset_day", "dataset_id", "day"))
    room: Mapped[Room] = relationship(back_populates="unavailability", foreign_keys="[RoomUnavailability.dataset_id, RoomUnavailability.room_source_id]", viewonly=True)


session_groups = __import__("sqlalchemy").Table(
    "session_groups", Base.metadata,
    __import__("sqlalchemy").Column("dataset_id", Uuid(as_uuid=True), primary_key=True),
    __import__("sqlalchemy").Column("session_source_id", String(160), primary_key=True),
    __import__("sqlalchemy").Column("group_source_id", String(160), primary_key=True),
    ForeignKeyConstraint(["dataset_id", "session_source_id"], ["timetable_sessions.dataset_id", "timetable_sessions.source_id"], ondelete="CASCADE"),
    ForeignKeyConstraint(["dataset_id", "group_source_id"], ["student_groups.dataset_id", "student_groups.source_id"], ondelete="CASCADE"),
)


class TimetableSession(Base):
    __tablename__ = "timetable_sessions"
    id = uuid_pk()
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    course_source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    faculty_source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    kind: Mapped[str] = mapped_column(String(60), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    duration: Mapped[int] = mapped_column(Integer, nullable=False)
    room_types: Mapped[list[str]] = json_column()
    needs_accessible: Mapped[bool] = mapped_column(Boolean, nullable=False)
    basket_slot: Mapped[str | None] = mapped_column(String(120))
    fixed_slot: Mapped[dict[str, Any] | None] = json_column(nullable=True)
    __table_args__ = (ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"), ForeignKeyConstraint(["dataset_id", "course_source_id"], ["courses.dataset_id", "courses.source_id"]), ForeignKeyConstraint(["dataset_id", "faculty_source_id"], ["faculty.dataset_id", "faculty.source_id"]), UniqueConstraint("dataset_id", "source_id", name="uq_timetable_sessions_dataset_source"), CheckConstraint("duration > 0", name="ck_timetable_sessions_duration_positive"), Index("ix_timetable_sessions_dataset_course", "dataset_id", "course_source_id"), Index("ix_timetable_sessions_dataset_faculty", "dataset_id", "faculty_source_id"))
    dataset: Mapped[Dataset] = relationship(back_populates="sessions", viewonly=True)
    course: Mapped[Course] = relationship(back_populates="sessions", foreign_keys=[dataset_id, course_source_id], viewonly=True)
    faculty: Mapped[Faculty] = relationship(back_populates="sessions", foreign_keys=[dataset_id, faculty_source_id], viewonly=True)
    groups: Mapped[list[StudentGroup]] = relationship(secondary=session_groups, back_populates="sessions")
    assignments: Mapped[list[ScheduleSessionAssignment]] = relationship(back_populates="session", viewonly=True)


class BookingRequest(Base):
    __tablename__ = "booking_requests"
    id = uuid_pk()
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    requester: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(80), nullable=False)
    department: Mapped[str | None] = mapped_column(String(160))
    requested_category: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    attendance: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_periods: Mapped[int] = mapped_column(Integer, nullable=False)
    windows: Mapped[list[dict[str, Any]]] = json_column()
    room_types: Mapped[list[str]] = json_column()
    needs: Mapped[list[str]] = json_column()
    requested_room: Mapped[str | None] = mapped_column(String(160))
    mandatory_for_groups: Mapped[list[str]] = json_column()
    series_id: Mapped[str | None] = mapped_column(String(160))
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    __table_args__ = (ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"), UniqueConstraint("dataset_id", "source_id", name="uq_booking_requests_dataset_source"), Index("ix_booking_requests_dataset_submitted", "dataset_id", "submitted_at"), Index("ix_booking_requests_dataset_role", "dataset_id", "role"))
    dataset: Mapped[Dataset] = relationship(back_populates="booking_requests")
    cancellation: Mapped[Cancellation | None] = relationship(back_populates="request", uselist=False, viewonly=True)
    outcomes: Mapped[list[BookingOutcome]] = relationship(back_populates="request", viewonly=True)


class Cancellation(Base):
    __tablename__ = "cancellations"
    id = uuid_pk()
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    request_source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    cancelled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    by: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    __table_args__ = (ForeignKeyConstraint(["dataset_id", "request_source_id"], ["booking_requests.dataset_id", "booking_requests.source_id"], ondelete="CASCADE"), UniqueConstraint("dataset_id", "request_source_id", name="uq_cancellations_request"))
    request: Mapped[BookingRequest] = relationship(back_populates="cancellation", foreign_keys=[dataset_id, request_source_id], viewonly=True)


class Schedule(Base):
    __tablename__ = "schedules"
    id = uuid_pk()
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    team: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    __table_args__ = (ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"), UniqueConstraint("dataset_id", "source_id", name="uq_schedules_dataset_source"), UniqueConstraint("id", "dataset_id", name="uq_schedules_id_dataset"))
    dataset: Mapped[Dataset] = relationship(back_populates="schedules")
    assignments: Mapped[list[ScheduleSessionAssignment]] = relationship(back_populates="schedule", viewonly=True)
    booking_outcomes: Mapped[list[BookingOutcome]] = relationship(back_populates="schedule", viewonly=True)
    exam_allocations: Mapped[list[ExamRoomAllocation]] = relationship(back_populates="schedule", viewonly=True)
    overrides: Mapped[list[ScheduleOverride]] = relationship(back_populates="schedule", viewonly=True)


class ScheduleSessionAssignment(Base):
    __tablename__ = "schedule_session_assignments"
    id = uuid_pk()
    schedule_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    session_source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    room_source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    day: Mapped[str] = mapped_column(String(24), nullable=False)
    start_period: Mapped[int] = mapped_column(Integer, nullable=False)
    __table_args__ = (ForeignKeyConstraint(["schedule_id", "dataset_id"], ["schedules.id", "schedules.dataset_id"], ondelete="CASCADE"), ForeignKeyConstraint(["dataset_id", "session_source_id"], ["timetable_sessions.dataset_id", "timetable_sessions.source_id"], ondelete="CASCADE"), ForeignKeyConstraint(["dataset_id", "room_source_id"], ["rooms.dataset_id", "rooms.source_id"]), UniqueConstraint("schedule_id", "session_source_id", name="uq_schedule_session_assignment"), CheckConstraint("start_period > 0", name="ck_session_assignment_period_positive"), Index("ix_session_assignments_schedule_day", "schedule_id", "day", "start_period"))
    schedule: Mapped[Schedule] = relationship(back_populates="assignments", viewonly=True)
    session: Mapped[TimetableSession] = relationship(back_populates="assignments", primaryjoin=lambda: and_(TimetableSession.dataset_id == ScheduleSessionAssignment.dataset_id, TimetableSession.source_id == foreign(ScheduleSessionAssignment.session_source_id)))
    room: Mapped[Room] = relationship(back_populates="allocations", primaryjoin=lambda: and_(Room.dataset_id == ScheduleSessionAssignment.dataset_id, Room.source_id == foreign(ScheduleSessionAssignment.room_source_id)))


class BookingOutcome(Base):
    __tablename__ = "booking_outcomes"
    id = uuid_pk()
    schedule_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    request_source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    day: Mapped[str | None] = mapped_column(String(24))
    start_period: Mapped[int | None] = mapped_column(Integer)
    end_period: Mapped[int | None] = mapped_column(Integer)
    room_source_id: Mapped[str | None] = mapped_column(String(160))
    reason: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (ForeignKeyConstraint(["schedule_id", "dataset_id"], ["schedules.id", "schedules.dataset_id"], ondelete="CASCADE"), ForeignKeyConstraint(["dataset_id", "request_source_id"], ["booking_requests.dataset_id", "booking_requests.source_id"], ondelete="CASCADE"), ForeignKeyConstraint(["dataset_id", "room_source_id"], ["rooms.dataset_id", "rooms.source_id"]), UniqueConstraint("schedule_id", "request_source_id", name="uq_booking_outcomes_schedule_request"), CheckConstraint("status IN ('approved','rejected','alternative_offered')", name="ck_booking_outcome_status"), Index("ix_booking_outcomes_schedule_status", "schedule_id", "status"))
    schedule: Mapped[Schedule] = relationship(back_populates="booking_outcomes", primaryjoin=lambda: and_(Schedule.dataset_id == BookingOutcome.dataset_id, Schedule.id == foreign(BookingOutcome.schedule_id)))
    request: Mapped[BookingRequest] = relationship(back_populates="outcomes", primaryjoin=lambda: and_(BookingRequest.dataset_id == BookingOutcome.dataset_id, BookingRequest.source_id == foreign(BookingOutcome.request_source_id)))


class Examination(Base):
    __tablename__ = "examinations"
    id = uuid_pk()
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    course_ids: Mapped[list[str]] = json_column()
    group_ids: Mapped[list[str]] = json_column()
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    __table_args__ = (ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"), UniqueConstraint("dataset_id", "source_id", name="uq_examinations_dataset_source"), Index("ix_examinations_dataset", "dataset_id"))
    dataset: Mapped[Dataset] = relationship(back_populates="examinations")
    allocations: Mapped[list[ExamRoomAllocation]] = relationship(back_populates="examination", viewonly=True)


class ExamRoomAllocation(Base):
    __tablename__ = "exam_room_allocations"
    id = uuid_pk()
    schedule_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    examination_source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    room_source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    day: Mapped[str] = mapped_column(String(24), nullable=False)
    session: Mapped[str] = mapped_column(String(24), nullable=False)
    __table_args__ = (ForeignKeyConstraint(["schedule_id", "dataset_id"], ["schedules.id", "schedules.dataset_id"], ondelete="CASCADE"), ForeignKeyConstraint(["dataset_id", "examination_source_id"], ["examinations.dataset_id", "examinations.source_id"], ondelete="CASCADE"), ForeignKeyConstraint(["dataset_id", "room_source_id"], ["rooms.dataset_id", "rooms.source_id"]), UniqueConstraint("schedule_id", "examination_source_id", "room_source_id", name="uq_exam_room_allocation"), Index("ix_exam_allocations_schedule_time", "schedule_id", "day", "session"))
    schedule: Mapped[Schedule] = relationship(back_populates="exam_allocations", primaryjoin=lambda: and_(Schedule.dataset_id == ExamRoomAllocation.dataset_id, Schedule.id == foreign(ExamRoomAllocation.schedule_id)))
    examination: Mapped[Examination] = relationship(back_populates="allocations", primaryjoin=lambda: and_(Examination.dataset_id == ExamRoomAllocation.dataset_id, Examination.source_id == foreign(ExamRoomAllocation.examination_source_id)))
    room: Mapped[Room] = relationship(primaryjoin=lambda: and_(Room.dataset_id == ExamRoomAllocation.dataset_id, Room.source_id == foreign(ExamRoomAllocation.room_source_id)))


class ScheduleOverride(Base):
    __tablename__ = "schedule_overrides"
    id = uuid_pk()
    schedule_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    session_source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    day: Mapped[str] = mapped_column(String(24), nullable=False)
    start_period: Mapped[int] = mapped_column(Integer, nullable=False)
    room_source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    displaced_by: Mapped[str | None] = mapped_column(String(160))
    __table_args__ = (ForeignKeyConstraint(["schedule_id", "dataset_id"], ["schedules.id", "schedules.dataset_id"], ondelete="CASCADE"), ForeignKeyConstraint(["dataset_id", "session_source_id"], ["timetable_sessions.dataset_id", "timetable_sessions.source_id"], ondelete="CASCADE"), ForeignKeyConstraint(["dataset_id", "room_source_id"], ["rooms.dataset_id", "rooms.source_id"]), Index("ix_schedule_overrides_schedule", "schedule_id"))
    schedule: Mapped[Schedule] = relationship(back_populates="overrides", primaryjoin=lambda: and_(Schedule.dataset_id == ScheduleOverride.dataset_id, Schedule.id == foreign(ScheduleOverride.schedule_id)))
    session: Mapped[TimetableSession] = relationship(primaryjoin=lambda: and_(TimetableSession.dataset_id == ScheduleOverride.dataset_id, TimetableSession.source_id == foreign(ScheduleOverride.session_source_id)))


class ScheduleRepairProposal(Base):
    """Persisted, reviewable timetable repair candidate separate from its baseline."""

    __tablename__ = "schedule_repair_proposals"
    id = uuid_pk()
    dataset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    baseline_schedule_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    approved_schedule_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True))
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="proposed")
    input_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    changes: Mapped[list[dict[str, Any]]] = json_column()
    assignments: Mapped[list[dict[str, Any]]] = json_column()
    exam_allocations: Mapped[list[dict[str, Any]]] = json_column()
    affected_session_ids: Mapped[list[str]] = json_column()
    changed_session_ids: Mapped[list[str]] = json_column()
    objective: Mapped[dict[str, Any]] = json_column()
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["baseline_schedule_id", "dataset_id"], ["schedules.id", "schedules.dataset_id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["approved_schedule_id", "dataset_id"], ["schedules.id", "schedules.dataset_id"]),
        CheckConstraint("status IN ('proposed', 'approved', 'rejected')", name="ck_repair_proposal_status"),
        Index("ix_repair_proposals_dataset_created", "dataset_id", "created_at"),
        Index("ix_repair_proposals_baseline_status", "baseline_schedule_id", "status"),
    )
    dataset: Mapped[Dataset] = relationship(back_populates="repair_proposals", foreign_keys=[dataset_id])

