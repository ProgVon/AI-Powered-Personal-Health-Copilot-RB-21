import os
import tempfile

_tmp = tempfile.mkdtemp()
# never the real DATABASE_URL; a throwaway Postgres only when asked: TEST_DATABASE_URL=postgresql+psycopg://... pytest
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_tmp}/test.db")  # file DB: threads share it
os.environ["STORAGE_DIR"] = f"{_tmp}/storage"
os.environ["BREVO_API_KEY"] = ""  # never email real people from tests, whatever .env says
os.environ["JWT_SECRET"] = "test-secret-" + "x" * 32


import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    from app.routers import auth
    auth._hits.clear()  # tests sign up many users from one client
