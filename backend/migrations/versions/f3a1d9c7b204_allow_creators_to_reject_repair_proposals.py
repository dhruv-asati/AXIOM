"""allow repair proposal creators to reject their own proposals

Revision ID: f3a1d9c7b204
Revises: 4a92d6c1e7b0
Create Date: 2026-11-01
"""

from typing import Sequence, Union

from alembic import op


revision: str = "f3a1d9c7b204"
down_revision: Union[str, None] = "4a92d6c1e7b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_repair_proposal_no_self_approval",
        "schedule_repair_proposals",
        type_="check",
    )
    op.create_check_constraint(
        "ck_repair_proposal_no_self_approval",
        "schedule_repair_proposals",
        "status <> 'approved' OR decided_by_user_id IS NULL "
        "OR created_by_user_id IS NULL OR decided_by_user_id <> created_by_user_id",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_repair_proposal_no_self_approval",
        "schedule_repair_proposals",
        type_="check",
    )
    op.create_check_constraint(
        "ck_repair_proposal_no_self_approval",
        "schedule_repair_proposals",
        "decided_by_user_id IS NULL OR created_by_user_id IS NULL "
        "OR decided_by_user_id <> created_by_user_id",
    )
