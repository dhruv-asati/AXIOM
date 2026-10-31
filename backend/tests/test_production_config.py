import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_production_settings_require_an_explicit_database_url():
    with pytest.raises(ValidationError, match="DATABASE_URL must be configured"):
        Settings(_env_file=None, environment="production")


def test_production_settings_accept_psycopg_database_url_without_exposing_it():
    settings = Settings(
        _env_file=None,
        environment="production",
        database_url="postgresql+psycopg://user:placeholder@db.example.invalid/app",
    )

    assert settings.database_url.startswith("postgresql+psycopg://")
