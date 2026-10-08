"""End-to-end through the real ingestion pipeline with the LLM stubbed."""
import io
import uuid

from fastapi.testclient import TestClient
from fhir.resources.R4B.bundle import Bundle
from PIL import Image

from app.ingestion import graph, summarize
from app.ingestion.schemas import DocumentExtraction, Summary
from app.main import app

EXTRACTION = DocumentExtraction.model_validate({
    "doc_type": "lab_report", "doc_date": "2026-09-01", "patient_name": "Sunita Devi", "facility": "Lab X",
    "lab_results": [
        {"test_name": "Hemoglobin", "value": "10.8", "unit": "g/dL", "source_text": "Hb 10.8", "confidence": 0.9},
        {"test_name": "Potassium", "value": "6.9", "unit": "mmol/L", "source_text": "K 6.9", "confidence": 0.9}],
    "medications": [{"name": "Dolo-650", "dose_pattern": "1-0-1", "duration": "5 days",
                     "source_text": "Dolo 650 1-0-1 x5d", "confidence": 0.8}],
    "diagnoses": [{"name": "Anaemia", "source_text": "Anaemia", "confidence": 0.9}]})
SUMMARY = Summary(headline="Your blood test", key_points=["One value is low."], abnormal_explanations=[
    {"test": "Haemoglobin", "value": "10.8 g/dL", "status": "Low", "what_it_means": "Lower than usual.",
     "common_reasons": "Many things.", "question_for_doctor": "Why is it low?"},
    {"test": "Invented Test", "value": "1", "status": "High", "what_it_means": "x", "common_reasons": "x",
     "question_for_doctor": "x"}])


class FakeLLM:
    def __init__(self, out):
        self.out = out

    def invoke(self, *_):
        return self.out


def _png():
    buf = io.BytesIO()
    Image.new("RGB", (50, 50), "white").save(buf, "PNG")
    return buf.getvalue()


def _visit():
    return {"X-Visit": str(uuid.uuid4())}


def test_full_flow(monkeypatch):
    monkeypatch.setattr(graph, "structured", lambda *a: FakeLLM(EXTRACTION))
    monkeypatch.setattr(summarize, "structured", lambda *a: FakeLLM(SUMMARY))
    with TestClient(app, headers=_visit()) as c:
        assert c.post("/documents", files={"file": ("a.txt", b"x", "text/plain")}).status_code == 415

        r = c.post("/documents", files={"file": ("a.png", _png(), "image/png")})
        d = c.get(f"/documents/{r.json()['id']}").json()
        assert d["status"] == "done", d["extraction"]
        hb = next(o for o in d["observations"] if o["loinc_code"] == "718-7")
        assert hb["interpretation"] == "L"  # female range 12-15
        assert next(o for o in d["observations"] if o["display_name"] == "Potassium")["interpretation"] == "HH"
        assert d["medications"][0]["salt"] == "Paracetamol" and d["medications"][0]["per_day"] == 2

        tests = [e["test"] for e in d["summary"]["abnormal_explanations"]]
        assert tests[0] == "Potassium" and "Haemoglobin" in tests and "Invented Test" not in tests
        assert "contact a doctor promptly" in d["summary"]["abnormal_explanations"][0]["what_it_means"]

        assert c.get(f"/documents/{d['id']}/file").status_code == 200
        prof = c.get("/profile").json()
        assert prof["conditions"] == ["Anaemia"]
        kinds = {i["type"] for i in c.get("/profile/timeline").json()}
        assert {"document", "abnormal_result", "diagnosis", "medicine_started"} <= kinds
        only = c.get("/profile/timeline?types=diagnoses").json()
        assert {i["type"] for i in only} == {"diagnosis"}

        assert c.post("/abha/import").status_code == 409
        assert c.post("/abha/link", json={"abha": "bad"}).status_code == 422
        otp = c.post("/abha/link", json={"abha": "12-3456-7890-1234"}).json()["demo_otp"]
        assert c.post("/abha/verify", json={"otp": "000000"}).status_code == 401
        assert c.post("/abha/verify", json={"otp": otp}).status_code == 200
        assert len(c.post("/abha/import").json()["imported_document_ids"]) == 2
        assert c.post("/abha/import").json()["imported_document_ids"] == []  # idempotent
        assert any(i["source"] == "abdm" for i in c.get("/profile/timeline").json())

        Bundle.model_validate(c.get("/profile/fhir").json())
        assert c.delete("/profile").status_code == 204
        assert c.get("/documents").json() == []  # data gone; a fresh demo profile is recreated


def test_extraction_failure_marks_failed(monkeypatch):
    calls = []

    class Boom(FakeLLM):
        def invoke(self, *_):
            calls.append(1)
            raise RuntimeError("api down")
    monkeypatch.setattr(graph, "structured", lambda *a: Boom(None))
    with TestClient(app, headers=_visit()) as c:
        r = c.post("/documents", files={"file": ("a.png", _png(), "image/png")})
        d = c.get(f"/documents/{r.json()['id']}").json()
        assert d["status"] == "failed" and "api down" in d["extraction"]["_error"]
        assert len(calls) == 2  # one retry, then give up


def test_digital_pdf_skips_images_and_pretranslates(monkeypatch):
    import pymupdf
    pdf = pymupdf.open()
    pdf.new_page().insert_textbox(pymupdf.Rect(72, 72, 520, 700), "Hemoglobin 10.8 g/dL reference 12-15 " * 10)  # digital page
    pdf.new_page()  # blank page stands in for a scan
    sent = {}

    class Spy(FakeLLM):
        def invoke(self, msgs):
            sent["kinds"] = [b["type"] for b in msgs[0].content]
            return self.out
    monkeypatch.setattr(graph, "structured", lambda *a: Spy(EXTRACTION))
    monkeypatch.setattr(summarize, "structured", lambda *a: FakeLLM(SUMMARY))
    with TestClient(app, headers=_visit()) as c:
        c.put("/profile", json={"preferred_language": "hi"})
        r = c.post("/documents", files={"file": ("a.pdf", pdf.tobytes(), "application/pdf")})
        d = c.get(f"/documents/{r.json()['id']}").json()
        assert d["status"] == "done" and sent["kinds"] == ["text", "image"]  # only the blank page went as an image
        doc = summarize.SessionLocal().get(summarize.Document, d["id"])
        assert "hi" in doc.summary_i18n  # ready before the reader asks
        c.delete("/profile")


def test_visitors_are_isolated():
    with TestClient(app, headers=_visit()) as a, TestClient(app, headers=_visit()) as b:  # separate tabs
        a.put("/profile", json={"name": "Alice"})
        assert a.get("/profile").json()["name"] == "Alice"
        assert b.get("/profile").json()["name"] == "Guest"
