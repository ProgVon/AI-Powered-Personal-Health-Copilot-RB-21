from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_profile, delete_profile_data
from ..db import get_db
from ..fhir.serialize import to_bundle
from ..ingestion.graph import INGEST, reflag
from ..ingestion.summarize import summarize
from ..models import Allergy, Condition, Document, Medication, Observation, Profile

router = APIRouter(tags=["profile"])
ABNORMAL = ("L", "H", "LL", "HH")


def _q(db: Session, p: Profile, m, *where):
    return db.scalars(select(m).where(m.profile_id == p.id, *where))


class ProfileUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    dob: date | None = None
    sex: Literal["male", "female", "other"] | None = None  # anything else would silently get the widest lab ranges
    preferred_language: Literal["en", "hi", "te"] | None = None

    @field_validator("dob")
    @classmethod
    def not_future(cls, v):
        if v and v > date.today():
            raise ValueError("Date of birth can't be in the future")
        return v


def _age(dob: date | None) -> int | None:
    if not dob:
        return None
    t = date.today()
    return t.year - dob.year - ((t.month, t.day) < (dob.month, dob.day))


def _profile_json(p: Profile, db: Session) -> dict:
    meds = [m for m in _q(db, p, Medication) if m.current]
    # newest labelled result per test: a later normal value clears an old abnormal one, an unreadable one doesn't
    latest: dict[str, Observation] = {}
    for o in sorted(_q(db, p, Observation, Observation.interpretation.is_not(None)), key=lambda o: o.effective_at or date.min):
        latest[o.display_name] = o
    abnormal = [o for o in latest.values() if o.interpretation in ABNORMAL]
    return {
        "name": p.name, "dob": p.dob, "age": _age(p.dob), "sex": p.sex, "language": p.user.preferred_language,
        "abha": {"number": p.abha_number, "address": p.abha_address, "linked": bool(p.abha_linked_at)},
        "conditions": sorted({c.name for c in _q(db, p, Condition)}),
        "allergies": sorted({a.substance for a in _q(db, p, Allergy)}),
        "current_medicines": [{"name": m.brand_name, "salt": m.salt, "dose_pattern": m.dose_pattern,
                               "document_id": m.document_id} for m in meds],
        "latest_abnormal": [{"test": o.display_name, "value": o.value_num if o.value_num is not None else o.value_text,
                             "unit": o.unit, "interpretation": o.interpretation, "date": o.effective_at,
                             "ref_low": o.ref_low, "ref_high": o.ref_high,
                             "document_id": o.document_id} for o in abnormal],
    }


@router.get("/profile")
def get_profile(p: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    return _profile_json(p, db)


@router.put("/profile")
def put_profile(body: ProfileUpdate, p: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    changed = False
    for k in ("name", "dob", "sex"):
        if (v := getattr(body, k)) is not None and v != getattr(p, k):
            setattr(p, k, v)
            changed = True
    if body.preferred_language:
        p.user.preferred_language = body.preferred_language
    redo = reflag(db, p) if changed else []  # ranges, date checks and the name warning depend on these
    db.commit()
    for state in redo:
        INGEST.submit(summarize, state)  # new flags need a new summary; that's a model call, so off the request
    return _profile_json(p, db)


@router.delete("/profile", status_code=204)
def delete_profile(p: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    delete_profile_data(db, p)
    return Response(status_code=204)


@router.get("/profile/timeline")
def timeline(types: str = "reports,medicines,diagnoses", p: Profile = Depends(current_profile),
             db: Session = Depends(get_db)):
    want = set(types.split(","))
    items = []
    docs = {d.id: d for d in _q(db, p, Document)}  # one query, shared by every section
    if "reports" in want:
        for d in docs.values():
            if d.status == "done":
                items.append({"type": "document", "date": d.doc_date or d.created_at.date(), "document_id": d.id,
                              "title": (d.doc_type or "document").replace("_", " "), "detail": d.facility,
                              "source": d.source})
        for o in _q(db, p, Observation, Observation.interpretation.in_(ABNORMAL)):
            items.append({"type": "abnormal_result", "date": o.effective_at, "document_id": o.document_id,
                          "title": o.display_name, "detail": f"{o.value_num} {o.unit or ''}".strip(),
                          "interpretation": o.interpretation, "source": docs[o.document_id].source})
    if "medicines" in want:
        for m in _q(db, p, Medication):
            base = {"document_id": m.document_id, "title": m.brand_name, "source": docs[m.document_id].source}
            items.append({**base, "type": "medicine_started", "date": m.start_date, "detail": m.dose_pattern})
            if m.end_date:
                items.append({**base, "type": "medicine_ended", "date": m.end_date, "detail": None})
    if "diagnoses" in want:
        for c in _q(db, p, Condition):
            items.append({"type": "diagnosis", "date": c.recorded_at, "document_id": c.document_id,
                          "title": c.name, "detail": None, "source": docs[c.document_id].source})
    return sorted((i for i in items if i["date"]), key=lambda i: i["date"], reverse=True)


@router.get("/profile/fhir")
def fhir_export(p: Profile = Depends(current_profile)):
    return to_bundle(p)
