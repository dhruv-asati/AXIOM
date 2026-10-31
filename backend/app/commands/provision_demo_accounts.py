"""Provision the four judge/demo roles from a protected environment variable.

Set AXIOM_DEMO_ACCOUNTS_JSON to a JSON array containing one account per role,
then run: python -m app.commands.provision_demo_accounts
Passwords are hashed before storage and are never printed by this command.
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

from sqlalchemy import select

from app.api.security import hash_password, verify_password
from app.core.config import settings
from app.database.session import SessionLocal
from app.models import Course, Dataset, Faculty, StudentGroup, User

ROLES = {"admin", "department_coordinator", "faculty", "club_representative"}
MIN_PASSWORD_LENGTH = 14


def _read_accounts(raw: str) -> list[dict[str, Any]]:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("AXIOM_DEMO_ACCOUNTS_JSON must contain valid JSON") from exc
    if not isinstance(payload, list) or len(payload) != 4 or any(not isinstance(item, dict) for item in payload):
        raise ValueError("Configure exactly four demo account objects, one for each official role")
    if {item.get("role") for item in payload} != ROLES:
        raise ValueError("Demo accounts must contain exactly admin, department_coordinator, faculty and club_representative roles")
    usernames: set[str] = set()
    for item in payload:
        username = str(item.get("username", "")).strip()
        password = item.get("password")
        if not username or len(username) > 120 or username.casefold() in usernames:
            raise ValueError("Each account needs a unique username of at most 120 characters")
        usernames.add(username.casefold())
        if not isinstance(password, str) or len(password) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Each demo password must contain at least {MIN_PASSWORD_LENGTH} characters")
        item["username"] = username.casefold()
    return payload


def provision(accounts: list[dict[str, Any]]) -> None:
    with SessionLocal.begin() as db:
        for account in accounts:
            role = account["role"]
            dataset = None
            department = None
            faculty_source_id = None
            club_id = None
            if role != "admin":
                dataset_source_id = str(account.get("dataset_source_id", "")).strip()
                dataset = db.scalar(select(Dataset).where(Dataset.source_dataset_id == dataset_source_id))
                if dataset is None:
                    raise ValueError(f"Dataset source ID {dataset_source_id!r} is not imported")
            if role == "department_coordinator":
                department = str(account.get("department", "")).strip()
                found = any((db.scalar(select(model.id).where(model.dataset_id == dataset.id, model.department == department)) is not None) for model in (Faculty, Course, StudentGroup))
                if not department or not found:
                    raise ValueError("Department coordinator must name a department present in the selected dataset")
            elif role == "faculty":
                faculty_source_id = str(account.get("faculty_source_id", "")).strip()
                faculty = db.scalar(select(Faculty).where(Faculty.dataset_id == dataset.id, Faculty.source_id == faculty_source_id))
                if faculty is None:
                    raise ValueError("Faculty demo account must reference a faculty source ID in the selected dataset")
                department = faculty.department
            elif role == "club_representative":
                club_id = str(account.get("club_id", "")).strip()
                if not club_id:
                    raise ValueError("Club representative demo account must have a non-empty club_id")

            username = account["username"]
            user = db.scalar(select(User).where(User.username == username).with_for_update())
            expected_context = {
                "role": role,
                "is_active": True,
                "dataset_id": dataset.id if dataset else None,
                "department": department,
                "faculty_source_id": faculty_source_id,
                "club_id": club_id,
            }
            if user is not None:
                if any(getattr(user, key) != value for key, value in expected_context.items()):
                    raise ValueError(f"Existing username {username!r} has different role/context; refusing to overwrite it")
                if not verify_password(account["password"], user.password_hash):
                    raise ValueError(f"Existing username {username!r} uses a different password; refusing to reset it")
                continue
            db.add(User(
                username=username,
                password_hash=hash_password(account["password"]),
                **expected_context,
            ))


def main() -> int:
    raw = os.environ.get("AXIOM_DEMO_ACCOUNTS_JSON", settings.axiom_demo_accounts_json)
    if not raw:
        print("Set AXIOM_DEMO_ACCOUNTS_JSON in the protected environment before provisioning.", file=sys.stderr)
        return 2
    try:
        accounts = _read_accounts(raw)
        provision(accounts)
    except ValueError as exc:
        print(f"Demo account provisioning failed: {exc}", file=sys.stderr)
        return 2
    print("Provisioned exactly four AXIOM role accounts (existing matching accounts were left unchanged). Passwords were not displayed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
