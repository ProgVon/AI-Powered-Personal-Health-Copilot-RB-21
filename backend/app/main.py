import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from sqlalchemy import update

from .db import SessionLocal, init_db
from .models import Document
from .routers import abha, auth, documents, profile


logging.basicConfig(level=logging.INFO)  # show ingestion timings next to uvicorn's log


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # create_all, no Alembic for the prototype
    with SessionLocal() as db:  # background tasks die with the server; mark them failed so the page offers Rescan
        db.execute(update(Document).where(Document.status.in_(("processing", "summarizing")))
                   .values(status="failed", extraction={"_error": "interrupted by server restart", "_busy": True}))
        db.commit()
    yield


app = FastAPI(title="Health Copilot", lifespan=lifespan)
for r in (auth.router, documents.router, profile.router, abha.router):
    app.include_router(r)
