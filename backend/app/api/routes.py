from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from collections.abc import Generator
from tempfile import TemporaryDirectory
from uuid import UUID
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.database.session import SessionLocal
from app.models import (
    BookingOutcome, BookingRequest, Cancellation, Course, Dataset,
    ExamRoomAllocation, Examination, Faculty, Room, RoomUnavailability,
    Schedule, ScheduleRepairProposal, ScheduleSessionAssignment, StudentGroup,
    TimetableSession,
)
from app.models.entities import session_groups
from app.services.bookings.engine import run_booking_engine
from app.services.datasets.importer import DatasetImportError, import_dataset, load_dataset, validate as validate_dataset
from app.services.ai.disruption_parser import parse_disruption_request
from app.services.ai.booking_parser import parse_booking_request
from app.services.ai.schemas import AssistantRequest, AssistantResponse, DisruptionRequest
from app.services.disruptions.repair import (
    RepairError,
    RepairInfeasibleError,
    RepairTimeoutError,
    approve_repair_proposal,
    create_repair_proposal,
    get_repair_proposal,
    list_repair_proposals,
    reject_repair_proposal,
)
from app.services.timetable.solver import (
    InfeasibleTimetableError,
    TimetableSolveError,
    TimetableTimeoutError,
    export_schedule,
    generate_schedule,
    get_schedule_assignments,
)
from app.schemas.api import (
    BookingOutcomeResponse,
    BookingRunResponse,
    DatasetDetailResponse,
    DatasetImportResponse,
    DatasetSummaryResponse,
    ErrorResponse,
    HealthResponse,
    ScheduleAssignmentsResponse,
    ScheduleExportResponse,
    TimetableGenerateResponse,
    RepairProposalRequest,
    RepairProposalResponse,
    RepairRejectRequest,
    AssistantRepairRequest,
    AssistantRepairResponse,
    BookingRequestCreate,
    BookingRequestRecordResponse,
    DashboardSummaryResponse,
    DatasetStatsResponse,
    ExaminationRecordResponse,
    ExaminationsResponse,
    RoomRecordResponse,
    ScheduleDetailResponse,
    ScheduleSummaryResponse,
)

router = APIRouter()
DATA_ROOT = (Path(__file__).resolve().parents[3] / "data").resolve()
TEACHING_USES = {"lecture", "tutorial", "lab"}
UTILISATION_DEFINITION = "Scheduled teaching period-hours divided by teaching period-hours available across rooms that allow teaching; periods marked unavailable are excluded."


def _approved_removed_sessions(db: Session, dataset_id: UUID) -> set[str]:
    changes = db.scalars(select(ScheduleRepairProposal.changes).where(
        ScheduleRepairProposal.dataset_id == dataset_id,
        ScheduleRepairProposal.status == "approved",
    )).all()
    return {
        change["session_id"]
        for change_list in changes
        for change in (change_list or [])
        if change.get("type") == "remove_session"
    }


def _schedule_summary(db: Session, dataset_id: UUID, schedule: Schedule) -> dict:
    removed = _approved_removed_sessions(db, dataset_id)
    active_sessions = select(func.count()).select_from(TimetableSession).where(TimetableSession.dataset_id == dataset_id)
    if removed:
        active_sessions = active_sessions.where(TimetableSession.source_id.not_in(removed))
    total_sessions = select(func.count()).select_from(TimetableSession).where(TimetableSession.dataset_id == dataset_id)
    assignments = select(func.count()).select_from(ScheduleSessionAssignment).where(
        ScheduleSessionAssignment.dataset_id == dataset_id,
        ScheduleSessionAssignment.schedule_id == schedule.id,
    )
    active_assignments = select(func.count()).select_from(ScheduleSessionAssignment).join(
        TimetableSession,
        (TimetableSession.dataset_id == ScheduleSessionAssignment.dataset_id)
        & (TimetableSession.source_id == ScheduleSessionAssignment.session_source_id),
    ).where(
        ScheduleSessionAssignment.dataset_id == dataset_id,
        ScheduleSessionAssignment.schedule_id == schedule.id,
        TimetableSession.source_id.not_in(removed) if removed else True,
    )
    examinations = select(func.count()).select_from(Examination).where(Examination.dataset_id == dataset_id)
    allocated_examinations = select(func.count(func.distinct(ExamRoomAllocation.examination_source_id))).where(
        ExamRoomAllocation.dataset_id == dataset_id,
        ExamRoomAllocation.schedule_id == schedule.id,
    )
    counts = db.execute(select(
        active_sessions.scalar_subquery(), total_sessions.scalar_subquery(),
        assignments.scalar_subquery(), active_assignments.scalar_subquery(),
        examinations.scalar_subquery(), allocated_examinations.scalar_subquery(),
    )).one()
    active_count, total_session_count, assignment_count, active_assignment_count, exam_count, allocated_exam_count = counts
    active_count = active_count or 0
    total_session_count = total_session_count or 0
    assignment_count = assignment_count or 0
    active_assignment_count = active_assignment_count or 0
    exam_count = exam_count or 0
    allocated_exam_count = allocated_exam_count or 0
    historical_complete = active_assignment_count == active_count or assignment_count == total_session_count
    return {
        "schedule_id": schedule.id,
        "source_id": schedule.source_id,
        "team": schedule.team,
        "created_at": schedule.created_at,
        "status": "complete" if historical_complete and allocated_exam_count == exam_count else "incomplete",
        "assignment_count": assignment_count,
        "examination_count": allocated_exam_count,
    }


def _room_utilisation(db: Session, dataset_id: UUID, schedule_id: UUID | None) -> float | None:
    if schedule_id is None:
        return None
    dataset = db.get(Dataset, dataset_id)
    calendar = (dataset.calendar or {}) if dataset else {}
    days = list(calendar.get("days") or [])
    periods = [int(row["id"]) for row in calendar.get("periods", []) if row.get("teaching")]
    if not days or not periods:
        return None
    room_rows = db.execute(select(Room.source_id, Room.allowed_uses).where(Room.dataset_id == dataset_id)).all()
    teaching_room_ids = {source_id for source_id, uses in room_rows if TEACHING_USES.intersection(uses or [])}
    if not teaching_room_ids:
        return None
    unavailable: dict[str, set[tuple[str, int]]] = {}
    for row in db.scalars(select(RoomUnavailability).where(RoomUnavailability.dataset_id == dataset_id)):
        unavailable.setdefault(row.room_source_id, set()).update((row.day, int(period)) for period in row.periods or [])
    available_periods = sum(
        sum((day, period) not in unavailable.get(room_id, set()) for day in days for period in periods)
        for room_id in teaching_room_ids
    )
    used = db.scalar(select(func.coalesce(func.sum(TimetableSession.duration), 0))
        .select_from(ScheduleSessionAssignment)
        .join(TimetableSession, (TimetableSession.dataset_id == ScheduleSessionAssignment.dataset_id)
              & (TimetableSession.source_id == ScheduleSessionAssignment.session_source_id))
        .where(
        ScheduleSessionAssignment.dataset_id == dataset_id,
        ScheduleSessionAssignment.schedule_id == schedule_id,
        ScheduleSessionAssignment.room_source_id.in_(teaching_room_ids),
    )) or 0
    return round((used / available_periods) * 100, 1) if available_periods else None


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as db:
        try:
            yield db
            if db.in_transaction():
                db.commit()
        except Exception:
            db.rollback()
            raise


class DatasetImportRequest(BaseModel):
    path: str = Field(default="cit_public.json", description="A dataset JSON file or directory, relative to the repository data/ directory")
    replace_existing: bool = Field(default=False, description="Explicitly allow re-import to update a dataset with this source ID")


class TimetableGenerateRequest(BaseModel):
    team: str = Field(default="AXIOM", min_length=1, max_length=255)
    time_limit_seconds: float = Field(default=120, ge=1, le=600)
    warm_start_schedule_id: UUID | None = Field(default=None, description="Optional complete schedule in this dataset to seed CP-SAT search")


@router.get("/health", tags=["system"], response_model=HealthResponse)
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "axiom-api"}


@router.get("/ready", tags=["system"])
def readiness_check(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ready", "database": "available"}


@router.post(
    "/datasets/import",
    tags=["datasets"],
    response_model=DatasetImportResponse,
    responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def import_dataset_endpoint(body: DatasetImportRequest, db: Session = Depends(get_db)):
    requested = (DATA_ROOT / body.path).resolve()
    if requested != DATA_ROOT and DATA_ROOT not in requested.parents:
        raise HTTPException(status_code=400, detail="Dataset path must be inside the configured data directory")
    if not requested.exists():
        raise HTTPException(status_code=404, detail=f"Dataset source not found: {body.path}")
    try:
        payload = load_dataset(requested)
        validate_dataset(payload)
        existing = db.scalar(select(Dataset.id).where(Dataset.source_dataset_id == payload["dataset_id"]))
        db.commit()
        if existing is not None and not body.replace_existing:
            raise HTTPException(status_code=409, detail={
                "message": "A dataset with this source ID is already imported; confirm replacement to update it.",
                "source_dataset_id": payload["dataset_id"],
                "dataset_id": str(existing),
                "replace_existing_required": True,
            })
        return import_dataset(db, requested)
    except DatasetImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/datasets/import/upload",
    tags=["datasets"],
    response_model=DatasetImportResponse,
    responses={400: {"model": ErrorResponse}, 409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def upload_dataset_endpoint(
    files: list[UploadFile] = File(..., description="One dataset JSON and optional source CSV files"),
    replace_existing: bool = Form(default=False),
    db: Session = Depends(get_db),
):
    """Import one uploaded dataset JSON and optional CSV supplements safely."""
    if not files or len(files) > 100:
        raise HTTPException(status_code=400, detail="Upload between 1 and 100 JSON/CSV files")
    names = []
    total_bytes = 0
    with TemporaryDirectory(prefix="axiom-dataset-") as temp_dir:
        root = Path(temp_dir)
        for uploaded in files:
            raw_name = (uploaded.filename or "").replace("\\", "/")
            name = PurePosixPath(raw_name)
            if not raw_name or name.is_absolute() or any(part in {"..", ""} for part in name.parts):
                raise HTTPException(status_code=400, detail="Uploaded file names must be relative and cannot contain parent paths")
            suffix = name.suffix.lower()
            if suffix not in {".json", ".csv"}:
                raise HTTPException(status_code=400, detail=f"Unsupported uploaded file type: {suffix or '(none)'}")
            filename = name.name
            destination = root / filename if suffix == ".json" else root / "csv" / filename
            if filename.casefold() in names:
                raise HTTPException(status_code=400, detail=f"Duplicate uploaded filename: {filename}")
            names.append(filename.casefold())
            payload = uploaded.file.read(25 * 1024 * 1024 + 1)
            total_bytes += len(payload)
            if len(payload) > 25 * 1024 * 1024 or total_bytes > 25 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="Dataset upload exceeds the 25 MB limit")
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(payload)
        json_files = list(root.glob("*.json"))
        if len(json_files) != 1:
            raise HTTPException(status_code=422, detail=f"Upload exactly one dataset JSON file; found {len(json_files)}")
        try:
            payload = load_dataset(json_files[0])
            validate_dataset(payload)
            existing = db.scalar(select(Dataset.id).where(Dataset.source_dataset_id == payload["dataset_id"]))
            db.commit()
            if existing is not None and not replace_existing:
                raise HTTPException(status_code=409, detail={
                    "message": "A dataset with this source ID is already imported; confirm replacement to update it.",
                    "source_dataset_id": payload["dataset_id"],
                    "dataset_id": str(existing),
                    "replace_existing_required": True,
                })
            return import_dataset(db, json_files[0])
        except DatasetImportError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/datasets", tags=["datasets"], response_model=list[DatasetSummaryResponse])
def list_datasets(db: Session = Depends(get_db)):
    rows = db.scalars(select(Dataset).order_by(Dataset.source_dataset_id)).all()
    return [{"id": str(row.id), "source_dataset_id": row.source_dataset_id, "institute": row.institute, "created_at": row.created_at} for row in rows]


@router.get("/datasets/{dataset_id}", tags=["datasets"], response_model=DatasetDetailResponse, responses={404: {"model": ErrorResponse}})
def get_dataset(dataset_id: UUID, db: Session = Depends(get_db)):
    row = db.get(Dataset, dataset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"id": str(row.id), "source_dataset_id": row.source_dataset_id, "institute": row.institute, "calendar": row.calendar, "priority_order": row.priority_order, "role_category_cap": row.role_category_cap}


@router.get("/datasets/{dataset_id}/summary", tags=["datasets"], response_model=DashboardSummaryResponse)
def get_dataset_dashboard_summary(dataset_id: UUID, db: Session = Depends(get_db)):
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    count_models = {
        "faculty": Faculty, "student_groups": StudentGroup, "courses": Course,
        "rooms": Room, "timetable_sessions": TimetableSession,
        "examinations": Examination, "booking_requests": BookingRequest,
    }
    count_columns = [
        select(func.count()).select_from(model).where(model.dataset_id == dataset_id).scalar_subquery().label(key)
        for key, model in count_models.items()
    ]
    schedule_count_column = select(func.count()).select_from(Schedule).where(Schedule.dataset_id == dataset_id).scalar_subquery().label("_schedule_count")
    count_row = db.execute(select(*count_columns, schedule_count_column)).one()._mapping
    counts = {key: int(count_row[key] or 0) for key in count_models}
    schedule_count = int(count_row["_schedule_count"] or 0)
    latest_schedule = db.scalar(select(Schedule).where(Schedule.dataset_id == dataset_id).order_by(Schedule.created_at.desc(), Schedule.id.desc()).limit(1))
    latest = _schedule_summary(db, dataset_id, latest_schedule) if latest_schedule else None
    request_count = counts["booking_requests"]
    booking_counts = {"approved": 0, "rejected": 0, "alternative_offered": 0, "pending": request_count}
    if latest_schedule:
        outcome_counts = db.execute(select(
            BookingOutcome.status, func.count(),
        ).where(
            BookingOutcome.dataset_id == dataset_id,
            BookingOutcome.schedule_id == latest_schedule.id,
        ).group_by(BookingOutcome.status)).all()
        outcome_total = 0
        for status, count in outcome_counts:
            booking_counts[status] = count
            outcome_total += count
        booking_counts["pending"] = max(0, request_count - outcome_total)
    upcoming: list[dict] = []
    if latest_schedule and latest and latest["status"] == "complete":
        rows = db.execute(
            select(
                TimetableSession.source_id, TimetableSession.course_source_id,
                Course.title, Faculty.name, Room.source_id, Room.name,
                ScheduleSessionAssignment.day, ScheduleSessionAssignment.start_period,
                (ScheduleSessionAssignment.start_period + TimetableSession.duration - 1).label("end_period"),
            )
            .join(TimetableSession, (TimetableSession.dataset_id == ScheduleSessionAssignment.dataset_id)
                  & (TimetableSession.source_id == ScheduleSessionAssignment.session_source_id))
            .outerjoin(Course, (Course.dataset_id == TimetableSession.dataset_id)
                       & (Course.source_id == TimetableSession.course_source_id))
            .outerjoin(Faculty, (Faculty.dataset_id == TimetableSession.dataset_id)
                       & (Faculty.source_id == TimetableSession.faculty_source_id))
            .outerjoin(Room, (Room.dataset_id == ScheduleSessionAssignment.dataset_id)
                       & (Room.source_id == ScheduleSessionAssignment.room_source_id))
            .where(
                ScheduleSessionAssignment.dataset_id == dataset_id,
                ScheduleSessionAssignment.schedule_id == latest_schedule.id,
            )
            .order_by(ScheduleSessionAssignment.day, ScheduleSessionAssignment.start_period, ScheduleSessionAssignment.session_source_id)
            .limit(8)
        ).all()
        upcoming = [{
            "session_id": row[0], "course_id": row[1], "course_name": row[2] or row[1],
            "faculty_name": row[3] or "", "room_id": row[4] or "", "room_name": row[5] or row[4] or "",
            "day": row[6], "start_period": row[7], "end_period": row[8],
        } for row in rows]
    proposals = db.scalars(select(ScheduleRepairProposal).where(
        ScheduleRepairProposal.dataset_id == dataset_id,
    ).order_by(ScheduleRepairProposal.created_at.desc()).limit(5)).all()
    return {
        "dataset_id": dataset.id,
        "source_dataset_id": dataset.source_dataset_id,
        "institute": dataset.institute,
        "counts": counts,
        "schedule_count": schedule_count,
        "latest_schedule": latest,
        "booking_counts": booking_counts,
        "room_utilisation_percent": _room_utilisation(db, dataset_id, latest_schedule.id if latest_schedule else None),
        "room_utilisation_definition": UTILISATION_DEFINITION,
        "upcoming_sessions": upcoming,
        "recent_repair_proposals": [{
            "proposal_id": proposal.id, "status": proposal.status,
            "created_at": proposal.created_at, "explanation": proposal.explanation,
        } for proposal in proposals],
    }


def _list_schedules(db: Session, dataset_id: UUID) -> list[dict]:
    if db.get(Dataset, dataset_id) is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    removed = _approved_removed_sessions(db, dataset_id)
    active_sessions = select(func.count()).select_from(TimetableSession).where(TimetableSession.dataset_id == dataset_id)
    if removed:
        active_sessions = active_sessions.where(TimetableSession.source_id.not_in(removed))
    total_sessions = select(func.count()).select_from(TimetableSession).where(TimetableSession.dataset_id == dataset_id)
    examination_count = select(func.count()).select_from(Examination).where(Examination.dataset_id == dataset_id)

    assignment_counts = select(
        ScheduleSessionAssignment.schedule_id.label("schedule_id"),
        func.count().label("assignment_count"),
    ).where(ScheduleSessionAssignment.dataset_id == dataset_id).group_by(ScheduleSessionAssignment.schedule_id).subquery()
    active_assignment_counts = select(
        ScheduleSessionAssignment.schedule_id.label("schedule_id"),
        func.count().label("active_assignment_count"),
    ).join(TimetableSession, (TimetableSession.dataset_id == ScheduleSessionAssignment.dataset_id)
           & (TimetableSession.source_id == ScheduleSessionAssignment.session_source_id)).where(
        ScheduleSessionAssignment.dataset_id == dataset_id,
        TimetableSession.source_id.not_in(removed) if removed else True,
    ).group_by(ScheduleSessionAssignment.schedule_id).subquery()
    allocated_exam_counts = select(
        ExamRoomAllocation.schedule_id.label("schedule_id"),
        func.count(func.distinct(ExamRoomAllocation.examination_source_id)).label("exam_count"),
    ).where(ExamRoomAllocation.dataset_id == dataset_id).group_by(ExamRoomAllocation.schedule_id).subquery()

    rows = db.execute(
        select(
            Schedule,
            func.coalesce(assignment_counts.c.assignment_count, 0),
            func.coalesce(active_assignment_counts.c.active_assignment_count, 0),
            func.coalesce(allocated_exam_counts.c.exam_count, 0),
            active_sessions.scalar_subquery(),
            total_sessions.scalar_subquery(),
            examination_count.scalar_subquery(),
        )
        .outerjoin(assignment_counts, assignment_counts.c.schedule_id == Schedule.id)
        .outerjoin(active_assignment_counts, active_assignment_counts.c.schedule_id == Schedule.id)
        .outerjoin(allocated_exam_counts, allocated_exam_counts.c.schedule_id == Schedule.id)
        .where(Schedule.dataset_id == dataset_id)
        .order_by(Schedule.created_at.desc(), Schedule.id.desc())
    ).all()
    summaries = []
    for schedule, assignment_count, active_assignment_count, allocated_exam_count, active_count, total_count, exam_count in rows:
        historical_complete = active_assignment_count == active_count or assignment_count == total_count
        summaries.append({
            "schedule_id": schedule.id,
            "source_id": schedule.source_id,
            "team": schedule.team,
            "created_at": schedule.created_at,
            "status": "complete" if historical_complete and allocated_exam_count == exam_count else "incomplete",
            "assignment_count": assignment_count,
            "examination_count": allocated_exam_count,
        })
    return summaries


@router.get("/datasets/{dataset_id}/schedules", tags=["timetables"], response_model=list[ScheduleSummaryResponse])
def list_schedules_endpoint(dataset_id: UUID, db: Session = Depends(get_db)):
    return _list_schedules(db, dataset_id)


@router.get("/datasets/{dataset_id}/schedule-history", tags=["timetables"], response_model=list[ScheduleSummaryResponse])
def list_schedule_history_endpoint(dataset_id: UUID, db: Session = Depends(get_db)):
    return _list_schedules(db, dataset_id)


@router.get("/datasets/{dataset_id}/schedules/{schedule_id}", tags=["timetables"], response_model=ScheduleDetailResponse)
def get_schedule_detail_endpoint(dataset_id: UUID, schedule_id: UUID, db: Session = Depends(get_db)):
    schedule = db.scalar(select(Schedule).where(Schedule.id == schedule_id, Schedule.dataset_id == dataset_id))
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found for dataset")
    return {**_schedule_summary(db, dataset_id, schedule), "dataset_id": dataset_id}


@router.get("/datasets/{dataset_id}/rooms", tags=["venues"], response_model=list[RoomRecordResponse])
def list_rooms_endpoint(
    dataset_id: UUID,
    schedule_id: UUID | None = None,
    room_type: str | None = None,
    min_capacity: int | None = Query(default=None, ge=0),
    accessible: bool | None = None,
    day: str | None = None,
    period: int | None = Query(default=None, ge=1),
    available_only: bool = False,
    db: Session = Depends(get_db),
):
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if (day is None) != (period is None):
        raise HTTPException(status_code=422, detail="day and period must be provided together for an availability check")
    if available_only and day is None:
        raise HTTPException(status_code=422, detail="available_only requires a day and period")
    calendar = dataset.calendar or {}
    teaching_days = set(calendar.get("days") or [])
    teaching_periods = {int(item["id"]) for item in calendar.get("periods", []) if item.get("teaching")}
    if day is not None and (day not in teaching_days or period not in teaching_periods):
        raise HTTPException(status_code=422, detail="Availability query must use a teaching day and period in this dataset")
    if schedule_id is not None and db.scalar(select(Schedule.id).where(Schedule.id == schedule_id, Schedule.dataset_id == dataset_id)) is None:
        raise HTTPException(status_code=404, detail="Schedule not found for dataset")
    rooms = db.scalars(select(Room).where(Room.dataset_id == dataset_id).order_by(Room.name, Room.source_id)).all()
    unavailability_rows = db.scalars(select(RoomUnavailability).where(RoomUnavailability.dataset_id == dataset_id)).all()
    unavailable: dict[str, set[tuple[str, int]]] = {}
    for row in unavailability_rows:
        unavailable.setdefault(row.room_source_id, set()).update((row.day, int(item)) for item in row.periods or [])
    busy: dict[str, set[tuple[str, int]]] = {}
    scheduled_periods: dict[str, int] = {}
    if schedule_id is not None:
        assignments = db.execute(
            select(
                ScheduleSessionAssignment.room_source_id,
                ScheduleSessionAssignment.day,
                ScheduleSessionAssignment.start_period,
                TimetableSession.duration,
            )
            .select_from(ScheduleSessionAssignment)
            .join(TimetableSession, (TimetableSession.dataset_id == ScheduleSessionAssignment.dataset_id)
                  & (TimetableSession.source_id == ScheduleSessionAssignment.session_source_id))
            .where(
                ScheduleSessionAssignment.dataset_id == dataset_id,
                ScheduleSessionAssignment.schedule_id == schedule_id,
            )
        ).all()
        for room_source_id, assignment_day, start_period, duration in assignments:
            slots = {(assignment_day, p) for p in range(start_period, start_period + duration)}
            busy.setdefault(room_source_id, set()).update(slots)
            scheduled_periods[room_source_id] = scheduled_periods.get(room_source_id, 0) + duration
    result = []
    for room in rooms:
        if room_type and room.type != room_type:
            continue
        if min_capacity is not None and room.capacity < min_capacity:
            continue
        if accessible is not None and room.accessible != accessible:
            continue
        room_unavailable = unavailable.get(room.source_id, set())
        if day is not None and period is not None:
            slot = (day, period)
            availability = "unavailable" if slot in room_unavailable else "occupied" if slot in busy.get(room.source_id, set()) else "available"
        else:
            availability = "not_checked"
        if available_only and availability != "available":
            continue
        room_periods = sum((candidate_day, candidate_period) not in room_unavailable for candidate_day in teaching_days for candidate_period in teaching_periods)
        used = scheduled_periods.get(room.source_id, 0)
        result.append({
            "room_id": room.source_id, "name": room.name, "building": room.building,
            "room_type": room.type, "capacity": room.capacity, "features": room.features or [],
            "accessible": room.accessible, "allowed_uses": room.allowed_uses or [],
            "availability": availability, "scheduled_periods": used,
            "unavailable_periods": len(room_unavailable),
            "utilization_percent": round(used / room_periods * 100, 1) if schedule_id is not None and room_periods else None,
        })
    return result


@router.get("/datasets/{dataset_id}/schedules/{schedule_id}/examinations", tags=["examinations"], response_model=ExaminationsResponse)
def get_examinations_endpoint(dataset_id: UUID, schedule_id: UUID, db: Session = Depends(get_db)):
    if db.scalar(select(Schedule.id).where(Schedule.id == schedule_id, Schedule.dataset_id == dataset_id)) is None:
        raise HTTPException(status_code=404, detail="Schedule not found for dataset")
    exams = db.scalars(select(Examination).where(Examination.dataset_id == dataset_id).order_by(Examination.source_id)).all()
    allocation_rows = db.execute(
        select(ExamRoomAllocation, Room)
        .join(Room, (Room.dataset_id == ExamRoomAllocation.dataset_id)
              & (Room.source_id == ExamRoomAllocation.room_source_id))
        .where(
            ExamRoomAllocation.dataset_id == dataset_id,
            ExamRoomAllocation.schedule_id == schedule_id,
        )
        .order_by(ExamRoomAllocation.examination_source_id, ExamRoomAllocation.room_source_id)
    ).all()
    courses = {row.source_id: row for row in db.scalars(select(Course).where(Course.dataset_id == dataset_id))}
    groups = {row.source_id: row for row in db.scalars(select(StudentGroup).where(StudentGroup.dataset_id == dataset_id))}
    by_exam: dict[str, list[tuple[ExamRoomAllocation, Room]]] = {}
    for allocation, room in allocation_rows:
        by_exam.setdefault(allocation.examination_source_id, []).append((allocation, room))
    items = []
    for exam in exams:
        rows = by_exam.get(exam.source_id, [])
        slots = {(allocation.day, allocation.session) for allocation, _room in rows}
        day, exam_session = next(iter(slots)) if len(slots) == 1 else (None, None)
        allocated_rooms = []
        for _allocation, room in rows:
            allocated_rooms.append({
                "room_id": room.source_id, "name": room.name,
                "capacity": room.capacity, "effective_capacity": room.capacity // 2,
            })
        course_ids = list(exam.course_ids or [])
        group_ids = list(exam.group_ids or [])
        items.append({
            "exam_id": exam.source_id,
            "course_ids": course_ids,
            "course_names": [courses[cid].title if cid in courses else cid for cid in course_ids],
            "group_ids": group_ids,
            "group_names": [groups[gid].name if gid in groups else gid for gid in group_ids],
            "expected_attendance": exam.size,
            "day": day,
            "session": exam_session,
            "rooms": allocated_rooms,
            "effective_allocated_capacity": sum(room["effective_capacity"] for room in allocated_rooms),
        })
    return {"dataset_id": dataset_id, "schedule_id": schedule_id, "examinations": items}


@router.get("/datasets/{dataset_id}/bookings", tags=["bookings"], response_model=list[BookingRequestRecordResponse])
def list_booking_requests_endpoint(dataset_id: UUID, schedule_id: UUID | None = None, db: Session = Depends(get_db)):
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if schedule_id is not None and db.scalar(select(Schedule.id).where(Schedule.id == schedule_id, Schedule.dataset_id == dataset_id)) is None:
        raise HTTPException(status_code=404, detail="Schedule not found for dataset")
    order = list(dataset.priority_order or [])
    caps = dataset.role_category_cap or {}
    requests = db.scalars(select(BookingRequest).where(BookingRequest.dataset_id == dataset_id).order_by(BookingRequest.submitted_at, BookingRequest.source_id)).all()
    cancellations = set(db.scalars(select(Cancellation.request_source_id).where(Cancellation.dataset_id == dataset_id)).all())
    outcomes = db.scalars(select(BookingOutcome).where(
        BookingOutcome.dataset_id == dataset_id,
        BookingOutcome.schedule_id == schedule_id,
    )).all() if schedule_id is not None else []
    by_request = {row.request_source_id: row for row in outcomes}
    items = []
    for request in requests:
        requested_index = order.index(request.requested_category) if request.requested_category in order else max(0, len(order) - 1)
        cap_index = order.index(caps[request.role]) if caps.get(request.role) in order else max(0, len(order) - 1)
        effective_index = max(requested_index, cap_index)
        category = order[effective_index] if order else request.requested_category
        outcome = by_request.get(request.source_id)
        items.append({
            "request_id": request.source_id, "submitted_at": request.submitted_at,
            "requester": request.requester, "role": request.role, "department": request.department,
            "requested_category": request.requested_category, "effective_category": category,
            "priority_rank": effective_index + 1, "title": request.title,
            "attendance": request.attendance, "duration_periods": request.duration_periods,
            "windows": request.windows or [], "room_types": request.room_types or [],
            "needs": request.needs or [], "requested_room": request.requested_room,
            "mandatory_for_groups": request.mandatory_for_groups or [],
            "cancelled": request.source_id in cancellations,
            "status": outcome.status if outcome else "pending",
            "day": outcome.day if outcome else None, "start_period": outcome.start_period if outcome else None,
            "end_period": outcome.end_period if outcome else None,
            "room_id": outcome.room_source_id if outcome else None, "reason": outcome.reason if outcome else None,
        })
    return items


@router.post("/assistant/bookings/parse", tags=["assistant"], response_model=AssistantResponse)
def parse_booking_endpoint(body: AssistantRequest):
    """Parse a booking request into a review-only structured proposal."""
    return parse_booking_request(body)


@router.post("/datasets/{dataset_id}/booking-requests", tags=["bookings"], response_model=BookingRequestRecordResponse, status_code=201)
def create_booking_request_endpoint(dataset_id: UUID, body: BookingRequestCreate, db: Session = Depends(get_db)):
    with db.begin_nested() if db.in_transaction() else db.begin():
        dataset = db.scalar(select(Dataset).where(Dataset.id == dataset_id).with_for_update())
        if dataset is None:
            raise HTTPException(status_code=404, detail="Dataset not found")
        if body.data.requested_category not in (dataset.priority_order or []):
            raise HTTPException(status_code=422, detail="requested_category must match a category in this dataset")
        source_id = body.source_id or f"web-{uuid4()}"
        duplicate = db.scalar(select(BookingRequest.id).where(BookingRequest.dataset_id == dataset_id, BookingRequest.source_id == source_id))
        if duplicate is not None:
            raise HTTPException(status_code=409, detail=f"Booking request source ID {source_id!r} already exists")
        data = body.data
        request = BookingRequest(
            dataset_id=dataset_id, source_id=source_id, submitted_at=datetime.now(timezone.utc),
            requester=data.requester, role=data.role, department=data.department,
            requested_category=data.requested_category or dataset.priority_order[-1], title=data.title,
            attendance=data.attendance, duration_periods=data.duration_periods,
            windows=[window.model_dump(mode="json") for window in data.windows],
            room_types=data.room_types, needs=data.needs, requested_room=data.requested_room,
            mandatory_for_groups=data.mandatory_for_groups, series_id=data.series_id,
            raw_text=body.raw_text,
        )
        db.add(request)
        db.flush()
        order = list(dataset.priority_order or [])
        cap_index = order.index(dataset.role_category_cap[data.role]) if dataset.role_category_cap.get(data.role) in order else len(order) - 1
        index = max(order.index(request.requested_category), cap_index)
        return {
            "request_id": request.source_id, "submitted_at": request.submitted_at,
            "requester": request.requester, "role": request.role, "department": request.department,
            "requested_category": request.requested_category, "effective_category": order[index], "priority_rank": index + 1,
            "title": request.title, "attendance": request.attendance, "duration_periods": request.duration_periods,
            "windows": request.windows, "room_types": request.room_types, "needs": request.needs,
            "requested_room": request.requested_room, "mandatory_for_groups": request.mandatory_for_groups,
            "cancelled": False, "status": "pending", "day": None, "start_period": None,
            "end_period": None, "room_id": None, "reason": None,
        }


@router.post(
    "/datasets/{dataset_id}/schedules/{schedule_id}/bookings/run",
    tags=["bookings"],
    response_model=BookingRunResponse,
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def run_bookings_endpoint(dataset_id: UUID, schedule_id: UUID, db: Session = Depends(get_db)):
    """Run deterministic booking decisions against a schedule in this dataset."""
    try:
        return run_booking_engine(db, dataset_id, schedule_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get(
    "/datasets/{dataset_id}/schedules/{schedule_id}/booking-outcomes",
    tags=["bookings"],
    response_model=list[BookingOutcomeResponse],
    responses={404: {"model": ErrorResponse}},
)
def get_booking_outcomes_endpoint(dataset_id: UUID, schedule_id: UUID, db: Session = Depends(get_db)):
    """Return a decision for each request; requests without outcomes are pending."""
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    schedule = db.scalar(select(Schedule).where(Schedule.id == schedule_id, Schedule.dataset_id == dataset_id))
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found for dataset")

    requests = db.scalars(select(BookingRequest).where(BookingRequest.dataset_id == dataset_id).order_by(BookingRequest.submitted_at, BookingRequest.source_id)).all()
    outcomes = db.scalars(select(BookingOutcome).where(
        BookingOutcome.dataset_id == dataset_id,
        BookingOutcome.schedule_id == schedule_id,
    )).all()
    by_request = {outcome.request_source_id: outcome for outcome in outcomes}
    return [{
        "request_id": request.source_id,
        "status": (outcome.status if (outcome := by_request.get(request.source_id)) else "pending"),
        "day": outcome.day if outcome else None,
        "start_period": outcome.start_period if outcome else None,
        "end_period": outcome.end_period if outcome else None,
        "room_id": outcome.room_source_id if outcome else None,
        "reason": outcome.reason if outcome else None,
    } for request in requests]


@router.post(
    "/datasets/{dataset_id}/schedules/generate",
    tags=["timetables"],
    response_model=TimetableGenerateResponse,
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def generate_timetable_endpoint(dataset_id: UUID, body: TimetableGenerateRequest, db: Session = Depends(get_db)):
    """Generate and persist a complete weekly timetable and exam plan."""
    try:
        result = generate_schedule(
            db,
            dataset_id,
            team=body.team,
            time_limit_seconds=body.time_limit_seconds,
            warm_start_schedule_id=body.warm_start_schedule_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InfeasibleTimetableError as exc:
        raise HTTPException(status_code=422, detail={"status": "infeasible", "reason": str(exc)}) from exc
    except TimetableTimeoutError as exc:
        raise HTTPException(status_code=503, detail={"status": "no_solution_before_timeout", "reason": str(exc)}) from exc
    except TimetableSolveError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "schedule_id": str(result.schedule_id),
        "source_id": result.source_id,
        "dataset_id": str(dataset_id),
        "status": result.status,
        "scheduled_sessions": result.scheduled_sessions,
        "unscheduled_sessions": 0,
        "scheduled_exams": result.scheduled_exams,
        "soft_penalties": result.soft_penalties,
        "soft_total": result.soft_total,
        "exam_soft_penalty": result.exam_soft_penalty,
        "solver_objective": result.solver_objective,
        "best_objective_bound": result.best_objective_bound,
        "solve_time_seconds": result.solve_time_seconds,
    }


@router.post(
    "/assistant/disruptions/parse",
    tags=["assistant"],
    response_model=AssistantResponse,
)
def parse_disruption_endpoint(body: AssistantRequest):
    """Parse English/Hinglish disruption text into a proposal or clarification only."""
    return parse_disruption_request(body)


@router.post(
    "/datasets/{dataset_id}/schedules/{schedule_id}/repair-proposals",
    tags=["disruptions"],
    response_model=RepairProposalResponse,
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def create_repair_proposal_endpoint(dataset_id: UUID, schedule_id: UUID, body: RepairProposalRequest, db: Session = Depends(get_db)):
    try:
        return create_repair_proposal(
            db, dataset_id, schedule_id, DisruptionRequest(changes=body.changes),
            time_limit_seconds=body.time_limit_seconds,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RepairInfeasibleError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RepairTimeoutError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RepairError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/datasets/{dataset_id}/schedules/{schedule_id}/assistant/disruptions/repair-proposals",
    tags=["disruptions"], response_model=AssistantRepairResponse,
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def parse_and_propose_repair_endpoint(
    dataset_id: UUID,
    schedule_id: UUID,
    body: AssistantRepairRequest,
    db: Session = Depends(get_db),
):
    """Interpret a disruption request, then use CP-SAT for a review-only repair proposal."""
    interpretation = parse_disruption_request(body)
    if interpretation.status != "proposal_ready" or interpretation.proposal is None:
        return {"status": interpretation.status, "interpretation": interpretation, "repair": None}
    if interpretation.proposal.type != "disruption":
        return {"status": "unsupported", "interpretation": interpretation, "repair": None}
    try:
        repair = create_repair_proposal(
            db, dataset_id, schedule_id, interpretation.proposal.data,
            time_limit_seconds=body.time_limit_seconds,
        )
        return {"status": "proposal_ready", "interpretation": interpretation, "repair": repair}
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RepairInfeasibleError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RepairTimeoutError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RepairError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/datasets/{dataset_id}/repair-proposals", tags=["disruptions"], response_model=list[RepairProposalResponse], responses={404: {"model": ErrorResponse}})
def list_repair_proposals_endpoint(dataset_id: UUID, db: Session = Depends(get_db)):
    if db.get(Dataset, dataset_id) is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return list_repair_proposals(db, dataset_id)


@router.get(
    "/datasets/{dataset_id}/schedules/{schedule_id}/repair-proposals/{proposal_id}",
    tags=["disruptions"], response_model=RepairProposalResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_repair_proposal_endpoint(dataset_id: UUID, schedule_id: UUID, proposal_id: UUID, db: Session = Depends(get_db)):
    try:
        return get_repair_proposal(db, dataset_id, schedule_id, proposal_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/datasets/{dataset_id}/schedules/{schedule_id}/repair-proposals/{proposal_id}/approve",
    tags=["disruptions"], response_model=RepairProposalResponse,
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def approve_repair_proposal_endpoint(dataset_id: UUID, schedule_id: UUID, proposal_id: UUID, db: Session = Depends(get_db)):
    try:
        return approve_repair_proposal(db, dataset_id, schedule_id, proposal_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RepairError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/datasets/{dataset_id}/schedules/{schedule_id}/repair-proposals/{proposal_id}/reject",
    tags=["disruptions"], response_model=RepairProposalResponse,
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def reject_repair_proposal_endpoint(dataset_id: UUID, schedule_id: UUID, proposal_id: UUID, body: RepairRejectRequest, db: Session = Depends(get_db)):
    try:
        return reject_repair_proposal(db, dataset_id, schedule_id, proposal_id, body.reason)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RepairError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get(
    "/datasets/{dataset_id}/schedules/{schedule_id}/assignments",
    tags=["timetables"],
    response_model=ScheduleAssignmentsResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_timetable_assignments_endpoint(
    dataset_id: UUID,
    schedule_id: UUID,
    day: str | None = None,
    faculty_id: str | None = None,
    room_id: str | None = None,
    course_id: str | None = None,
    group_id: str | None = None,
    db: Session = Depends(get_db),
):
    try:
        return get_schedule_assignments(
            db, dataset_id, schedule_id, day=day, faculty_id=faculty_id,
            room_id=room_id, course_id=course_id, group_id=group_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/datasets/{dataset_id}/schedules/{schedule_id}/export",
    tags=["timetables"],
    response_model=ScheduleExportResponse,
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def export_timetable_endpoint(dataset_id: UUID, schedule_id: UUID, db: Session = Depends(get_db)):
    """Return the schedule.json structure accepted by the official validator."""
    try:
        return export_schedule(db, dataset_id, schedule_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except TimetableSolveError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
