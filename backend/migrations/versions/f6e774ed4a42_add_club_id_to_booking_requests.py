"""add club id to booking requests"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6e774ed4a42"
down_revision: Union[str, None] = "4a92d6c1e7b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "booking_requests",
        sa.Column("club_id", sa.String(length=160), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("booking_requests", "club_id")