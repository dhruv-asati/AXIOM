from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AXIOM API"
    environment: str = "development"
    database_url: str = "postgresql+psycopg://axiom:axiom@localhost:5432/axiom"
    cors_origins: str = "http://localhost:5173"
    axiom_demo_accounts_json: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @model_validator(mode="after")
    def require_database_url_in_production(self):
        if self.environment.lower() == "production" and "database_url" not in self.model_fields_set:
            raise ValueError("DATABASE_URL must be configured when ENVIRONMENT=production")
        return self

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
