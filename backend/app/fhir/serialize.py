"""DB rows -> FHIR R4 Bundle. Thin by design: tables are already FHIR-shaped."""
from datetime import date, datetime, timezone

from ..models import Profile

SNOMED = "http://snomed.info/sct"
INTERP = "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation"
ABHA_SYSTEM = "https://healthid.ndhm.gov.in"
# ABDM record types (NRCeS profile names) -> SNOMED code on Composition.type
ABDM_TYPE = {"prescription": ("440545006", "PrescriptionRecord"),
             "lab_report": ("721981007", "DiagnosticReportRecord"),
             "diagnostic_report": ("721981007", "DiagnosticReportRecord"),
             "discharge_summary": ("373942005", "DischargeSummaryRecord"),
             "other": ("419891008", "HealthDocumentRecord")}
CODE_TO_DOCTYPE = {"440545006": "prescription", "721981007": "lab_report",
                   "373942005": "discharge_summary", "419891008": "other"}
GENDER = {"male", "female", "other"}


def clean(x):
    """Drop None / empty values recursively; FHIR forbids empty elements."""
    if isinstance(x, dict):
        return {k: v for k, v in ((k, clean(v)) for k, v in x.items()) if v not in (None, [], {}, "")}
    if isinstance(x, list):
        return [v for v in (clean(i) for i in x) if v not in (None, [], {}, "")]
    return x


def _ref(rt: str, i) -> dict:
    return {"reference": f"{rt}/{i}"}


def _iso(d: date | datetime | None) -> str | None:
    return d.isoformat() if d else None


def _observation(o, pid: str) -> dict:
    return {"resourceType": "Observation", "id": f"obs-{o.id}", "status": "final", "subject": _ref("Patient", pid),
            "code": {"coding": [{"system": "http://loinc.org", "code": o.loinc_code, "display": o.display_name}]
                     if o.loinc_code else None, "text": o.display_name},
            "effectiveDateTime": _iso(o.effective_at),
            "valueQuantity": {"value": o.value_num, "unit": o.unit} if o.value_num is not None else None,
            "valueString": o.value_text if o.value_num is None else None,
            "interpretation": [{"coding": [{"system": INTERP, "code": o.interpretation}]}] if o.interpretation else None,
            "referenceRange": [{"low": {"value": o.ref_low, "unit": o.unit} if o.ref_low is not None else None,
                                "high": {"value": o.ref_high, "unit": o.unit} if o.ref_high is not None else None}]
            if o.ref_low is not None or o.ref_high is not None else None}


def _medication(m, pid: str) -> dict:
    current = m.end_date is None or m.end_date >= date.today()
    dose = " ".join(x for x in (m.dose_pattern, m.timing) if x)
    return {"resourceType": "MedicationRequest", "id": f"med-{m.id}", "status": "active" if current else "completed",
            "intent": "order", "subject": _ref("Patient", pid), "authoredOn": _iso(m.start_date),
            "medicationCodeableConcept": {"text": " ".join(x for x in (m.brand_name, m.strength) if x)},
            "dosageInstruction": [{"text": dose}] if dose else None,
            "requester": {"display": m.prescriber} if m.prescriber else None,
            "dispenseRequest": {"expectedSupplyDuration": {"value": m.duration_days, "unit": "days",
                                                           "system": "http://unitsofmeasure.org", "code": "d"}}
            if m.duration_days else None}


def _condition(c, pid: str) -> dict:
    return {"resourceType": "Condition", "id": f"cond-{c.id}", "subject": _ref("Patient", pid),
            "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                                           "code": "active"}]},
            "code": {"text": c.name},
            "recordedDate": _iso(c.recorded_at)}


def _allergy(a, pid: str) -> dict:
    return {"resourceType": "AllergyIntolerance", "id": f"allergy-{a.id}", "patient": _ref("Patient", pid),
            "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                                           "code": "active"}]},
            "code": {"text": a.substance},
            "reaction": [{"manifestation": [{"text": a.reaction}]}] if a.reaction else None}


def to_bundle(p: Profile) -> dict:
    pid = f"patient-{p.id}"
    res = [{"resourceType": "Patient", "id": pid, "name": [{"text": p.name}],
            "gender": p.sex if p.sex in GENDER else "unknown", "birthDate": _iso(p.dob),
            "identifier": [{"system": ABHA_SYSTEM, "value": p.abha_number} if p.abha_number else None,
                           {"system": f"{ABHA_SYSTEM}/address", "value": p.abha_address} if p.abha_address else None]}]
    for d in p.documents:
        if d.status != "done":
            continue
        code, text = ABDM_TYPE.get(d.doc_type or "other", ABDM_TYPE["other"])
        parts = {"Observations": [_observation(o, pid) for o in d.observations],
                 "Medications": [_medication(m, pid) for m in d.medications],
                 "Conditions": [_condition(c, pid) for c in d.conditions],
                 "Allergies": [_allergy(a, pid) for a in d.allergies]}
        enc = None
        if d.doc_type == "discharge_summary" and (d.admission_date or d.discharge_date):
            enc = {"resourceType": "Encounter", "id": f"enc-{d.id}", "status": "finished", "subject": _ref("Patient", pid),
                   "class": {"system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "IMP",
                             "display": "inpatient encounter"},
                   "period": {"start": _iso(d.admission_date), "end": _iso(d.discharge_date)}}
            res.append(enc)
        res.append({"resourceType": "Composition", "id": f"doc-{d.id}", "status": "final",
                    "type": {"coding": [{"system": SNOMED, "code": code, "display": text}], "text": text},
                    "subject": _ref("Patient", pid), "date": _iso(d.doc_date or d.created_at),
                    "author": [{"display": d.practitioner or d.facility or "Unknown"}],
                    "custodian": {"display": d.facility} if d.facility else None,
                    "encounter": _ref("Encounter", f"enc-{d.id}") if enc else None,
                    "title": text,
                    "section": [{"title": t, "entry": [_ref(r["resourceType"], r["id"]) for r in rs]}
                                for t, rs in parts.items() if rs]})
        res.extend(r for rs in parts.values() for r in rs)
    return clean({"resourceType": "Bundle", "type": "collection",
                  "timestamp": datetime.now(timezone.utc).isoformat(),
                  "entry": [{"fullUrl": f"{r['resourceType']}/{r['id']}", "resource": r} for r in res]})
