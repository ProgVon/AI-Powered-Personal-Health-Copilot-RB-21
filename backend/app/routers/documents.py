import shutil
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_profile
from ..config import settings
from ..db import get_db
from ..ingestion.graph import run_ingest
from ..ingestion.summarize import LANGS, translate_summary
from ..models import Document, Profile

router = APIRouter(prefix="/documents", tags=["documents"])
EXT = {"image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf"}
MAX_BYTES = 15 * 1024 * 1024


def _own(db: Session, profile: Profile, doc_id: int) -> Document:
    doc = db.get(Document, doc_id)
    if not doc or doc.profile_id != profile.id:
        raise HTTPException(404, "Document not found")
    return doc


def _row(o, skip=("profile_id",)):
    return {c.name: getattr(o, c.name) for c in o.__table__.columns if c.name not in skip}


def doc_brief(d: Document) -> dict:
    return {"id": d.id, "doc_type": d.doc_type, "doc_date": d.doc_date, "facility": d.facility,
            "status": d.status, "source": d.source, "created_at": d.created_at}


@router.post("")
async def upload(file: UploadFile, bg: BackgroundTasks, p: Profile = Depends(current_profile),
                 db: Session = Depends(get_db)):
    if file.content_type not in EXT:
        raise HTTPException(415, "Only JPG, PNG or PDF files are accepted")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File is larger than 15 MB")
    doc = Document(profile_id=p.id, mime=file.content_type, status="processing", source="upload")
    db.add(doc)
    db.flush()  # need the id for the storage folder
    folder = Path(settings.STORAGE_DIR) / str(doc.id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"original{EXT[file.content_type]}"
    path.write_bytes(data)
    doc.file_path = str(path)
    db.commit()
    bg.add_task(run_ingest, doc.id, p.id)
    return doc_brief(doc)


@router.get("")
def list_documents(p: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    docs = db.scalars(select(Document).where(Document.profile_id == p.id).order_by(Document.created_at.desc()))
    return [doc_brief(d) for d in docs]


@router.get("/{doc_id}")
def get_document(doc_id: int, p: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    d = _own(db, p, doc_id)
    return {**doc_brief(d), "practitioner": d.practitioner, "admission_date": d.admission_date,
            "discharge_date": d.discharge_date, "extraction": d.extraction, "summary": d.summary,
            "observations": [_row(o) for o in d.observations], "medications": [_row(m) for m in d.medications],
            "conditions": [_row(c) for c in d.conditions], "allergies": [_row(a) for a in d.allergies]}


@router.get("/{doc_id}/file")
def get_file(doc_id: int, p: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    d = _own(db, p, doc_id)
    if not d.file_path or not Path(d.file_path).exists():
        raise HTTPException(404, "No original file for this document")
    return FileResponse(d.file_path, media_type=d.mime)


@router.get("/{doc_id}/summary")
def get_summary(doc_id: int, lang: str = "en", p: Profile = Depends(current_profile),
                db: Session = Depends(get_db)):
    d = _own(db, p, doc_id)
    if not d.summary:
        raise HTTPException(409, "Summary not ready")
    if lang == "en":
        return d.summary
    if lang not in LANGS:
        raise HTTPException(422, f"Supported languages: en, {', '.join(LANGS)}")
    cached = d.summary_i18n or {}
    if lang not in cached:
        cached = {**cached, lang: translate_summary(d.summary, lang)}  # on demand, then cached
        d.summary_i18n = cached
        db.commit()
    return cached[lang]


def delete_profile_data(db: Session, p: Profile):
    for d in p.documents:
        shutil.rmtree(Path(settings.STORAGE_DIR) / str(d.id), ignore_errors=True)
    db.delete(p.user)  # cascades to profile, documents and every clinical row
    db.commit()
