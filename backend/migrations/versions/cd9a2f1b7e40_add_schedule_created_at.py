"""add schedule creation timestamp for reliable schedule history

Revision ID: cd9a2f1b7e40
Revises: 8c41d892c2aa
Create Date: 2026-10-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "cd9a2f1b7e40"
down_revision: Union[str, None] = "8c41d892c2aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "schedules",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.execute("UPDATE schedules SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL")
    with op.batch_alter_table("schedules") as batch_op:
        batch_op.alter_column("created_at", existing_type=sa.DateTime(timezone=True), nullable=False)


def downgrade() -> None:
    op.drop_column("schedules", "created_at")
