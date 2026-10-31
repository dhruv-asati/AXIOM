from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.database_url,
    pool_size=2,
    max_overflow=1,
    pool_timeout=10,
    pool_recycle=1800,
    pool_pre_ping=True,
    pool_use_lifo=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
