"""FHIR Bundle -> rows (ABHA import). Handles the resource types serialize.py emits."""
from datetime import date, timedelta

from sqlalchemy.orm import Session

from ..models import Allergy, Condition, Document, Medication, Observation, Profile
from ..rules.dosage import parse_dose
from .serialize import CODE_TO_DOCTYPE

FLAGS = {"N", "L", "H", "LL", "HH"}


def _d(s: str | None) -> date | None:
    return date.fromisoformat(s[:10]) if s else None


def _by_type(bundle: dict) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for e in bundle.get("entry", []):
        out.setdefault(e["resource"]["resourceType"], []).append(e["resource"])
    return out


def import_bundle(db: Session, p: Profile, bundle: dict, source_key: str) -> Document:
    r = _by_type(bundle)
    comp = (r.get("Composition") or [{}])[0]
    code = ((comp.get("type") or {}).get("coding") or [{}])[0].get("code")
    enc = (r.get("Encounter") or [{}])[0].get("period", {})
    author = ((comp.get("author") or [{}])[0]).get("display")
    doc = Document(profile_id=p.id, source="abdm", status="done", file_path=source_key,
                   doc_type=CODE_TO_DOCTYPE.get(code, "other"), doc_date=_d(comp.get("date")),
                   facility=(comp.get("custodian") or {}).get("display"), practitioner=author,
                   admission_date=_d(enc.get("start")), discharge_date=_d(enc.get("end")))
    db.add(doc)
    db.flush()
    ids = {"profile_id": p.id, "document_id": doc.id}
    for o in r.get("Observation", []):
        cc, q, rng = o.get("code", {}), o.get("valueQuantity") or {}, (o.get("referenceRange") or [{}])[0]
        loinc = next((c for c in cc.get("coding", []) if c.get("system") == "http://loinc.org"), {})
        flag = (((o.get("interpretation") or [{}])[0].get("coding") or [{}])[0]).get("code")
        db.add(Observation(**ids, loinc_code=loinc.get("code"), display_name=cc.get("text") or loinc.get("display") or "Result",
                           value_num=q.get("value"), value_text=o.get("valueString"), unit=q.get("unit"),
                           ref_low=(rng.get("low") or {}).get("value"), ref_high=(rng.get("high") or {}).get("value"),
                           interpretation=flag if flag in FLAGS else None, effective_at=_d(o.get("effectiveDateTime"))))
    for m in r.get("MedicationRequest", []):
        dose = ((m.get("dosageInstruction") or [{}])[0]).get("text")
        days = ((m.get("dispenseRequest") or {}).get("expectedSupplyDuration") or {}).get("value")
        start = _d(m.get("authoredOn"))
        parsed = parse_dose(dose)
        db.add(Medication(**ids, brand_name=m["medicationCodeableConcept"].get("text", "Medicine"), dose_pattern=dose,
                          per_day=parsed["per_day"], timing=parsed["timing"], duration_days=days, start_date=start,
                          end_date=start + timedelta(days=int(days)) if start and days else None,
                          prescriber=(m.get("requester") or {}).get("display")))
    for c in r.get("Condition", []):
        db.add(Condition(**ids, name=c["code"].get("text", "Condition"), recorded_at=_d(c.get("recordedDate"))))
    for a in r.get("AllergyIntolerance", []):
        rx = ((a.get("reaction") or [{}])[0].get("manifestation") or [{}])[0].get("text")
        db.add(Allergy(**ids, substance=a["code"].get("text", "Allergen"), reaction=rx))
    db.commit()
    return doc
