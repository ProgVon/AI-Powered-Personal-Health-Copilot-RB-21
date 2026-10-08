"""Synthetic test documents + their gold labels, generated from one source so they can't drift apart.

Writes eval/gold/<name>.pdf|jpg and eval/gold/<name>.json. All patients, doctors and labs are fictional.
Run from backend/:  python -m eval.make_samples
"""
import json
import random
from pathlib import Path

import pymupdf
from PIL import Image, ImageFilter

GOLD = Path(__file__).parent / "gold"
FONTS = "/System/Library/Fonts/Supplemental"  # ponytail: macOS font path; point at any Devanagari TTF elsewhere

CSS = """
@font-face { font-family: deva; src: url(DevanagariMT.ttc); }
* { font-family: sans-serif, deva; font-size: 10pt; }
h1 { font-size: 15pt; margin: 0; } .sub { color: #555; font-size: 8.5pt; }
table { border-collapse: collapse; width: 100%; margin-top: 6px; }
th, td { border-bottom: 1px solid #bbb; padding: 3px 4px; text-align: left; }
th { background: #e8eef5; } .hi { font-weight: bold; } .box { border: 1px solid #888; padding: 6px; margin: 6px 0; }
"""


def lab(name, value, unit, ref, flag=None):
    return {"test_name": name, "value": value, "unit": unit, "ref_range": ref, "flag_on_report": flag}


def med(name, strength, dose, duration, timing=None):
    return {"name": name, "strength": strength, "dose_pattern": dose, "duration": duration, "timing": timing}


DOCS = [
    dict(file="cbc_report.pdf", category="printed", doc_type="lab_report", doc_date="2026-08-14",
         patient_name="Meera Iyer", sex="female", age=34, facility="Sunrise Diagnostics, Pune", practitioner="Dr. A. Kulkarni",
         lab_results=[lab("Haemoglobin", "10.2", "g/dL", "12.0 - 15.0", "L"),
                      lab("Total Leucocyte Count", "7800", "/cumm", "4000 - 11000"),
                      lab("RBC Count", "3.9", "millions/cumm", "4.1 - 5.1", "L"),
                      lab("PCV", "32.5", "%", "36 - 46", "L"),
                      lab("MCV", "78", "fL", "80 - 100", "L"),
                      lab("Platelet Count", "2.4", "lakhs/cumm", "1.5 - 4.5"),
                      lab("ESR", "28", "mm/hr", "0 - 20", "H")]),
    dict(file="lipid_thyroid_scan.jpg", category="printed", doc_type="lab_report", doc_date="2026-07-02",
         patient_name="Rajesh Verma", sex="male", age=52, facility="CarePlus Labs, Lucknow", practitioner="Dr. S. Khan",
         lab_results=[lab("Total Cholesterol", "246", "mg/dL", "< 200", "H"),
                      lab("Triglycerides", "210", "mg/dL", "< 150", "H"),
                      lab("HDL Cholesterol", "38", "mg/dL", "> 40", "L"),
                      lab("LDL Cholesterol", "166", "mg/dL", "< 100", "H"),
                      lab("TSH", "7.9", "uIU/mL", "0.4 - 4.0", "H"),
                      lab("Free T4", "0.9", "ng/dL", "0.8 - 1.8")]),
    dict(file="kft_critical.pdf", category="printed", doc_type="lab_report", doc_date="2026-09-21",
         patient_name="Gopal Reddy", sex="male", age=67, facility="Apex Pathology, Hyderabad", practitioner="Dr. P. Rao",
         lab_results=[lab("Serum Creatinine", "2.9", "mg/dL", "0.7 - 1.3", "H"),
                      lab("Blood Urea", "92", "mg/dL", "15 - 45", "H"),
                      lab("Serum Sodium", "131", "mEq/L", "135 - 145", "L"),
                      lab("Serum Potassium", "6.8", "mEq/L", "3.5 - 5.1", "H"),
                      lab("Uric Acid", "7.6", "mg/dL", "3.4 - 7.0", "H"),
                      lab("Fasting Blood Sugar", "142", "mg/dL", "70 - 99", "H"),
                      lab("HbA1c", "7.8", "%", "4.0 - 5.6", "H")]),
    dict(file="diabetes_prescription.pdf", category="printed", doc_type="prescription", doc_date="2026-09-03",
         patient_name="Sunita Sharma", sex="female", age=58, facility="Shanti Clinic, Jaipur", practitioner="Dr. R. K. Mehta",
         diagnoses=[{"name": "Type 2 Diabetes Mellitus"}, {"name": "Hypertension"}], allergies=["Sulfa drugs"],
         medications=[med("Glycomet GP 1", "500 mg + 1 mg", "1-0-1", "30 days", "after food"),
                      med("Telma 40", "40 mg", "1-0-0", "30 days", "before breakfast"),
                      med("Atorva 10", "10 mg", "0-0-1", "30 days", "after dinner"),
                      med("Ecosprin 75", "75 mg", "0-1-0", "30 days", "after lunch")],
         follow_up="Review after 1 month with FBS, PPBS, HbA1c"),
    dict(file="fever_prescription_bilingual.jpg", category="bilingual", doc_type="prescription", doc_date="2026-08-29",
         patient_name="Aman Gupta", sex="male", age=27, facility="Jeevan Clinic, Indore", practitioner="Dr. N. Joshi",
         diagnoses=[{"name": "Acute Pharyngitis"}],
         medications=[med("Dolo 650", "650 mg", "1-1-1", "3 days", "खाने के बाद"),
                      med("Azithral 500", "500 mg", "1-0-0", "3 days", "खाने के बाद"),
                      med("Pan 40", "40 mg", "1-0-0", "5 days", "खाली पेट"),
                      med("Cetzine", "10 mg", "0-0-1", "5 days", "रात को")],
         follow_up="3 दिन बाद दिखाएँ / Review after 3 days"),
    dict(file="dengue_discharge_summary.pdf", category="printed", doc_type="discharge_summary", doc_date="2026-09-12",
         patient_name="Priya Nair", sex="female", age=29, facility="City General Hospital, Bengaluru", practitioner="Dr. V. Menon",
         admission_date="2026-09-08", discharge_date="2026-09-12",
         diagnoses=[{"name": "Dengue fever with thrombocytopenia"}], allergies=["Penicillin"],
         lab_results=[lab("Platelet Count", "38000", "/cumm", "150000 - 450000", "L"),
                      lab("Haematocrit", "44", "%", "36 - 46"),
                      lab("SGPT", "96", "U/L", "7 - 55", "H")],
         medications=[med("Dolo 650", "650 mg", "SOS", "5 days", "if fever above 100°F"),
                      med("Pan 40", "40 mg", "1-0-0", "5 days", "before breakfast"),
                      med("Becosules", None, "0-1-0", "15 days", "after lunch")],
         follow_up="Repeat CBC after 3 days. Return immediately if bleeding, severe abdominal pain or vomiting."),
]


def dmy(iso):
    return "/".join(reversed(iso.split("-")))


def header(d):
    return (f"<h1>{d['facility']}</h1><div class='sub'>Sample document · fictional, for testing only</div>"
            f"<div class='box'>Patient: <b>{d['patient_name']}</b> &nbsp; Age/Sex: {d['age']}/{d['sex'][0].upper()} &nbsp; "
            f"Date: {dmy(d['doc_date'])} &nbsp; Ref. by: {d['practitioner']}</div>")


def html(d):
    h = header(d)
    if d["doc_type"] == "discharge_summary":
        h += (f"<h1>DISCHARGE SUMMARY</h1><p>Date of admission: {dmy(d['admission_date'])} &nbsp; "
              f"Date of discharge: {dmy(d['discharge_date'])}</p>"
              f"<p><b>Final diagnosis:</b> {d['diagnoses'][0]['name']}</p><p><b>Known allergies:</b> {', '.join(d['allergies'])}</p>"
              "<p><b>Course in hospital:</b> Admitted with 4 days of high-grade fever, body ache and retro-orbital pain. "
              "NS1 antigen positive. Managed with IV fluids and supportive care. Platelets recovered to 92000/cumm "
              "on day of discharge. Afebrile for 48 hours.</p><p><b>Investigations at admission:</b></p>")
    if d.get("lab_results"):
        h += "<table><tr><th>Test</th><th>Result</th><th>Unit</th><th>Biological Ref. Interval</th></tr>"
        for r in d["lab_results"]:
            f = r["flag_on_report"]
            h += (f"<tr><td>{r['test_name']}</td><td{' class=hi' if f else ''}>{r['value']}{f' {f}' if f else ''}</td>"
                  f"<td>{r['unit']}</td><td>{r['ref_range']}</td></tr>")
        h += "</table>"
    if d["doc_type"] == "prescription":
        h += f"<p><b>Diagnosis:</b> {', '.join(x['name'] for x in d['diagnoses'])}</p>"
        if d.get("allergies"):
            h += f"<p><b>Allergy:</b> {', '.join(d['allergies'])}</p>"
        h += "<p style='font-size:16pt'><b>℞</b></p>"
    if d.get("medications"):
        if d["doc_type"] == "discharge_summary":
            h += "<p><b>Medicines on discharge:</b></p>"
        h += "<table><tr><th>Medicine</th><th>Strength</th><th>Dose</th><th>When</th><th>Duration</th></tr>"
        for m in d["medications"]:
            h += (f"<tr><td>{m['name']}</td><td>{m['strength'] or ''}</td><td>{m['dose_pattern']}</td>"
                  f"<td>{m['timing'] or ''}</td><td>{m['duration']}</td></tr>")
        h += "</table>"
    if d.get("follow_up"):
        h += f"<p><b>Advice / Follow-up:</b> {d['follow_up']}</p>"
    return h + f"<p style='margin-top:30px'>— {d['practitioner']}</p>"


def render(d, out: Path):
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)  # A4
    page.insert_htmlbox(page.rect + (40, 40, -40, -40), html(d), css=CSS, archive=pymupdf.Archive(FONTS))
    if out.suffix == ".pdf":
        doc.save(out)
        return
    # "phone photo": no text layer, slight tilt, warm paper, blur and noise, so the vision path is exercised
    pix = page.get_pixmap(dpi=150)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    img = img.rotate(random.uniform(-2.5, 2.5), expand=True, fillcolor=(235, 228, 210), resample=Image.BICUBIC)
    tint = Image.new("RGB", img.size, (250, 240, 215))
    img = Image.blend(img, tint, 0.18).filter(ImageFilter.GaussianBlur(0.7))
    noise = Image.effect_noise(img.size, 18).convert("RGB")
    Image.blend(img, noise, 0.06).save(out, quality=80)


def main():
    random.seed(7)
    GOLD.mkdir(exist_ok=True)
    for d in DOCS:
        out = GOLD / d["file"]
        render(d, out)
        out.with_suffix(".json").write_text(json.dumps({k: v for k, v in d.items() if k not in ("file", "age")}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("wrote", out.name)


if __name__ == "__main__":
    main()
