from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).parents[1] / ".env")  # backend/.env from any cwd
    DATABASE_URL: str = "sqlite:///dev.db"
    VISION_MODEL: str = "google_genai:gemini-3.1-flash-lite"
    TEXT_MODEL: str = "google_genai:gemini-3.1-flash-lite"
    LLM_API_KEY: str = ""  # provider-agnostic; empty falls back to the provider's own env var
    LLM_KWARGS: dict = {}  # extra provider options as JSON, e.g. {"thinking_budget": 0} for Gemini
    STORAGE_DIR: str = "storage"
    JWT_SECRET: str = Field(min_length=32)  # required: a made-up one would log everyone out on each restart
    SMTP_HOST: str = ""  # empty: OTPs are written to the server log instead of emailed (local dev)
    SMTP_PORT: int = 587  # 587 = STARTTLS, 465 = SSL
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""  # sender, e.g. "Health Copilot <you@gmail.com>"; defaults to SMTP_USER
    BREVO_API_KEY: str = ""  # set: email goes through Brevo's HTTPS API instead of SMTP (needed on Render's free plan)


settings = Settings()
