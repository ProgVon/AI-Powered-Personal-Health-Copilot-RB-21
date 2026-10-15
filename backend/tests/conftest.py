import os
import tempfile

_tmp = tempfile.mkdtemp()  # tests never touch Postgres; file DB so background-task threads share it
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["STORAGE_DIR"] = f"{_tmp}/storage"
os.environ["SMTP_HOST"] = ""  # never email real people from tests, whatever .env says
os.environ["JWT_SECRET"] = "test-secret-" + "x" * 32


import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    from app.routers import auth
    auth._hits.clear()  # tests sign up many users from one client
