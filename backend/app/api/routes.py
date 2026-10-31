from pathlib import Path
from collections.abc import Generator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import SessionLocal
from app.models import BookingOutcome, BookingRequest, Dataset, Schedule
from app.services.bookings.engine import run_booking_engine
from app.services.datasets.importer import DatasetImportError, import_dataset
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
)

router = APIRouter()
DATA_ROOT = (Path(__file__).resolve().parents[3] / "data").resolve()


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as db:
        yield db


class DatasetImportRequest(BaseModel):
    path: str = Field(default="cit_public.json", description="A dataset JSON file or directory, relative to the repository data/ directory")


class TimetableGenerateRequest(BaseModel):
    team: str = Field(default="AXIOM", min_length=1, max_length=255)
    time_limit_seconds: float = Field(default=120, ge=1, le=600)


@router.get("/health", tags=["system"], response_model=HealthResponse)
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "axiom-api"}


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
        return import_dataset(db, requested)
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
    }


@router.get(
    "/datasets/{dataset_id}/schedules/{schedule_id}/assignments",
    tags=["timetables"],
    response_model=ScheduleAssignmentsResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_timetable_assignments_endpoint(dataset_id: UUID, schedule_id: UUID, db: Session = Depends(get_db)):
    try:
        return get_schedule_assignments(db, dataset_id, schedule_id)
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
