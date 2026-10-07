from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .routers import abha, documents, profile


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # create_all, no Alembic for the prototype
    yield


app = FastAPI(title="Health Copilot", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])
for r in (documents.router, profile.router, abha.router):
    app.include_router(r)
