"""persist disruption repair proposals and decisions

Revision ID: 8c41d892c2aa
Revises: 415e1b5d6866
Create Date: 2026-10-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8c41d892c2aa"
down_revision: Union[str, None] = "415e1b5d6866"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "schedule_repair_proposals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("dataset_id", sa.Uuid(), nullable=False),
        sa.Column("baseline_schedule_id", sa.Uuid(), nullable=False),
        sa.Column("approved_schedule_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("input_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("changes", sa.JSON(), nullable=False),
        sa.Column("assignments", sa.JSON(), nullable=False),
        sa.Column("exam_allocations", sa.JSON(), nullable=False),
        sa.Column("affected_session_ids", sa.JSON(), nullable=False),
        sa.Column("changed_session_ids", sa.JSON(), nullable=False),
        sa.Column("objective", sa.JSON(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('proposed', 'approved', 'rejected')",
            name="ck_repair_proposal_status",
        ),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["baseline_schedule_id", "dataset_id"],
            ["schedules.id", "schedules.dataset_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["approved_schedule_id", "dataset_id"],
            ["schedules.id", "schedules.dataset_id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_repair_proposals_dataset_created",
        "schedule_repair_proposals",
        ["dataset_id", "created_at"],
    )
    op.create_index(
        "ix_repair_proposals_baseline_status",
        "schedule_repair_proposals",
        ["baseline_schedule_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_repair_proposals_baseline_status", table_name="schedule_repair_proposals")
    op.drop_index("ix_repair_proposals_dataset_created", table_name="schedule_repair_proposals")
    op.drop_table("schedule_repair_proposals")
