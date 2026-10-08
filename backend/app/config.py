from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    DATABASE_URL: str = "postgresql+psycopg://health:health@localhost:5432/health"
    VISION_MODEL: str = "google_genai:gemini-3.8-flash"
    TEXT_MODEL: str = "google_genai:gemini-3.8-flash"
    LLM_API_KEY: str = ""  # provider-agnostic; empty falls back to the provider's own env var
    STORAGE_DIR: str = "storage"


settings = Settings()
