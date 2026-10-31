from collections.abc import Generator

from sqlalchemy.orm import Session

from app.database.session import SessionLocal


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as db:
        try:
            yield db
            if db.in_transaction():
                db.commit()
        except Exception:
            db.rollback()
            raise
