"""add department lab and class-move booking approvals

Revision ID: 4a92d6c1e7b0
Revises: 31c4d6a2f809
Create Date: 2026-10-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4a92d6c1e7b0"
down_revision: Union[str, None] = "31c4d6a2f809"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("rooms", sa.Column("department", sa.String(length=120), nullable=True))
    op.create_index("ix_rooms_dataset_department", "rooms", ["dataset_id", "department"])
    op.add_column("booking_outcomes", sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("booking_outcomes", sa.Column("decision_source", sa.String(length=32), nullable=True))
    op.create_check_constraint(
        "ck_booking_outcome_decision_source", "booking_outcomes",
        "decision_source IS NULL OR decision_source IN ('engine','department_lab','class_move')",
    )
    op.create_unique_constraint("uq_repair_proposals_id_dataset", "schedule_repair_proposals", ["id", "dataset_id"])
    op.create_table(
        "booking_class_move_proposals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("dataset_id", sa.Uuid(), nullable=False),
        sa.Column("request_source_id", sa.String(length=160), nullable=False),
        sa.Column("baseline_schedule_id", sa.Uuid(), nullable=False),
        sa.Column("repair_proposal_id", sa.Uuid(), nullable=False),
        sa.Column("room_source_id", sa.String(length=160), nullable=False),
        sa.Column("day", sa.String(length=24), nullable=False),
        sa.Column("start_period", sa.Integer(), nullable=False),
        sa.Column("end_period", sa.Integer(), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("decided_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("approved_schedule_id", sa.Uuid(), nullable=True),
        sa.CheckConstraint("status IN ('proposed', 'approved', 'rejected')", name="ck_class_move_status"),
        sa.CheckConstraint("start_period > 0 AND end_period >= start_period", name="ck_class_move_periods"),
        sa.CheckConstraint("decided_by_user_id IS NULL OR created_by_user_id IS NULL OR decided_by_user_id <> created_by_user_id", name="ck_class_move_no_self_approval"),
        sa.ForeignKeyConstraint(["dataset_id", "request_source_id"], ["booking_requests.dataset_id", "booking_requests.source_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["baseline_schedule_id", "dataset_id"], ["schedules.id", "schedules.dataset_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["repair_proposal_id", "dataset_id"], ["schedule_repair_proposals.id", "schedule_repair_proposals.dataset_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["dataset_id", "room_source_id"], ["rooms.dataset_id", "rooms.source_id"]),
        sa.ForeignKeyConstraint(["approved_schedule_id", "dataset_id"], ["schedules.id", "schedules.dataset_id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL", name="fk_class_move_created_by"),
        sa.ForeignKeyConstraint(["decided_by_user_id"], ["users.id"], ondelete="SET NULL", name="fk_class_move_decided_by"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("repair_proposal_id", name="uq_class_move_repair_proposal"),
    )
    op.create_index("ix_class_move_dataset_status", "booking_class_move_proposals", ["dataset_id", "status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_class_move_dataset_status", table_name="booking_class_move_proposals")
    op.drop_table("booking_class_move_proposals")
    op.drop_constraint("uq_repair_proposals_id_dataset", "schedule_repair_proposals", type_="unique")
    op.drop_constraint("ck_booking_outcome_decision_source", "booking_outcomes", type_="check")
    op.drop_column("booking_outcomes", "decision_source")
    op.drop_column("booking_outcomes", "decided_at")
    op.drop_index("ix_rooms_dataset_department", table_name="rooms")
    op.drop_column("rooms", "department")
