import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from sqlalchemy import update

from .db import SessionLocal, init_db
from .ingestion.graph import INGEST, resume
from .ingestion.summarize import summarize
from .models import Document
from .routers import abha, auth, documents, profile


logging.basicConfig(level=logging.INFO)  # show ingestion timings next to uvicorn's log


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # create_all, no Alembic for the prototype
    with SessionLocal() as db:  # background tasks die with the server
        # cut off mid-read: mark failed so the page offers Rescan
        db.execute(update(Document).where(Document.status == "processing")
                   .values(status="failed", extraction={"_error": "interrupted by server restart", "_busy": True}))
        redo = resume(db)  # cut off mid-summary: the rows are saved, so just write the summary again
        db.commit()
    for state in redo:
        INGEST.submit(summarize, state)
    yield


app = FastAPI(title="Health Copilot", lifespan=lifespan)
for r in (auth.router, documents.router, profile.router, abha.router):
    app.include_router(r)
