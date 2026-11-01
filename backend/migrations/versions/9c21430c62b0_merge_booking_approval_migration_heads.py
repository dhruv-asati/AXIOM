"""merge booking approval migration heads"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '9c21430c62b0'
down_revision: Union[str, None] = ('f3a1d9c7b204', 'f6e774ed4a42')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
