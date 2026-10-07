import os
import tempfile

_tmp = tempfile.mkdtemp()  # tests never touch Postgres; file DB so background-task threads share it
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["STORAGE_DIR"] = f"{_tmp}/storage"
