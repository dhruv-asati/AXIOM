from contextlib import asynccontextmanager
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError

from app.api.routes import public_router, router
from app.core.config import settings
from app.database.session import engine


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Release pooled database connections cleanly when the API stops."""
    try:
        yield
    finally:
        engine.dispose()

app = FastAPI(
    title="AXIOM API",
    description="Intelligent Campus Scheduling and Venue Management Platform",
    version="0.1.0",
    lifespan=lifespan,
)

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def mount_frontend(application: FastAPI, dist_dir: Path = FRONTEND_DIST) -> None:
    """Serve the production SPA when built, without intercepting API paths."""
    root = dist_dir.resolve()
    index_file = root / "index.html"
    assets_dir = root / "assets"
    if assets_dir.is_dir():
        application.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @application.get("/{frontend_path:path}", include_in_schema=False)
    def frontend_fallback(frontend_path: str):
        if frontend_path == "api" or frontend_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})

        if not index_file.is_file():
            return JSONResponse(
                status_code=404,
                content={"detail": "Frontend build unavailable. Run npm run build in frontend/."},
            )

        if not frontend_path:
            return FileResponse(index_file)

        requested_file = (root / frontend_path).resolve()
        try:
            requested_file.relative_to(root)
        except ValueError:
            return JSONResponse(status_code=404, content={"detail": "Not Found"})

        if requested_file.is_file():
            return FileResponse(requested_file)
        if Path(frontend_path).suffix:
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        return FileResponse(index_file)


@app.exception_handler(SQLAlchemyError)
async def database_error_handler(_request, exc: SQLAlchemyError):
    logging.getLogger("axiom.database").exception(
    "Database request failed: %s", type(exc).__name__
)
    return JSONResponse(
        status_code=503,
        content={"detail": "Database is unavailable or the required schema migration is pending."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(public_router, prefix="/api/v1")
app.include_router(router, prefix="/api/v1")
mount_frontend(app)
