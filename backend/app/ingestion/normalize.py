"""The accuracy layer: pure Python, no LLM. Everything medical that must be exactly right happens here."""
import re
from datetime import date, timedelta
from difflib import SequenceMatcher

from ..rules import dosage, formulary, lab_catalog as labs

NUM = r"-?\d+(?:\.\d+)?"
TITLES = re.compile(r"\b(mr|mrs|ms|miss|dr|smt|shri|shrimati|master|baby)\b\.?", re.I)


def same_person(a: str, b: str) -> bool:
    """Names match if one's words contain the other's, or they're close once titles are dropped and words sorted."""
    wa, wb = (set(TITLES.sub("", x).lower().replace(".", " ").split()) for x in (a, b))
    return not wa or not wb or wa <= wb or wb <= wa or \
        SequenceMatcher(None, " ".join(sorted(wa)), " ".join(sorted(wb))).ratio() >= 0.7


def parse_date(s: str | None) -> date | None:
    if not s:
        return None
    s = s.strip()
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        pass
    m = re.fullmatch(r"(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})", s)  # Indian DD/MM/YYYY
    try:
        return date(int(m[3]), int(m[2]), int(m[1])) if m else None
    except ValueError:
        return None


def parse_num(s: str) -> float | None:
    s = s.strip().replace(",", "")
    return float(s) if re.fullmatch(NUM, s) else None


def parse_range(text: str | None) -> tuple[float | None, float | None]:
    """'12.0 - 15.0' -> (12, 15); '< 200' -> (None, 200); '> 40' -> (40, None)."""
    if not text:
        return None, None
    t = text.replace(",", "")
    if m := re.search(rf"({NUM})\s*(?:-|–|to)\s*({NUM})", t):
        return float(m[1]), float(m[2])
    if m := re.search(rf"(?:<=?|up\s*to|upto)\s*({NUM})", t, re.I):
        return None, float(m[1])
    if m := re.search(rf"(?:>=?)\s*({NUM})", t):
        return float(m[1]), None
    return None, None


def _scale(x: float | None, f: float) -> float | None:
    return None if x is None else round(x * f, 4)


def normalize_lab(lab: dict, sex: str | None) -> dict:
    row = labs.find(lab["test_name"])
    raw_val, unit = lab["value"].strip(), lab.get("unit")
    num = parse_num(raw_val)
    obs = {"loinc_code": row["loinc"] if row else None,
           "display_name": row["canonical_name"] if row else lab["test_name"],
           "value_num": num, "value_text": None if num is not None else raw_val, "unit": unit,
           "ref_low": None, "ref_high": None, "interpretation": None, "note": None,
           "confidence": lab.get("confidence"), "explainer": row["explainer"] if row else None}
    if num is None:
        return obs
    factor = labs.unit_factor(row, unit) if row else 1.0
    if factor is not None and row:
        obs["value_num"], obs["unit"] = round(num * factor, 4), row["canonical_unit"]
    # reference range: the report's own first (labs differ), then the catalog's by sex
    lo, hi = parse_range(lab.get("ref_range"))
    from_report = lo is not None or hi is not None
    if from_report:
        f = factor if factor is not None else 1.0  # range is in the report's unit
        lo, hi = _scale(lo, f), _scale(hi, f)
    elif row and factor is not None:
        lo, hi = labs.catalog_range(row, sex)
    obs["ref_low"], obs["ref_high"] = lo, hi
    if row and factor is None and not from_report:
        obs["note"] = f"Unit '{unit}' not recognised - check original report"
        return obs
    if row and factor is not None and not row["plausible_min"] <= obs["value_num"] <= row["plausible_max"]:
        obs["note"] = "Value looks implausible - check original report"
        return obs
    crit = (row["critical_low"], row["critical_high"]) if row and factor is not None else (None, None)
    obs["interpretation"] = labs.interpret(obs["value_num"], lo, hi, *crit)
    return obs


def normalize_medication(m: dict, start: date | None, prescriber: str | None) -> dict:
    hit = formulary.match(m["name"])
    parsed = dosage.parse_dose(m.get("dose_pattern"))
    food = dosage.food_timing(m.get("timing"))
    extra = food if food and food not in (parsed["timing"] or "") else None
    timing = ", ".join(x for x in [parsed["timing"], extra] if x) or None
    days = dosage.parse_duration_days(m.get("duration"))
    return {"brand_name": hit["brand"] if hit else m["name"], "salt": hit["salts"] if hit else None,
            "strength": m.get("strength") or (hit["strength"] if hit else None) or None,
            "form": m.get("form") or (hit["form"] if hit else None),
            "dose_pattern": m.get("dose_pattern"), "per_day": parsed["per_day"], "timing": timing,
            "as_needed": parsed["as_needed"], "duration_days": days, "start_date": start,
            "end_date": start + timedelta(days=days) if start and days else None,
            "prescriber": prescriber, "confidence": m.get("confidence")}


def normalize_record(ex: dict, name: str, dob: date | None, sex: str | None,
                     today: date | None = None) -> tuple[dict, list[str]]:
    today, warnings = today or date.today(), []

    def check_date(label: str, s: str | None) -> date | None:
        d = parse_date(s)
        if s and d is None:
            warnings.append(f"Could not read the {label} ('{s}').")
        elif d and (d > today or (dob and d < dob)):
            warnings.append(f"The {label} ({d}) looks wrong - check the original.")
            return None
        return d

    doc_date = check_date("document date", ex.get("doc_date"))
    adm, dis = check_date("admission date", ex.get("admission_date")), check_date("discharge date", ex.get("discharge_date"))
    pn = ex.get("patient_name")
    if pn and not same_person(pn, name):
        warnings.append(f"This report seems to be for {pn}.")
    record = {
        "doc_type": ex["doc_type"], "doc_date": doc_date, "facility": ex.get("facility"),
        "practitioner": ex.get("practitioner"), "admission_date": adm, "discharge_date": dis,
        "observations": [dict(normalize_lab(l, sex), effective_at=doc_date) for l in ex.get("lab_results", [])],
        "medications": [normalize_medication(m, doc_date, ex.get("practitioner")) for m in ex.get("medications", [])],
        "conditions": [{"name": d["name"], "recorded_at": doc_date} for d in ex.get("diagnoses", [])],
        "allergies": [{"substance": a, "reaction": None} for a in ex.get("allergies", [])],
        "impression": ex.get("impression"), "follow_up": ex.get("follow_up"),
    }
    return record, warnings


def normalize(state):
    from ..db import SessionLocal
    from ..models import Profile

    with SessionLocal() as db:
        p = db.get(Profile, state["profile_id"])
        name, dob, sex = p.name, p.dob, p.sex
    record, warnings = normalize_record(state["extraction"], name, dob, sex)
    return {"record": record, "warnings": warnings}
