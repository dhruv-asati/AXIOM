from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
import time
from typing import Callable
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.dependencies import get_db
from app.models import AuthSession, User

SESSION_COOKIE = "axiom_session"
SESSION_TTL = timedelta(hours=8)
_LOGIN_WINDOW_SECONDS = 300
_LOGIN_MAX_ATTEMPTS = 10
_login_attempts: dict[str, deque[float]] = defaultdict(deque)


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    """Return a versioned scrypt hash (32 MiB cost, 16-byte random salt)."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**15, r=8, p=1, dklen=32, maxmem=64 * 1024 * 1024)
    import base64

    return "scrypt$32768$8$1${}${}".format(
        base64.urlsafe_b64encode(salt).decode("ascii").rstrip("="),
        base64.urlsafe_b64encode(digest).decode("ascii").rstrip("="),
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        import base64

        algorithm, n_value, r_value, p_value, salt_value, digest_value = encoded.split("$")
        if algorithm != "scrypt" or (int(n_value), int(r_value), int(p_value)) != (32768, 8, 1):
            return False
        decode = lambda value: base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
        salt, expected = decode(salt_value), decode(digest_value)
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=32768, r=8, p=1, dklen=len(expected), maxmem=64 * 1024 * 1024)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError, MemoryError):
        return False


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == _digest(token)))
    now = datetime.now(timezone.utc)
    if session is None or session.revoked_at is not None or _aware(session.expires_at) <= now:
        raise HTTPException(status_code=401, detail="Session is invalid or expired")
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Account is unavailable")
    request.state.auth_session = session
    return user


def require_csrf(request: Request, user: User = Depends(current_user)) -> None:
    if request.method.upper() in {"GET", "HEAD", "OPTIONS"}:
        return
    verify_request_origin(request)
    session: AuthSession = request.state.auth_session
    supplied = request.headers.get("x-csrf-token", "")
    if not supplied or not hmac.compare_digest(_digest(supplied), session.csrf_hash):
        raise HTTPException(status_code=403, detail="CSRF validation failed")


def require_dataset_scope(request: Request, user: User = Depends(current_user)) -> None:
    raw_dataset_id = request.path_params.get("dataset_id")
    if raw_dataset_id is None or user.role == "admin":
        return
    try:
        requested_dataset_id = UUID(str(raw_dataset_id))
    except ValueError:
        return
    if user.dataset_id != requested_dataset_id:
        raise HTTPException(status_code=403, detail="This account is not assigned to that dataset")


def verify_request_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if not origin:
        raise HTTPException(status_code=403, detail="Origin header required")
    parsed = urlsplit(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=403, detail="Invalid request origin")
    if settings.environment.lower() == "production" and parsed.scheme != "https":
        raise HTTPException(status_code=403, detail="HTTPS origin required")
    request_host = request.headers.get("host", "").lower()
    same_origin_host = parsed.netloc.lower() == request_host
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise HTTPException(status_code=403, detail="Origin must not contain a path or query")
    if settings.environment.lower() == "production" and not same_origin_host:
        raise HTTPException(status_code=403, detail="Production authentication requires a same-origin request")
    allowed_dev_origin = origin.rstrip("/") in settings.allowed_origins
    if not same_origin_host and not allowed_dev_origin:
        raise HTTPException(status_code=403, detail="Origin is not allowed")


def require_roles(*roles: str) -> Callable:
    allowed = frozenset(roles)

    def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail="This role cannot perform that action")
        return user

    return dependency


def enforce_login_rate_limit(request: Request) -> None:
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    attempts = _login_attempts[key]
    while attempts and now - attempts[0] > _LOGIN_WINDOW_SECONDS:
        attempts.popleft()
    if len(attempts) >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Try again later.")
    attempts.append(now)


def public_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "username": user.username,
        "role": user.role,
        "dataset_id": str(user.dataset_id) if user.dataset_id else None,
        "department": user.department,
        "faculty_source_id": user.faculty_source_id,
        "club_id": user.club_id,
    }


def csrf_hash(token: str) -> str:
    return _digest(token)


def derive_csrf_token(session_token: str) -> str:
    return hmac.new(session_token.encode("utf-8"), b"axiom-csrf-v1", hashlib.sha256).hexdigest()


def create_session(db: Session, user: User) -> tuple[str, str, AuthSession]:
    session_token = secrets.token_urlsafe(32)
    csrf_token = derive_csrf_token(session_token)
    session = AuthSession(
        user_id=user.id,
        token_hash=_digest(session_token),
        csrf_hash=_digest(csrf_token),
        expires_at=datetime.now(timezone.utc) + SESSION_TTL,
    )
    db.add(session)
    db.flush()
    return session_token, csrf_token, session
