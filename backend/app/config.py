from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    DATABASE_URL: str = "postgresql+psycopg://health:health@localhost:5432/health"
    VISION_MODEL: str = "anthropic:claude-sonnet-5-5"
    TEXT_MODEL: str = "anthropic:claude-sonnet-5-5"
    JWT_SECRET: str = "dev-secret"
    STORAGE_DIR: str = "storage"


settings = Settings()
