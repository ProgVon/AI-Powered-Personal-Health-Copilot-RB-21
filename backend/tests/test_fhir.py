import json
from datetime import date
from pathlib import Path

import pytest
from fhir.resources.R4B.bundle import Bundle
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import Base
from app import models as m
from app.fhir.importer import import_bundle
from app.fhir.serialize import to_bundle

MOCK = Path(__file__).resolve().parents[1] / "data" / "mock_abdm"


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as s:
        yield s


def _profile(db, email="a@x.com"):
    u = m.User(email=email, password_hash="x")
    u.profile = m.Profile(name="Sunita Devi", dob=date(1990, 1, 1), sex="female", abha_number="12-3456-7890-1234")
    db.add(u)
    db.commit()
    return u.profile


def test_export_is_valid_fhir_and_round_trips(db):
    p = _profile(db)
    d = m.Document(profile_id=p.id, status="done", doc_type="discharge_summary", doc_date=date(2026, 5, 2),
                   facility="City Hospital", practitioner="Dr R", admission_date=date(2026, 4, 28),
                   discharge_date=date(2026, 5, 2))
    d.observations = [m.Observation(profile_id=p.id, loinc_code="718-7", display_name="Haemoglobin", value_num=10.8,
                                    unit="g/dL", ref_low=12, ref_high=15, interpretation="L",
                                    effective_at=date(2026, 5, 2)),
                      m.Observation(profile_id=p.id, display_name="Dengue NS1", value_text="Positive")]
    d.medications = [m.Medication(profile_id=p.id, brand_name="Dolo 650", strength="650 mg", dose_pattern="1-0-1",
                                  duration_days=5, start_date=date(2026, 5, 2), end_date=date(2026, 5, 7),
                                  prescriber="Dr R")]
    d.conditions = [m.Condition(profile_id=p.id, name="Anaemia", recorded_at=date(2026, 5, 2))]
    d.allergies = [m.Allergy(profile_id=p.id, substance="Penicillin", reaction="Rash")]
    p.documents.append(d)
    db.commit()

    bundle = to_bundle(p, db)
    Bundle.model_validate(bundle)  # raises on invalid FHIR R4B
    types = [e["resource"]["resourceType"] for e in bundle["entry"]]
    assert {"Patient", "Composition", "Observation", "MedicationRequest", "Condition", "AllergyIntolerance",
            "Encounter"} <= set(types)
    comp = next(e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == "Composition")
    assert comp["type"]["text"] == "DischargeSummaryRecord"

    q = _profile(db, "b@x.com")
    back = import_bundle(db, q, bundle, "abdm:roundtrip")
    assert back.doc_type == "discharge_summary" and back.admission_date == date(2026, 4, 28)
    hb = next(o for o in back.observations if o.loinc_code == "718-7")
    assert (hb.value_num, hb.interpretation, hb.ref_low) == (10.8, "L", 12)
    assert back.medications[0].end_date == date(2026, 5, 7)
    assert back.allergies[0].reaction == "Rash"


@pytest.mark.parametrize("f", sorted(MOCK.glob("*.json")), ids=lambda f: f.name)
def test_mock_bundles_valid_and_importable(db, f):
    bundle = json.loads(f.read_text())
    Bundle.model_validate(bundle)
    doc = import_bundle(db, _profile(db), bundle, f"abdm:{f.name}")
    assert doc.source == "abdm" and (doc.observations or doc.medications)
    Bundle.model_validate(to_bundle(doc.profile_id and db.get(m.Profile, doc.profile_id), db))
