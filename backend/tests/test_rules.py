from datetime import date

import pytest

from app.ingestion.normalize import normalize_lab, normalize_medication, normalize_record, parse_range
from app.rules import dosage, formulary, lab_catalog as labs, safety_text


@pytest.mark.parametrize("p,per_day,timing", [
    ("1-0-1", 2, "morning, night"), ("1-1-1", 3, "morning, afternoon, night"), ("1-0-0", 1, "morning"),
    ("TDS", 3, None), ("BD", 2, None), ("OD", 1, None), ("QID", 4, None), ("HS", 1, "night"),
    ("½-0-½", 2, "morning, night"), ("सुबह-शाम", 2, "morning, evening"),
    ("1-0-1 खाने के बाद", 2, "morning, night, after food"), (None, None, None),
])
def test_dose(p, per_day, timing):
    r = dosage.parse_dose(p)
    assert (r["per_day"], r["timing"]) == (per_day, timing)


def test_dose_as_needed():
    assert dosage.parse_dose("SOS")["as_needed"] and dosage.parse_dose("PRN")["as_needed"]


@pytest.mark.parametrize("t,d", [("5 days", 5), ("2 weeks", 14), ("1 month", 30), ("continue", None),
                                 ("३ दिन", 3), ("10 din", 10), (None, None)])
def test_duration(t, d):
    assert dosage.parse_duration_days(t) == d


def test_interpret_levels():
    f = labs.interpret
    assert f(10, 12, 15) == "L" and f(13, 12, 15) == "N" and f(16, 12, 15) == "H"
    assert f(6, 12, 15, 7, 20) == "LL" and f(21, 12, 15, 7, 20) == "HH"
    assert f(5, None, None) is None and f(5, None, 10) == "N"


def test_find_alias_and_fuzzy():
    assert labs.find("HbA1c")["loinc"] == "4548-4"
    assert labs.find("Glycated Hb")["loinc"] == "4548-4"
    assert labs.find("Haemoglobn")["loinc"] == "718-7"  # typo
    assert labs.find("Banana Level") is None


def test_unit_conversion_and_catalog_range():
    o = normalize_lab({"test_name": "Fasting Blood Sugar", "value": "7.8", "unit": "mmol/L"}, "male")
    assert o["unit"] == "mg/dL" and o["value_num"] == 140.4 and o["interpretation"] == "H"


def test_report_range_beats_catalog_and_is_converted():
    # report says 3.9-5.5 mmol/L; value 7.8 mmol/L -> High against the report's own range
    o = normalize_lab({"test_name": "Fasting Glucose", "value": "7.8", "unit": "mmol/L", "ref_range": "3.9 - 5.5"}, "male")
    assert o["ref_low"] == 70.2 and o["interpretation"] == "H"


def test_sex_specific_range():
    lab = {"test_name": "Hemoglobin", "value": "12.5", "unit": "g/dL"}
    assert normalize_lab(lab, "male")["interpretation"] == "L"
    assert normalize_lab(lab, "female")["interpretation"] == "N"


def test_implausible_value_not_interpreted():
    o = normalize_lab({"test_name": "Haemoglobin", "value": "108", "unit": "g/dL"}, "male")
    assert o["interpretation"] is None and "check original" in o["note"]


def test_text_value_and_unmapped_test():
    o = normalize_lab({"test_name": "Dengue NS1", "value": "Positive"}, None)
    assert o["value_text"] == "Positive" and o["value_num"] is None and o["loinc_code"] is None
    assert normalize_lab({"test_name": "Mystery", "value": "5"}, None)["interpretation"] is None


def test_unknown_unit_without_report_range_not_interpreted():
    o = normalize_lab({"test_name": "Fasting Glucose", "value": "7", "unit": "furlongs"}, None)
    assert o["interpretation"] is None and "not recognised" in o["note"]


def test_critical_flag():
    assert normalize_lab({"test_name": "Potassium", "value": "6.8", "unit": "mmol/L"}, None)["interpretation"] == "HH"


@pytest.mark.parametrize("t,r", [("12.0 - 15.0", (12, 15)), ("< 200", (None, 200)), ("> 40", (40, None)),
                                 ("70-99 mg/dL", (70, 99)), ("Negative", (None, None))])
def test_parse_range(t, r):
    assert parse_range(t) == r


def test_formulary():
    assert formulary.match("Dolo-650 Tab")["salts"] == "Paracetamol"
    assert formulary.match("Pantop40")["brand"] == "Pantop 40"
    assert formulary.match("Zzzqx") is None


def test_medication_normalize():
    m = normalize_medication({"name": "Dolo 650", "dose_pattern": "1-0-1", "timing": "after food",
                              "duration": "5 days", "confidence": 0.9}, date(2026, 1, 1), "Dr X")
    assert (m["per_day"], m["duration_days"], m["end_date"]) == (2, 5, date(2026, 1, 6))
    assert m["timing"] == "morning, night, after food" and m["salt"] == "Paracetamol"
    assert normalize_medication({"name": "X", "confidence": 1}, None, None)["timing"] is None  # no crash


def test_record_warnings():
    ex = {"doc_type": "lab_report", "doc_date": "2099-01-01", "patient_name": "Mr. Ramesh Kumar", "lab_results": []}
    rec, w = normalize_record(ex, "Sunita Devi", date(1990, 1, 1), "female", today=date(2026, 10, 7))
    assert rec["doc_date"] is None and len(w) == 2
    ok, w = normalize_record({"doc_type": "other", "doc_date": "07/10/2026", "patient_name": "Dr. Sunita Devi"},
                             "Sunita Devi", None, None, today=date(2026, 10, 7))
    assert ok["doc_date"] == date(2026, 10, 7) and w == []


@pytest.mark.parametrize("bad", ["You have diabetes.", "Stop taking your tablets", "increase your dose a little",
                                 "No need to see a doctor", "This will cure it"])
def test_safety_catches(bad):
    assert safety_text.check(bad)


def test_safety_passes_and_nested():
    assert safety_text.check({"a": ["Your HbA1c is higher than the usual range."]}) == []
    assert safety_text.check({"a": [{"b": "you have diabetes"}]})


def test_same_person_tolerates_titles_order_and_spelling():
    from app.ingestion.normalize import same_person
    assert same_person("Smt. Devi Sunita", "Sunita Devi") and same_person("Sunitha Devi", "Sunita Devi")
    assert same_person("Sunita", "Sunita Devi") and not same_person("Mr. Ramesh Kumar", "Sunita Devi")
