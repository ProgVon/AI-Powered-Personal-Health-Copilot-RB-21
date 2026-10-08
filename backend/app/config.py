from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).parents[1] / ".env")  # backend/.env from any cwd
    DATABASE_URL: str = "sqlite:///dev.db"
    VISION_MODEL: str = "google_genai:gemini-3.1-flash-lite"
    TEXT_MODEL: str = "google_genai:gemini-3.1-flash-lite"
    LLM_API_KEY: str = ""  # provider-agnostic; empty falls back to the provider's own env var
    LLM_KWARGS: dict = {}  # extra provider options as JSON, e.g. {"thinking_budget": 0} for Gemini
    STORAGE_DIR: str = "storage"


settings = Settings()
