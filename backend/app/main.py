import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import update

from .db import SessionLocal, init_db
from .models import Document
from .routers import abha, documents, profile


logging.basicConfig(level=logging.INFO)  # show ingestion timings next to uvicorn's log


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # create_all, no Alembic for the prototype
    with SessionLocal() as db:  # background tasks die with the server; don't leave documents 'processing' forever
        db.execute(update(Document).where(Document.status == "processing")
                   .values(status="failed", extraction={"_error": "interrupted by server restart"}))
        db.commit()
    yield


app = FastAPI(title="Health Copilot", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])
for r in (documents.router, profile.router, abha.router):
    app.include_router(r)
