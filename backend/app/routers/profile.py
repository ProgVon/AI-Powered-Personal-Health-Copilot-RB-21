from datetime import date

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_profile
from ..db import get_db
from ..fhir.serialize import to_bundle
from ..models import Allergy, Condition, Document, Medication, Observation, Profile
from .documents import delete_profile_data

router = APIRouter(tags=["profile"])
ABNORMAL = ("L", "H", "LL", "HH")


class ProfileUpdate(BaseModel):
    name: str | None = None
    dob: date | None = None
    sex: str | None = None
    preferred_language: str | None = None


def _age(dob: date | None) -> int | None:
    if not dob:
        return None
    t = date.today()
    return t.year - dob.year - ((t.month, t.day) < (dob.month, dob.day))


def _profile_json(p: Profile, db: Session) -> dict:
    today = date.today()
    q = lambda m: db.scalars(select(m).where(m.profile_id == p.id))  # noqa: E731
    meds = [m for m in q(Medication) if m.end_date is None or m.end_date >= today]  # "current" is computed
    latest: dict[str, Observation] = {}
    for o in sorted((o for o in q(Observation) if o.interpretation in ABNORMAL),
                    key=lambda o: o.effective_at or date.min):
        latest[o.display_name] = o
    return {
        "name": p.name, "dob": p.dob, "age": _age(p.dob), "sex": p.sex, "language": p.user.preferred_language,
        "abha": {"number": p.abha_number, "address": p.abha_address, "linked": bool(p.abha_linked_at)},
        "conditions": sorted({c.name for c in q(Condition)}),
        "allergies": sorted({a.substance for a in q(Allergy)}),
        "current_medicines": [{"name": m.brand_name, "salt": m.salt, "dose_pattern": m.dose_pattern,
                               "document_id": m.document_id} for m in meds],
        "latest_abnormal": [{"test": o.display_name, "value": o.value_num if o.value_num is not None else o.value_text,
                             "unit": o.unit, "interpretation": o.interpretation, "date": o.effective_at,
                             "ref_low": o.ref_low, "ref_high": o.ref_high,
                             "document_id": o.document_id} for o in latest.values()],
    }


@router.get("/profile")
def get_profile(p: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    return _profile_json(p, db)


@router.put("/profile")
def put_profile(body: ProfileUpdate, p: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    for k in ("name", "dob", "sex"):
        if (v := getattr(body, k)) is not None:
            setattr(p, k, v)
    if body.preferred_language:
        p.user.preferred_language = body.preferred_language
    db.commit()
    return _profile_json(p, db)


@router.delete("/profile", status_code=204)
def delete_profile(p: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    delete_profile_data(db, p)
    return Response(status_code=204)


@router.get("/profile/timeline")
def timeline(types: str = "reports,medicines,diagnoses", date_from: date | None = None, date_to: date | None = None,
             p: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    want = set(types.split(","))
    items = []
    q = lambda m: db.scalars(select(m).where(m.profile_id == p.id))  # noqa: E731
    if "reports" in want:
        for d in q(Document):
            if d.status == "done":
                items.append({"type": "document", "date": d.doc_date or d.created_at.date(), "document_id": d.id,
                              "title": (d.doc_type or "document").replace("_", " "), "detail": d.facility,
                              "source": d.source})
        docs = {d.id: d.source for d in q(Document)}
        for o in q(Observation):
            if o.interpretation in ABNORMAL:
                items.append({"type": "abnormal_result", "date": o.effective_at, "document_id": o.document_id,
                              "title": o.display_name, "detail": f"{o.value_num} {o.unit or ''}".strip(),
                              "interpretation": o.interpretation, "source": docs.get(o.document_id)})
    if "medicines" in want:
        docs = {d.id: d.source for d in q(Document)}
        for m in q(Medication):
            base = {"document_id": m.document_id, "title": m.brand_name, "source": docs.get(m.document_id)}
            items.append({**base, "type": "medicine_started", "date": m.start_date, "detail": m.dose_pattern})
            if m.end_date:
                items.append({**base, "type": "medicine_ended", "date": m.end_date, "detail": None})
    if "diagnoses" in want:
        docs = {d.id: d.source for d in q(Document)}
        for c in q(Condition):
            items.append({"type": "diagnosis", "date": c.recorded_at, "document_id": c.document_id,
                          "title": c.name, "detail": None, "source": docs.get(c.document_id)})
    items = [i for i in items if i["date"] and (not date_from or i["date"] >= date_from)
             and (not date_to or i["date"] <= date_to)]
    return sorted(items, key=lambda i: i["date"], reverse=True)


@router.get("/profile/fhir")
def fhir_export(p: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    return to_bundle(p, db)
