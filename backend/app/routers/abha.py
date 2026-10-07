import json
import re
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_profile
from ..db import get_db
from ..fhir.importer import import_bundle
from ..models import Document, Profile

router = APIRouter(prefix="/abha", tags=["abha"])
MOCK_DIR = Path(__file__).resolve().parents[2] / "data" / "mock_abdm"
DEMO_OTP = "123456"  # mock only: real linking needs ABDM sandbox registration
NUMBER = re.compile(r"\d{2}-\d{4}-\d{4}-\d{4}")
ADDRESS = re.compile(r"[A-Za-z0-9._]{3,}@(?:sbx|abdm)")


class Link(BaseModel):
    abha: str


class Verify(BaseModel):
    otp: str


@router.post("/link")
def link(body: Link, p: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    v = body.abha.strip()
    if NUMBER.fullmatch(v):
        p.abha_number, p.abha_address = v, None
    elif ADDRESS.fullmatch(v):
        p.abha_number, p.abha_address = None, v
    else:
        raise HTTPException(422, "Enter a 14-digit ABHA number (XX-XXXX-XXXX-XXXX) or an address like name@sbx")
    p.abha_linked_at = None  # not linked until the OTP is verified
    db.commit()
    return {"status": "otp_sent", "demo_otp": DEMO_OTP}


@router.post("/verify")
def verify(body: Verify, p: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    if not (p.abha_number or p.abha_address):
        raise HTTPException(409, "Start by linking an ABHA number or address")
    if body.otp != DEMO_OTP:
        raise HTTPException(401, "Incorrect OTP")
    p.abha_linked_at = datetime.now()
    db.commit()
    return {"status": "linked"}


@router.post("/import")
def import_records(p: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    if not p.abha_linked_at:
        raise HTTPException(409, "Link and verify your ABHA first")
    have = set(db.scalars(select(Document.file_path).where(Document.profile_id == p.id, Document.source == "abdm")))
    imported = []
    for f in sorted(MOCK_DIR.glob("*.json")):  # the mock HIP returns canned bundles
        if f"abdm:{f.name}" not in have:
            imported.append(import_bundle(db, p, json.loads(f.read_text(encoding="utf-8")), f"abdm:{f.name}").id)
    return {"imported_document_ids": imported}
