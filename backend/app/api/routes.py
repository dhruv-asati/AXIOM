from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from uuid import UUID
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.database.dependencies import get_db
from app.core.config import settings
from app.api.security import (
    SESSION_COOKIE,
    SESSION_TTL,
    create_session,
    current_user,
    derive_csrf_token,
    enforce_login_rate_limit,
    public_user,
    require_csrf,
    require_dataset_scope,
    require_roles,
    verify_password,
    verify_request_origin,
)
from app.models import (
    AuthSession, BookingClassMoveProposal, BookingOutcome, BookingRequest, Cancellation, Course, Dataset,
    ExamRoomAllocation, Examination, Faculty, Room, RoomUnavailability,
    Schedule, ScheduleRepairProposal, ScheduleSessionAssignment, StudentGroup,
    TimetableSession, User,
)
from app.models.entities import session_groups
from app.services.bookings.engine import run_booking_engine
from app.services.bookings.approval import (
    BookingApprovalError,
    class_move_payload,
    create_class_move_proposal,
    decide_class_move_proposal,
    decide_department_lab_booking,
)
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

public_router = APIRouter()
router = APIRouter(dependencies=[Depends(current_user), Depends(require_csrf), Depends(require_dataset_scope)])
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


class DatasetImportRequest(BaseModel):
    path: str = Field(default="cit_public.json", description="A dataset JSON file or directory, relative to the repository data/ directory")
    replace_existing: bool = Field(default=False, description="Explicitly allow re-import to update a dataset with this source ID")


class TimetableGenerateRequest(BaseModel):
    team: str = Field(default="AXIOM", min_length=1, max_length=255)
    time_limit_seconds: float = Field(default=120, ge=1, le=600)
    warm_start_schedule_id: UUID | None = Field(default=None, description="Optional complete schedule in this dataset to seed CP-SAT search")


class PriorityOrderRequest(BaseModel):
    priority_order: list[str] = Field(min_length=1, max_length=32)


class BookingCancellationRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class DepartmentLabDecisionRequest(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    room_id: str | None = Field(default=None, min_length=1, max_length=160)
    day: str | None = Field(default=None, min_length=1, max_length=24)
    start_period: int | None = Field(default=None, ge=1)
    reason: str | None = Field(default=None, max_length=1000)


class ClassMoveProposalCreate(BaseModel):
    schedule_id: UUID
    room_id: str = Field(min_length=1, max_length=160)
    day: str = Field(min_length=1, max_length=24)
    start_period: int = Field(ge=1)
    time_limit_seconds: float = Field(default=60, ge=1, le=600)


class ApprovalRejectRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class RoomDepartmentRequest(BaseModel):
    department: str | None = Field(default=None, min_length=1, max_length=120)


def _admin_only() -> list:
    return [Depends(require_roles("admin"))]


def _role_access(*roles: str) -> list:
    return [Depends(require_roles(*roles))]


def _assert_change_scope(db: Session, dataset_id: UUID, user: User, changes: list) -> None:
    if user.role == "admin":
        return
    if user.role not in {"department_coordinator", "faculty"}:
        raise HTTPException(status_code=403, detail="This role cannot request timetable changes")
    for change in changes:
        kind = getattr(change, "type", None)
        faculty_id = getattr(change, "faculty_id", None)
        if kind == "faculty_unavailable":
            faculty = db.scalar(select(Faculty).where(Faculty.dataset_id == dataset_id, Faculty.source_id == faculty_id))
            if faculty is None or (user.role == "faculty" and faculty_id != user.faculty_source_id) or (user.role == "department_coordinator" and faculty.department != user.department):
                raise HTTPException(status_code=403, detail="You cannot change availability for this faculty member")
        elif kind == "remove_session":
            session = db.scalar(select(TimetableSession).where(
                TimetableSession.dataset_id == dataset_id,
                TimetableSession.source_id == getattr(change, "session_id", None),
            ))
            course = db.scalar(select(Course).where(
                Course.dataset_id == dataset_id,
                Course.source_id == session.course_source_id if session else "",
            )) if session else None
            if session is None or (user.role == "faculty" and session.faculty_source_id != user.faculty_source_id) or (user.role == "department_coordinator" and (course is None or course.department != user.department)):
                raise HTTPException(status_code=403, detail="You cannot request a change to this session")
        elif kind == "add_session":
            new_session = getattr(change, "session", None)
            if new_session is None or (user.role == "faculty" and new_session.faculty_id != user.faculty_source_id):
                raise HTTPException(status_code=403, detail="You cannot request this additional session")
            faculty = db.scalar(select(Faculty).where(Faculty.dataset_id == dataset_id, Faculty.source_id == new_session.faculty_id))
            course = db.scalar(select(Course).where(Course.dataset_id == dataset_id, Course.source_id == new_session.course_id))
            if faculty is None or course is None or (user.role == "department_coordinator" and (faculty.department != user.department or course.department != user.department)):
                raise HTTPException(status_code=403, detail="Additional sessions must belong to your faculty member or department")
        else:
            raise HTTPException(status_code=403, detail="This role cannot request that type of timetable change")


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=1024)


@public_router.post("/auth/login", tags=["authentication"])
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    verify_request_origin(request)
    enforce_login_rate_limit(request)
    normalized_username = body.username.strip().casefold()
    user = db.scalar(select(User).where(func.lower(User.username) == normalized_username))
    valid = user is not None and user.is_active and verify_password(body.password, user.password_hash)
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token, csrf_token, _session = create_session(db, user)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        secure=settings.environment.lower() == "production",
        samesite="strict",
        path="/",
    )
    return {"user": public_user(user), "csrf_token": csrf_token}


@router.get("/auth/session", tags=["authentication"])
def get_auth_session(request: Request, user: User = Depends(current_user)):
    token = request.cookies.get(SESSION_COOKIE, "")
    return {"user": public_user(user), "csrf_token": derive_csrf_token(token)}


@router.post("/auth/logout", tags=["authentication"], status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db), _user: User = Depends(current_user)):
    session = request.state.auth_session
    session.revoked_at = datetime.now(timezone.utc)
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, secure=settings.environment.lower() == "production", samesite="strict")
    response.status_code = 204
    return response


@public_router.get("/health", tags=["system"], response_model=HealthResponse)
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "axiom-api"}


@public_router.get("/ready", tags=["system"])
def readiness_check(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ready", "database": "available"}


@router.post(
    "/datasets/import",
    tags=["datasets"],
    response_model=DatasetImportResponse,
    dependencies=_admin_only(),
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
    dependencies=_admin_only(),
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
def list_datasets(db: Session = Depends(get_db), user: User = Depends(current_user)):
    statement = select(Dataset).order_by(Dataset.source_dataset_id)
    if user.role != "admin":
        statement = statement.where(Dataset.id == user.dataset_id)
    rows = db.scalars(statement).all()
    return [{"id": str(row.id), "source_dataset_id": row.source_dataset_id, "institute": row.institute, "created_at": row.created_at} for row in rows]


@router.get("/datasets/{dataset_id}", tags=["datasets"], response_model=DatasetDetailResponse, responses={404: {"model": ErrorResponse}})
def get_dataset(dataset_id: UUID, db: Session = Depends(get_db)):
    row = db.get(Dataset, dataset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"id": str(row.id), "source_dataset_id": row.source_dataset_id, "institute": row.institute, "calendar": row.calendar, "priority_order": row.priority_order, "role_category_cap": row.role_category_cap}


@router.put("/datasets/{dataset_id}/priority-order", tags=["datasets"], dependencies=_admin_only())
def update_priority_order(dataset_id: UUID, body: PriorityOrderRequest, db: Session = Depends(get_db)):
    dataset = db.scalar(select(Dataset).where(Dataset.id == dataset_id).with_for_update())
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    current = list(dataset.priority_order or [])
    if len(body.priority_order) != len(set(body.priority_order)) or set(body.priority_order) != set(current):
        raise HTTPException(status_code=422, detail="Priority order must contain every existing category exactly once")
    dataset.priority_order = body.priority_order
    return {"dataset_id": str(dataset.id), "priority_order": dataset.priority_order}


@router.post("/datasets/{dataset_id}/demo-reset", tags=["administration"], dependencies=_admin_only())
def reset_demo_data(dataset_id: UUID, db: Session = Depends(get_db)):
    if db.get(Dataset, dataset_id) is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    demo_schedule_ids = select(Schedule.id).where(
        Schedule.dataset_id == dataset_id,
        Schedule.created_by_user_id.is_not(None),
    )
    # Proposal records that point at demo schedules are transient solver output;
    # source dataset records and imported booking requests remain untouched.
    db.execute(delete(ScheduleRepairProposal).where(
        ScheduleRepairProposal.dataset_id == dataset_id,
        (ScheduleRepairProposal.created_by_user_id.is_not(None)
         | ScheduleRepairProposal.baseline_schedule_id.in_(demo_schedule_ids)
         | ScheduleRepairProposal.approved_schedule_id.in_(demo_schedule_ids)),
    ))
    db.execute(delete(Cancellation).where(
        Cancellation.dataset_id == dataset_id,
        Cancellation.cancelled_by_user_id.is_not(None),
    ))
    db.execute(delete(BookingRequest).where(
        BookingRequest.dataset_id == dataset_id,
        BookingRequest.created_by_user_id.is_not(None),
    ))
    db.execute(delete(BookingOutcome).where(
        BookingOutcome.dataset_id == dataset_id,
        BookingOutcome.decided_by_user_id.is_not(None),
    ))
    db.execute(delete(Schedule).where(
        Schedule.dataset_id == dataset_id,
        Schedule.created_by_user_id.is_not(None),
    ))
    return {"dataset_id": str(dataset_id), "status": "reset", "preserved": ["imported dataset records", "imported booking requests", "legacy schedules"]}


@router.get("/datasets/{dataset_id}/summary", tags=["datasets"], response_model=DashboardSummaryResponse, dependencies=_role_access("admin"))
def get_dataset_dashboard_summary(dataset_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Aggregate dataset metrics are not available for this role")
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


@router.get("/datasets/{dataset_id}/schedules", tags=["timetables"], response_model=list[ScheduleSummaryResponse], dependencies=_role_access("admin", "department_coordinator", "faculty", "club_representative"))
def list_schedules_endpoint(dataset_id: UUID, db: Session = Depends(get_db)):
    return _list_schedules(db, dataset_id)


@router.get("/datasets/{dataset_id}/schedule-history", tags=["timetables"], response_model=list[ScheduleSummaryResponse], dependencies=_role_access("admin"))
def list_schedule_history_endpoint(dataset_id: UUID, db: Session = Depends(get_db)):
    return _list_schedules(db, dataset_id)


@router.get("/datasets/{dataset_id}/schedules/{schedule_id}", tags=["timetables"], response_model=ScheduleDetailResponse, dependencies=_role_access("admin", "department_coordinator", "faculty"))
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
    user: User = Depends(current_user),
):
    if user.role not in {"admin", "department_coordinator", "club_representative"}:
        raise HTTPException(status_code=403, detail="Room inventory is unavailable for this role")
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
            "room_type": room.type, "department": room.department, "capacity": room.capacity, "features": room.features or [],
            "accessible": room.accessible, "allowed_uses": room.allowed_uses or [],
            "availability": availability, "scheduled_periods": used,
            "unavailable_periods": len(room_unavailable),
            "utilization_percent": round(used / room_periods * 100, 1) if schedule_id is not None and room_periods else None,
        })
    return result


@router.put("/datasets/{dataset_id}/rooms/{room_source_id}/department", tags=["venues"], dependencies=_admin_only())
def assign_room_department_endpoint(
    dataset_id: UUID, room_source_id: str, body: RoomDepartmentRequest,
    db: Session = Depends(get_db),
):
    room = db.scalar(select(Room).where(Room.dataset_id == dataset_id, Room.source_id == room_source_id).with_for_update())
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found for dataset")
    department = body.department.strip() if body.department else None
    if department and not any(db.scalar(select(model.id).where(model.dataset_id == dataset_id, model.department == department)) is not None for model in (Faculty, Course, StudentGroup)):
        raise HTTPException(status_code=422, detail="Department must exist in the selected dataset")
    room.department = department
    return {"room_id": room.source_id, "department": room.department}


@router.get("/datasets/{dataset_id}/schedules/{schedule_id}/examinations", tags=["examinations"], response_model=ExaminationsResponse, dependencies=_role_access("admin", "department_coordinator"))
def get_examinations_endpoint(dataset_id: UUID, schedule_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {"admin", "department_coordinator"}:
        raise HTTPException(status_code=403, detail="Examination records are unavailable for this role")
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
    if user.role == "department_coordinator":
        department_course_ids = {source_id for source_id, course in courses.items() if course.department == user.department}
        department_group_ids = {source_id for source_id, group in groups.items() if group.department == user.department}
        exams = [exam for exam in exams if department_course_ids.intersection(exam.course_ids or [])]
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
        if user.role == "department_coordinator":
            course_ids = [source_id for source_id in course_ids if source_id in department_course_ids]
            group_ids = [source_id for source_id in group_ids if source_id in department_group_ids]
        items.append({
            "exam_id": exam.source_id,
            "course_ids": course_ids,
            "course_names": [courses[cid].title if cid in courses else cid for cid in course_ids],
            "group_ids": group_ids,
            "group_names": [groups[gid].name if gid in groups else gid for gid in group_ids],
            "expected_attendance": sum(groups[group_id].size for group_id in group_ids if group_id in groups) if user.role == "department_coordinator" else exam.size,
            "day": day,
            "session": exam_session,
            "rooms": allocated_rooms,
            "effective_allocated_capacity": sum(room["effective_capacity"] for room in allocated_rooms),
        })
    return {"dataset_id": dataset_id, "schedule_id": schedule_id, "examinations": items}


@router.get("/datasets/{dataset_id}/bookings", tags=["bookings"], response_model=list[BookingRequestRecordResponse])
def list_booking_requests_endpoint(dataset_id: UUID, schedule_id: UUID | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if schedule_id is not None and db.scalar(select(Schedule.id).where(Schedule.id == schedule_id, Schedule.dataset_id == dataset_id)) is None:
        raise HTTPException(status_code=404, detail="Schedule not found for dataset")
    order = list(dataset.priority_order or [])
    caps = dataset.role_category_cap or {}
    statement = select(BookingRequest).where(BookingRequest.dataset_id == dataset_id)
    if user.role in {"club_representative", "faculty"}:
        statement = statement.where(BookingRequest.created_by_user_id == user.id)
    elif user.role == "department_coordinator":
        statement = statement.where(BookingRequest.department == user.department)
    requests = db.scalars(statement.order_by(BookingRequest.submitted_at, BookingRequest.source_id)).all()
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
            "created_by_user_id": request.created_by_user_id,
        })
    return items


@router.post("/assistant/bookings/parse", tags=["assistant"], response_model=AssistantResponse, dependencies=_role_access("admin", "department_coordinator", "club_representative"))
def parse_booking_endpoint(body: AssistantRequest, user: User = Depends(current_user)):
    """Parse a booking request into a review-only structured proposal."""
    if user.role not in {"admin", "department_coordinator", "club_representative"}:
        raise HTTPException(status_code=403, detail="This role cannot request a venue booking")
    return parse_booking_request(body)


@router.post("/datasets/{dataset_id}/booking-requests", tags=["bookings"], response_model=BookingRequestRecordResponse, status_code=201, dependencies=_role_access("admin", "department_coordinator", "club_representative"))
def create_booking_request_endpoint(dataset_id: UUID, body: BookingRequestCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {"admin", "department_coordinator", "club_representative"}:
        raise HTTPException(status_code=403, detail="This role cannot request a venue booking")
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
        category = data.requested_category or dataset.priority_order[-1]
        if user.role == "club_representative":
            if category != "club_event":
                raise HTTPException(status_code=403, detail="Club representatives may submit club event requests only")
        elif user.role == "department_coordinator":
            if category != "department_event":
                raise HTTPException(status_code=403, detail="Department coordinators may submit department event requests only")
        elif category not in (dataset.priority_order or []):
            raise HTTPException(status_code=422, detail="requested_category must match a category in this dataset")
        request = BookingRequest(
            dataset_id=dataset_id, source_id=source_id, submitted_at=datetime.now(timezone.utc),
            requester=user.username,
            role="club" if user.role == "club_representative" else user.role,
            department=user.department,
            requested_category=category, title=data.title,
            attendance=data.attendance, duration_periods=data.duration_periods,
            windows=[window.model_dump(mode="json") for window in data.windows],
            room_types=data.room_types, needs=data.needs, requested_room=data.requested_room,
            mandatory_for_groups=data.mandatory_for_groups, series_id=data.series_id,
            created_by_user_id=user.id,
            club_id=user.club_id if user.role == "club_representative" else None,
            raw_text=body.raw_text,
        )
        db.add(request)
        db.flush()
        order = list(dataset.priority_order or [])
        cap_index = order.index(dataset.role_category_cap[request.role]) if dataset.role_category_cap.get(request.role) in order else len(order) - 1
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
            "created_by_user_id": request.created_by_user_id,
        }


@router.post("/datasets/{dataset_id}/bookings/{request_source_id}/cancel", tags=["bookings"], status_code=204, dependencies=_role_access("admin", "club_representative", "department_coordinator"))
def cancel_booking_request(
    dataset_id: UUID,
    request_source_id: str,
    body: BookingCancellationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    request = db.scalar(select(BookingRequest).where(
        BookingRequest.dataset_id == dataset_id,
        BookingRequest.source_id == request_source_id,
    ).with_for_update())
    if request is None:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if user.role != "admin" and request.created_by_user_id != user.id:
        raise HTTPException(status_code=403, detail="You can cancel only your own booking requests")
    if db.scalar(select(BookingOutcome.id).where(
        BookingOutcome.dataset_id == dataset_id,
        BookingOutcome.request_source_id == request_source_id,
        BookingOutcome.status == "approved",
    )) is not None:
        raise HTTPException(status_code=409, detail="An approved booking cannot be cancelled through this endpoint")
    if db.scalar(select(Cancellation.id).where(
        Cancellation.dataset_id == dataset_id,
        Cancellation.request_source_id == request_source_id,
    )) is not None:
        raise HTTPException(status_code=409, detail="Booking request is already cancelled")
    db.add(Cancellation(
        dataset_id=dataset_id,
        request_source_id=request_source_id,
        cancelled_at=datetime.now(timezone.utc),
        by=user.username,
        note=body.reason,
        cancelled_by_user_id=user.id,
    ))
    return Response(status_code=204)


@router.get(
    "/datasets/{dataset_id}/schedules/{schedule_id}/department-lab-bookings",
    tags=["bookings"],
    dependencies=_role_access("department_coordinator"),
)
def list_department_lab_bookings(dataset_id: UUID, schedule_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Pending lab-capable booking requests submitted for the coordinator's department."""
    if db.scalar(select(Schedule.id).where(Schedule.id == schedule_id, Schedule.dataset_id == dataset_id)) is None:
        raise HTTPException(status_code=404, detail="Schedule not found for dataset")
    requests = db.scalars(select(BookingRequest).where(
        BookingRequest.dataset_id == dataset_id,
        BookingRequest.department == user.department,
    ).order_by(BookingRequest.submitted_at, BookingRequest.source_id)).all()
    cancelled = set(db.scalars(select(Cancellation.request_source_id).where(Cancellation.dataset_id == dataset_id)).all())
    department_labs = db.scalars(select(Room).where(
        Room.dataset_id == dataset_id,
        Room.department == user.department,
    )).all()
    eligible_lab_types = {
        row.type.casefold() for row in department_labs
        if "lab" in row.type.casefold() and "event" in (row.allowed_uses or [])
    }
    decided = set(db.scalars(select(BookingOutcome.request_source_id).where(
        BookingOutcome.dataset_id == dataset_id, BookingOutcome.schedule_id == schedule_id,
    )).all())
    approved_anywhere = set(db.scalars(select(BookingOutcome.request_source_id).where(
        BookingOutcome.dataset_id == dataset_id, BookingOutcome.status == "approved",
    )).all())
    return [{
        "request_id": row.source_id,
        "requester": row.requester,
        "title": row.title,
        "department": row.department,
        "attendance": row.attendance,
        "duration_periods": row.duration_periods,
        "windows": row.windows,
        "room_types": row.room_types,
        "needs": row.needs,
        "mandatory_for_groups": row.mandatory_for_groups,
        "created_by_user_id": row.created_by_user_id,
        "status": "pending",
    } for row in requests if row.source_id not in cancelled and row.source_id not in decided and row.source_id not in approved_anywhere and eligible_lab_types.intersection(str(kind).casefold() for kind in (row.room_types or []))]


@router.post(
    "/datasets/{dataset_id}/schedules/{schedule_id}/bookings/{request_source_id}/department-lab-decision",
    tags=["bookings"], dependencies=_role_access("department_coordinator"),
)
def decide_department_lab_booking_endpoint(
    dataset_id: UUID, schedule_id: UUID, request_source_id: str,
    body: DepartmentLabDecisionRequest, db: Session = Depends(get_db), user: User = Depends(current_user),
):
    try:
        return decide_department_lab_booking(
            db, dataset_id=dataset_id, schedule_id=schedule_id,
            request_source_id=request_source_id, coordinator_id=user.id,
            department=user.department or "", room_source_id=body.room_id,
            day=body.day, start_period=body.start_period,
            reject_reason=body.reason.strip() if body.decision == "reject" and body.reason else ("A reason is required." if body.decision == "reject" else None),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except BookingApprovalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/datasets/{dataset_id}/bookings/{request_source_id}/class-move-proposals",
    tags=["bookings"], dependencies=_role_access("admin", "department_coordinator", "club_representative"),
)
def create_booking_class_move_proposal_endpoint(
    dataset_id: UUID, request_source_id: str, body: ClassMoveProposalCreate,
    db: Session = Depends(get_db), user: User = Depends(current_user),
):
    try:
        return create_class_move_proposal(
            db, dataset_id=dataset_id, schedule_id=body.schedule_id,
            request_source_id=request_source_id, room_source_id=body.room_id,
            day=body.day, start_period=body.start_period, created_by_user_id=user.id,
            time_limit_seconds=body.time_limit_seconds,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except BookingApprovalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RepairInfeasibleError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RepairTimeoutError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RepairError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/datasets/{dataset_id}/class-move-proposals", tags=["bookings"], dependencies=_role_access("admin", "department_coordinator", "club_representative"))
def list_booking_class_move_proposals(dataset_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    statement = select(BookingClassMoveProposal).where(BookingClassMoveProposal.dataset_id == dataset_id)
    if user.role != "admin":
        statement = statement.where(BookingClassMoveProposal.created_by_user_id == user.id)
    proposals = db.scalars(statement.order_by(BookingClassMoveProposal.created_at.desc(), BookingClassMoveProposal.id)).all()
    results = []
    for proposal in proposals:
        repair = db.get(ScheduleRepairProposal, proposal.repair_proposal_id)
        if repair is None:
            continue
        result = class_move_payload(proposal, repair)
        result["before"] = [{
            "session_id": row.session_source_id, "day": row.day,
            "start_period": row.start_period, "room_id": row.room_source_id,
        } for row in db.scalars(select(ScheduleSessionAssignment).where(
            ScheduleSessionAssignment.dataset_id == dataset_id,
            ScheduleSessionAssignment.schedule_id == proposal.baseline_schedule_id,
        ).order_by(ScheduleSessionAssignment.session_source_id)).all()]
        request = db.scalar(select(BookingRequest).where(BookingRequest.dataset_id == dataset_id, BookingRequest.source_id == proposal.request_source_id))
        result["request"] = {"title": request.title, "requester": request.requester, "attendance": request.attendance} if request else None
        results.append(result)
    return results


@router.post(
    "/datasets/{dataset_id}/class-move-proposals/{proposal_id}/decision",
    tags=["bookings"], dependencies=_admin_only(),
)
def decide_booking_class_move_endpoint(
    dataset_id: UUID, proposal_id: UUID,
    body: DepartmentLabDecisionRequest, db: Session = Depends(get_db), user: User = Depends(current_user),
):
    try:
        return decide_class_move_proposal(
            db, dataset_id=dataset_id, proposal_id=proposal_id, admin_id=user.id,
            approve=body.decision == "approve", reject_reason=body.reason,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except BookingApprovalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/datasets/{dataset_id}/schedules/{schedule_id}/bookings/run",
    tags=["bookings"],
    response_model=BookingRunResponse,
    dependencies=_admin_only(),
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def run_bookings_endpoint(dataset_id: UUID, schedule_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Run deterministic booking decisions against a schedule in this dataset."""
    try:
        return run_booking_engine(db, dataset_id, schedule_id, initiated_by_user_id=user.id)
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
def get_booking_outcomes_endpoint(dataset_id: UUID, schedule_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Return a decision for each request; requests without outcomes are pending."""
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    schedule = db.scalar(select(Schedule).where(Schedule.id == schedule_id, Schedule.dataset_id == dataset_id))
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found for dataset")

    request_statement = select(BookingRequest).where(BookingRequest.dataset_id == dataset_id)
    if user.role in {"club_representative", "faculty"}:
        request_statement = request_statement.where(BookingRequest.created_by_user_id == user.id)
    elif user.role == "department_coordinator":
        request_statement = request_statement.where(BookingRequest.department == user.department)
    requests = db.scalars(request_statement.order_by(BookingRequest.submitted_at, BookingRequest.source_id)).all()
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
    dependencies=_admin_only(),
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def generate_timetable_endpoint(dataset_id: UUID, body: TimetableGenerateRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Generate and persist a complete weekly timetable and exam plan."""
    try:
        result = generate_schedule(
            db,
            dataset_id,
            team=body.team,
            time_limit_seconds=body.time_limit_seconds,
            warm_start_schedule_id=body.warm_start_schedule_id,
            created_by_user_id=user.id,
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
def parse_disruption_endpoint(body: AssistantRequest, user: User = Depends(current_user)):
    """Parse English/Hinglish disruption text into a proposal or clarification only."""
    if user.role not in {"admin", "department_coordinator", "faculty"}:
        raise HTTPException(status_code=403, detail="This role cannot request schedule changes")
    return parse_disruption_request(body)


@router.post(
    "/datasets/{dataset_id}/schedules/{schedule_id}/repair-proposals",
    tags=["disruptions"],
    response_model=RepairProposalResponse,
    dependencies=_role_access("admin", "department_coordinator", "faculty"),
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def create_repair_proposal_endpoint(dataset_id: UUID, schedule_id: UUID, body: RepairProposalRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    try:
        _assert_change_scope(db, dataset_id, user, body.changes)
        return create_repair_proposal(
            db, dataset_id, schedule_id, DisruptionRequest(changes=body.changes),
            time_limit_seconds=body.time_limit_seconds,
            created_by_user_id=user.id,
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
    dependencies=_role_access("admin", "department_coordinator", "faculty"),
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def parse_and_propose_repair_endpoint(
    dataset_id: UUID,
    schedule_id: UUID,
    body: AssistantRepairRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Interpret a disruption request, then use CP-SAT for a review-only repair proposal."""
    interpretation = parse_disruption_request(body)
    if interpretation.status != "proposal_ready" or interpretation.proposal is None:
        return {"status": interpretation.status, "interpretation": interpretation, "repair": None}
    if interpretation.proposal.type != "disruption":
        return {"status": "unsupported", "interpretation": interpretation, "repair": None}
    try:
        _assert_change_scope(db, dataset_id, user, interpretation.proposal.data.changes)
        repair = create_repair_proposal(
            db, dataset_id, schedule_id, interpretation.proposal.data,
            time_limit_seconds=body.time_limit_seconds,
            created_by_user_id=user.id,
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


@router.get("/datasets/{dataset_id}/repair-proposals", tags=["disruptions"], response_model=list[RepairProposalResponse], responses={404: {"model": ErrorResponse}}, dependencies=_role_access("admin", "department_coordinator", "faculty"))
def list_repair_proposals_endpoint(dataset_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if db.get(Dataset, dataset_id) is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    booking_move_ids = set(db.scalars(select(BookingClassMoveProposal.repair_proposal_id).where(BookingClassMoveProposal.dataset_id == dataset_id)).all())
    proposals = [row for row in list_repair_proposals(db, dataset_id) if row["proposal_id"] not in booking_move_ids]
    if user.role == "admin":
        return proposals
    owned_ids = set(db.scalars(select(ScheduleRepairProposal.id).where(
        ScheduleRepairProposal.dataset_id == dataset_id,
        ScheduleRepairProposal.created_by_user_id == user.id,
    )).all())
    return [proposal for proposal in proposals if proposal["proposal_id"] in owned_ids]


@router.get(
    "/datasets/{dataset_id}/schedules/{schedule_id}/repair-proposals/{proposal_id}",
    tags=["disruptions"], response_model=RepairProposalResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_repair_proposal_endpoint(dataset_id: UUID, schedule_id: UUID, proposal_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    try:
        result = get_repair_proposal(db, dataset_id, schedule_id, proposal_id)
        proposal = db.get(ScheduleRepairProposal, proposal_id)
        if user.role != "admin" and (proposal is None or proposal.created_by_user_id != user.id):
            raise HTTPException(status_code=403, detail="You can view only your own repair proposals")
        if db.scalar(select(BookingClassMoveProposal.id).where(BookingClassMoveProposal.dataset_id == dataset_id, BookingClassMoveProposal.repair_proposal_id == proposal_id)):
            raise HTTPException(status_code=409, detail="This solver proposal belongs to a booking class-move workflow")
        return result
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/datasets/{dataset_id}/schedules/{schedule_id}/repair-proposals/{proposal_id}/approve",
    tags=["disruptions"], response_model=RepairProposalResponse,
    dependencies=_admin_only(),
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def approve_repair_proposal_endpoint(dataset_id: UUID, schedule_id: UUID, proposal_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if db.scalar(select(BookingClassMoveProposal.id).where(BookingClassMoveProposal.dataset_id == dataset_id, BookingClassMoveProposal.repair_proposal_id == proposal_id)):
        raise HTTPException(status_code=409, detail="Use the booking class-move approval workflow for this proposal")
    try:
        return approve_repair_proposal(db, dataset_id, schedule_id, proposal_id, decided_by_user_id=user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RepairError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/datasets/{dataset_id}/schedules/{schedule_id}/repair-proposals/{proposal_id}/reject",
    tags=["disruptions"], response_model=RepairProposalResponse,
    dependencies=_role_access("admin", "department_coordinator", "faculty"),
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def reject_repair_proposal_endpoint(dataset_id: UUID, schedule_id: UUID, proposal_id: UUID, body: RepairRejectRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if db.scalar(select(BookingClassMoveProposal.id).where(BookingClassMoveProposal.dataset_id == dataset_id, BookingClassMoveProposal.repair_proposal_id == proposal_id)):
        raise HTTPException(status_code=409, detail="Use the booking class-move decision workflow for this proposal")
    created_by_user_id = db.scalar(select(ScheduleRepairProposal.created_by_user_id).where(
        ScheduleRepairProposal.id == proposal_id,
        ScheduleRepairProposal.dataset_id == dataset_id,
        ScheduleRepairProposal.baseline_schedule_id == schedule_id,
    ))
    if user.role != "admin" and created_by_user_id != user.id:
        raise HTTPException(status_code=403, detail="You can reject only your own repair proposals")
    try:
        return reject_repair_proposal(db, dataset_id, schedule_id, proposal_id, body.reason, decided_by_user_id=user.id)
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
    user: User = Depends(current_user),
):
    if user.role == "club_representative":
        raise HTTPException(status_code=403, detail="Timetable assignments are unavailable for this role")
    if user.role == "faculty":
        if faculty_id is not None and faculty_id != user.faculty_source_id:
            raise HTTPException(status_code=403, detail="Faculty can view only their own timetable")
        faculty_id = user.faculty_source_id
    try:
        result = get_schedule_assignments(
            db, dataset_id, schedule_id, day=day, faculty_id=faculty_id,
            room_id=room_id, course_id=course_id, group_id=group_id,
        )
        if user.role == "department_coordinator":
            result["assignments"] = [row for row in result["assignments"] if row["department"] == user.department]
        return result
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/datasets/{dataset_id}/schedules/{schedule_id}/export",
    tags=["timetables"],
    response_model=ScheduleExportResponse,
    dependencies=_admin_only(),
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
