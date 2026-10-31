from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router, prefix="/api/v1")
