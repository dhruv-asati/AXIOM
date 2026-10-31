"""add role-based account and cookie-session authentication

Revision ID: 31c4d6a2f809
Revises: cd9a2f1b7e40
Create Date: 2026-10-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "31c4d6a2f809"
down_revision: Union[str, None] = "cd9a2f1b7e40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("username", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("dataset_id", sa.Uuid(), nullable=True),
        sa.Column("department", sa.String(length=120), nullable=True),
        sa.Column("faculty_source_id", sa.String(length=160), nullable=True),
        sa.Column("club_id", sa.String(length=160), nullable=True),
        sa.CheckConstraint(
            "role IN ('admin', 'department_coordinator', 'faculty', 'club_representative')",
            name="ck_users_role",
        ),
        sa.CheckConstraint(
            "(role = 'admin' AND dataset_id IS NULL AND department IS NULL AND faculty_source_id IS NULL AND club_id IS NULL) OR "
            "(role = 'department_coordinator' AND dataset_id IS NOT NULL AND department IS NOT NULL AND faculty_source_id IS NULL AND club_id IS NULL) OR "
            "(role = 'faculty' AND dataset_id IS NOT NULL AND faculty_source_id IS NOT NULL AND department IS NOT NULL AND club_id IS NULL) OR "
            "(role = 'club_representative' AND dataset_id IS NOT NULL AND club_id IS NOT NULL AND department IS NULL AND faculty_source_id IS NULL)",
            name="ck_users_role_context",
        ),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], name="fk_users_dataset"),
        sa.ForeignKeyConstraint(["dataset_id", "faculty_source_id"], ["faculty.dataset_id", "faculty.source_id"], name="fk_users_faculty"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_index("ix_users_dataset_role", "users", ["dataset_id", "role"])

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("csrf_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE", name="fk_auth_sessions_user"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_auth_sessions_token_hash"),
    )
    op.create_index("ix_auth_sessions_user_expiry", "auth_sessions", ["user_id", "expires_at"])

    additions = (
        ("booking_requests", "created_by_user_id", "fk_booking_requests_created_by_user", "ix_booking_requests_created_by"),
        ("cancellations", "cancelled_by_user_id", "fk_cancellations_cancelled_by_user", None),
        ("schedules", "created_by_user_id", "fk_schedules_created_by_user", "ix_schedules_created_by"),
        ("booking_outcomes", "decided_by_user_id", "fk_booking_outcomes_decided_by_user", None),
        ("schedule_repair_proposals", "created_by_user_id", "fk_repair_proposals_created_by_user", "ix_repair_proposals_created_by"),
        ("schedule_repair_proposals", "decided_by_user_id", "fk_repair_proposals_decided_by_user", None),
    )
    for table, column, constraint, index in additions:
        op.add_column(table, sa.Column(column, sa.Uuid(), nullable=True))
        op.create_foreign_key(constraint, table, "users", [column], ["id"], ondelete="SET NULL")
        if index:
            op.create_index(index, table, [column])

    op.create_check_constraint(
        "ck_repair_proposal_no_self_approval",
        "schedule_repair_proposals",
        "decided_by_user_id IS NULL OR created_by_user_id IS NULL OR decided_by_user_id <> created_by_user_id",
    )


def downgrade() -> None:
    op.drop_constraint("ck_repair_proposal_no_self_approval", "schedule_repair_proposals", type_="check")
    additions = (
        ("schedule_repair_proposals", "decided_by_user_id", "fk_repair_proposals_decided_by_user", None),
        ("schedule_repair_proposals", "created_by_user_id", "fk_repair_proposals_created_by_user", "ix_repair_proposals_created_by"),
        ("booking_outcomes", "decided_by_user_id", "fk_booking_outcomes_decided_by_user", None),
        ("schedules", "created_by_user_id", "fk_schedules_created_by_user", "ix_schedules_created_by"),
        ("cancellations", "cancelled_by_user_id", "fk_cancellations_cancelled_by_user", None),
        ("booking_requests", "created_by_user_id", "fk_booking_requests_created_by_user", "ix_booking_requests_created_by"),
    )
    for table, column, constraint, index in additions:
        op.drop_constraint(constraint, table, type_="foreignkey")
        if index:
            op.drop_index(index, table_name=table)
        op.drop_column(table, column)
    op.drop_index("ix_auth_sessions_user_expiry", table_name="auth_sessions")
    op.drop_table("auth_sessions")
    op.drop_index("ix_users_dataset_role", table_name="users")
    op.drop_table("users")
