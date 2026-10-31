"""End-to-end through the real ingestion pipeline with the LLM stubbed."""
import io
import time
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from fhir.resources.R4B.bundle import Bundle
from PIL import Image
from sqlalchemy import func, select

from app import auth
from app.config import settings
from app.ingestion import graph, summarize
from app.ingestion.normalize import normalize_record
from app.ingestion.schemas import DocumentExtraction, Summary
from app.main import app, lifespan
from app.models import Allergy, Condition, Document, Medication, Observation
from app.routers import documents

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


SENT = {}
auth.send_otp = lambda email, code: SENT.__setitem__(email, code)  # capture OTPs instead of emailing


def _visit():
    """Sign up a fresh user and return its auth header."""
    name = "u" + uuid.uuid4().hex[:12]
    with TestClient(app) as c:
        c.post("/auth/signup", json={"username": name, "email": f"{name}@x.com", "password": "password1"})
        token = c.post("/auth/verify", json={"email": f"{name}@x.com", "otp": SENT[f"{name}@x.com"]}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_auth_flow():
    with TestClient(app) as c:
        assert c.get("/profile").status_code == 401
        assert c.get("/profile", headers={"Authorization": "Bearer junk"}).status_code == 401
        body = {"username": "ann_1", "email": "Ann@X.com", "password": "password1"}
        assert c.post("/auth/signup", json=body).status_code == 200
        first = SENT["ann@x.com"]
        assert c.post("/auth/signup", json={**body, "username": "other"}).json() == {"email": "ann@x.com"}  # looks new
        assert SENT["ann@x.com"] == first  # but no new code: the owner gets an "already registered" note instead
        assert c.post("/auth/signup", json={**body, "email": "new@x.com"}).status_code == 409  # username taken
        assert c.post("/auth/signup", json={**body, "username": "ANN_1", "email": "new@x.com"}).status_code == 409
        assert c.post("/auth/signup", json={**body, "password": "short"}).status_code == 422
        assert c.post("/auth/verify", json={"email": "ann@x.com", "otp": f"{(int(SENT['ann@x.com']) + 1) % 10**6:06d}"}).status_code == 401
        token = c.post("/auth/verify", json={"email": "ann@x.com", "otp": SENT["ann@x.com"]}).json()["token"]
        assert c.post("/auth/verify", json={"email": "ann@x.com", "otp": SENT["ann@x.com"]}).status_code == 401  # one use
        assert c.get("/profile", headers={"Authorization": f"Bearer {token}"}).json()["name"] == "ann_1"

        assert c.post("/auth/login", json={"login": "ann_1", "password": "wrong-pass"}).status_code == 401
        assert c.post("/auth/login", json={"login": "nobody", "password": "password1"}).status_code == 401
        assert c.post("/auth/login", json={"login": "ANN@x.com", "password": "password1"}).status_code == 429  # right, but resend too soon
        assert c.post("/auth/login", json={"login": "Ann_1", "password": "password1"}).status_code == 429  # any case


def test_password_reset(monkeypatch):
    from datetime import timedelta
    from app.routers import auth as auth_router
    monkeypatch.setattr(auth_router, "RESEND_AFTER", timedelta(0))
    with TestClient(app) as c:
        c.post("/auth/signup", json={"username": "rita", "email": "rita@x.com", "password": "old-password"})
        old = {"Authorization": "Bearer " + c.post("/auth/verify", json={"email": "rita@x.com", "otp": SENT["rita@x.com"]}).json()["token"]}
        assert c.get("/profile", headers=old).status_code == 200
        assert c.post("/auth/forgot", json={"email": "ghost@x.com"}).json() == {"email": "ghost@x.com"}  # no leak
        assert "ghost@x.com" not in SENT
        c.post("/auth/forgot", json={"email": "rita@x.com"})
        code = SENT["rita@x.com"]
        wrong = f"{(int(code) + 1) % 10**6:06d}"
        assert c.post("/auth/reset/check", json={"email": "rita@x.com", "otp": wrong}).status_code == 401
        assert c.post("/auth/reset", json={"email": "rita@x.com", "otp": wrong, "password": "new-password"}).status_code == 401
        for _ in range(2):  # 2 wrong guesses above + 2 = 4 used; the right code must still pass twice
            c.post("/auth/reset/check", json={"email": "rita@x.com", "otp": wrong})
        assert c.post("/auth/reset/check", json={"email": "rita@x.com", "otp": code}).status_code == 200
        assert c.post("/auth/reset", json={"email": "rita@x.com", "otp": code, "password": "new-password"}).json() == {"ok": True}
        assert c.get("/profile", headers=old).status_code == 401  # every earlier session is logged out
        assert c.post("/auth/reset", json={"email": "rita@x.com", "otp": code, "password": "again-pass"}).status_code == 401  # used
        assert c.post("/auth/login", json={"login": "rita", "password": "old-password"}).status_code == 401
        assert c.post("/auth/login", json={"login": "rita", "password": "new-password"}).status_code == 200


def test_full_flow(monkeypatch):
    monkeypatch.setattr(graph, "structured", lambda *a: FakeLLM(EXTRACTION))
    monkeypatch.setattr(summarize, "structured", lambda *a: FakeLLM(SUMMARY))
    with TestClient(app, headers=_visit()) as c:
        assert c.post("/documents", files={"file": ("a.txt", b"x", "text/plain")}).status_code == 415
        big = b"0" * (documents.MAX_BYTES + 1)
        assert c.post("/documents", files={"file": ("a.png", big, "image/png")}).status_code == 413

        r = c.post("/documents", files={"file": ("a.png", _png(), "image/png")})
        d = c.get(f"/documents/{r.json()['id']}").json()
        assert d["status"] == "done", d["extraction"]
        hb = next(o for o in d["observations"] if o["loinc_code"] == "718-7")
        assert hb["interpretation"] == "L"  # 10.8 is low for either sex
        assert not any("seems to be for" in w for w in d["extraction"]["_warnings"])  # name is still the username
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
        assert c.post("/abha/verify", json={"otp": "000000"}).status_code == 400
        assert c.post("/abha/verify", json={"otp": otp}).status_code == 200
        assert len(c.post("/abha/import").json()["imported_document_ids"]) == 2
        assert c.post("/abha/import").json()["imported_document_ids"] == []  # idempotent
        assert any(i["source"] == "abdm" for i in c.get("/profile/timeline").json())

        Bundle.model_validate(c.get("/profile/fhir").json())
        pid = summarize.SessionLocal().get(summarize.Document, d["id"]).profile_id
        assert c.delete("/profile").status_code == 204
        assert c.get("/documents").status_code == 401  # account gone
        assert not (Path(settings.STORAGE_DIR) / str(d["id"])).exists()  # uploaded scan gone
        with summarize.SessionLocal() as db:  # and every clinical row
            for m in (Document, Observation, Medication, Condition, Allergy):
                assert not db.scalar(select(func.count()).select_from(m).where(m.profile_id == pid))


def test_newer_normal_result_clears_old_abnormal(monkeypatch):
    later = EXTRACTION.model_copy(update={"doc_date": "2026-10-01", "lab_results": [EXTRACTION.lab_results[0].model_copy(
        update={"value": "14.0"})], "medications": []})
    monkeypatch.setattr(summarize, "structured", lambda *a: FakeLLM(SUMMARY))
    unreadable = later.model_copy(update={"doc_date": "2026-10-10", "lab_results": [EXTRACTION.lab_results[1].model_copy(
        update={"value": "haemolysed"})]})
    with TestClient(app, headers=_visit()) as c:
        for ex in (later, EXTRACTION, unreadable):  # upload order must not matter, only the report dates
            monkeypatch.setattr(graph, "structured", lambda *a, ex=ex: FakeLLM(ex))
            c.post("/documents", files={"file": ("a.png", _png(), "image/png")})
        # Hb: normal later clears the low one; Potassium: an unreadable later value must not hide the critical one
        assert [a["test"] for a in c.get("/profile").json()["latest_abnormal"]] == ["Potassium"]
        c.delete("/profile")


def test_login_prefers_exact_username_over_old_case_twin():
    with TestClient(app) as c:
        c.post("/auth/signup", json={"username": "bobby", "email": "bobby@x.com", "password": "password1"})
        with summarize.SessionLocal() as db:  # signup no longer allows this pair, but older databases may have it
            u = auth.User()
            u.profile = auth.Profile(name="Bobby")
            u.account = auth.Account(username="Bobby", email="bobby2@x.com", password_hash=auth.hash_password("other-pass"))
            db.add(u)
            db.commit()
        assert c.post("/auth/login", json={"login": "bobby", "password": "password1"}).status_code != 401
        assert c.post("/auth/login", json={"login": "Bobby", "password": "other-pass"}).status_code != 401


def test_summary_without_llm_keeps_critical_warning(monkeypatch):
    def down(*_):
        raise RuntimeError("api down")
    monkeypatch.setattr(summarize, "structured", down)
    out = summarize.build_summary(normalize_record(EXTRACTION.model_dump(), "", None, None)[0])
    k = next(e for e in out["abnormal_explanations"] if e["test"] == "Potassium")
    assert k["what_it_means"] == summarize.CRITICAL_MSG
    assert len(out["abnormal_explanations"]) == 2  # Potassium once, plus Haemoglobin


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
        assert d["status"] == "failed" and "api down" in d["extraction"]["_error"] and not d["extraction"]["_busy"]
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
        assert b.get("/profile").json()["name"] != "Alice"


def test_otp_and_rate_limits(monkeypatch):
    from datetime import timedelta
    from app.routers import auth as auth_router
    monkeypatch.setattr(auth_router, "RESEND_AFTER", timedelta(0))
    with TestClient(app) as c:
        c.post("/auth/signup", json={"username": "tom", "email": " Tom@X.com ", "password": "password1"})  # trimmed
        code = SENT["tom@x.com"]
        wrong = f"{(int(code) + 1) % 10**6:06d}"
        for _ in range(5):
            assert c.post("/auth/verify", json={"email": "tom@x.com", "otp": wrong}).json()["detail"] == "Wrong code"
        assert c.post("/auth/verify", json={"email": "tom@x.com", "otp": code}).status_code == 401  # tries used up

        auth_router._hits.clear()
        for _ in range(5):
            c.post("/auth/login", json={"login": "tom", "password": "bad-guess"})
        assert c.post("/auth/login", json={"login": "tom", "password": "password1"}).status_code == 429

        auth_router._hits.update({f"ip:{i}": [time.monotonic()] for i in range(50_001)})  # a spoofed-IP flood
        assert c.post("/auth/login", json={"login": "tom", "password": "password1"}).status_code == 429  # still blocked

        auth_router._hits.clear()
        monkeypatch.setattr(auth_router, "RESEND_AFTER", timedelta(hours=1))
        assert c.post("/auth/forgot", json={"email": "tom@x.com"}).status_code == 200
        assert c.post("/auth/forgot", json={"email": "tom@x.com"}).status_code == 200  # the hidden 429 doesn't leak


def test_failed_email_keeps_no_account(monkeypatch):
    def boom(*_):
        raise OSError("smtp down")
    with TestClient(app) as c:
        monkeypatch.setattr(auth, "send_otp", boom)
        body = {"username": "sam", "email": "sam@x.com", "password": "password1"}
        assert c.post("/auth/signup", json=body).status_code == 502
        monkeypatch.undo()
        assert c.post("/auth/signup", json=body).status_code == 200  # not "already registered"


def test_send_mail_uses_brevo_when_keyed(monkeypatch):
    import json
    import urllib.request
    sent = {}

    class Resp:
        def close(self):
            pass

    def fake_urlopen(req, timeout):
        sent.update(url=req.full_url, key=req.get_header("Api-key"), body=json.loads(req.data))
        return Resp()
    monkeypatch.setattr(settings, "BREVO_API_KEY", "xkeysib-test")
    monkeypatch.setattr(settings, "SMTP_FROM", "Health Copilot <me@gmail.com>")
    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    auth.send_mail("ann@x.com", "Hi", "code 123456")
    assert sent["url"] == "https://api.brevo.com/v3/smtp/email" and sent["key"] == "xkeysib-test"
    assert sent["body"]["sender"] == {"name": "Health Copilot", "email": "me@gmail.com"}
    assert sent["body"]["to"] == [{"email": "ann@x.com"}] and sent["body"]["textContent"] == "code 123456"


def test_busy_failure_can_be_rescanned(monkeypatch):
    class Slow(FakeLLM):
        def invoke(self, *_):
            raise TimeoutError("Request timed out")
    monkeypatch.setattr(graph, "structured", lambda *a: Slow(None))
    monkeypatch.setattr(summarize, "structured", lambda *a: FakeLLM(SUMMARY))
    with TestClient(app, headers=_visit()) as c:
        did = c.post("/documents", files={"file": ("a.png", _png(), "image/png")}).json()["id"]
        assert c.get(f"/documents/{did}").json()["extraction"]["_busy"] is True
        monkeypatch.setattr(graph, "structured", lambda *a: FakeLLM(EXTRACTION))
        assert c.post(f"/documents/{did}/rescan").status_code == 200
        assert c.get(f"/documents/{did}").json()["status"] == "done"
        assert c.post(f"/documents/{did}/rescan").status_code == 409  # only failed docs
        c.delete("/profile")


def test_restart_mid_summary_can_be_rescanned_without_duplicates(monkeypatch):
    import asyncio
    monkeypatch.setattr(graph, "structured", lambda *a: FakeLLM(EXTRACTION))
    monkeypatch.setattr(summarize, "structured", lambda *a: FakeLLM(SUMMARY))
    with TestClient(app, headers=_visit()) as c:
        did = c.post("/documents", files={"file": ("a.png", _png(), "image/png")}).json()["id"]
        with summarize.SessionLocal() as db:  # as if the server died after persist, before the summary
            doc = db.get(Document, did)
            doc.status, doc.summary = "summarizing", None
            db.commit()

        async def restart():
            async with lifespan(app):
                pass
        asyncio.run(restart())
        d = c.get(f"/documents/{did}").json()
        assert d["status"] == "failed" and d["extraction"]["_busy"] is True  # page shows Rescan
        assert c.post(f"/documents/{did}/rescan").status_code == 200
        d = c.get(f"/documents/{did}").json()
        assert d["status"] == "done" and d["summary"] and len(d["observations"]) == 2  # old rows replaced, not doubled
        c.delete("/profile")


def test_profile_details_are_validated_and_used(monkeypatch):
    lab = EXTRACTION.model_copy(update={"lab_results": [EXTRACTION.lab_results[0].model_copy(
        update={"value": "12.5", "ref_range": "Male: 13.0-17.0 Female: 12.0-15.0"})]})
    monkeypatch.setattr(graph, "structured", lambda *a: FakeLLM(lab))
    monkeypatch.setattr(summarize, "structured", lambda *a: FakeLLM(SUMMARY))
    with TestClient(app, headers=_visit()) as c:
        assert c.put("/profile", json={"sex": "F"}).status_code == 422
        assert c.put("/profile", json={"preferred_language": "fr"}).status_code == 422
        assert c.put("/profile", json={"dob": "2999-01-01"}).status_code == 422
        assert c.put("/profile", json={"name": ""}).status_code == 422
        p = c.put("/profile", json={"name": "Ravi Kumar", "dob": "1990-01-01", "sex": "male"}).json()
        assert (p["name"], p["sex"], p["dob"]) == ("Ravi Kumar", "male", "1990-01-01")
        d = c.get(f"/documents/{c.post('/documents', files={'file': ('a.png', _png(), 'image/png')}).json()['id']}").json()
        assert d["observations"][0]["interpretation"] == "L"  # the male range, not the first one printed
        assert any("seems to be for Sunita Devi" in w for w in d["extraction"]["_warnings"])  # real name: check runs
        c.delete("/profile")


def test_huge_pdf_page_is_rendered_small(tmp_path):
    import pymupdf
    from app.ingestion.prepare import MAX_EDGE, prepare_file
    pdf = pymupdf.open()
    pdf.new_page(width=14400, height=7200)  # 200 x 100 inches, blank so it goes as an image
    src = tmp_path / "big.pdf"
    pdf.save(src)
    paths, _ = prepare_file(src, "application/pdf", tmp_path)
    assert max(Image.open(paths[0]).size) <= MAX_EDGE


def test_saving_sex_reflags_earlier_reports(monkeypatch):
    lab = EXTRACTION.model_copy(update={"lab_results": [EXTRACTION.lab_results[0].model_copy(
        update={"value": "12.5", "ref_range": "Male: 13.0-17.0 Female: 12.0-15.0"})]})
    monkeypatch.setattr(graph, "structured", lambda *a: FakeLLM(lab))
    monkeypatch.setattr(summarize, "structured", lambda *a: FakeLLM(SUMMARY))
    with TestClient(app, headers=_visit()) as c:
        did = c.post("/documents", files={"file": ("a.png", _png(), "image/png")}).json()["id"]
        hb = lambda: next(o for o in c.get(f"/documents/{did}").json()["observations"] if o["loinc_code"] == "718-7")
        assert hb()["interpretation"] == "N"  # sex unknown: the catalog's widest range
        prof = c.put("/profile", json={"sex": "male"}).json()
        assert hb()["interpretation"] == "L"  # re-checked against the male range, no new upload
        assert [a["test"] for a in prof["latest_abnormal"]] == ["Haemoglobin"]
        d = c.get(f"/documents/{did}").json()
        assert d["status"] == "done" and d["summary"]["abnormal_explanations"][0]["test"] == "Haemoglobin"  # rebuilt
        c.put("/profile", json={"name": "Ravi Kumar"})  # the name check also runs on old reports
        assert any("seems to be for Sunita Devi" in w for w in c.get(f"/documents/{did}").json()["extraction"]["_warnings"])
        c.delete("/profile")


def test_details_saved_mid_upload_still_apply(monkeypatch):
    lab = EXTRACTION.model_copy(update={"lab_results": [EXTRACTION.lab_results[0].model_copy(
        update={"value": "12.5", "ref_range": "Male: 13.0-17.0 Female: 12.0-15.0"})]})

    class SavesSexMeanwhile(FakeLLM):  # the summary step runs after flags are computed: save details right then
        def invoke(self, *_):
            with summarize.SessionLocal() as db:
                doc = db.scalars(select(Document).order_by(Document.id.desc())).first()
                db.get(summarize.Profile, doc.profile_id).sex = "male"
                db.commit()
            return self.out
    monkeypatch.setattr(graph, "structured", lambda *a: FakeLLM(lab))
    monkeypatch.setattr(summarize, "structured", lambda *a: SavesSexMeanwhile(SUMMARY))
    with TestClient(app, headers=_visit()) as c:
        did = c.post("/documents", files={"file": ("a.png", _png(), "image/png")}).json()["id"]
        d = c.get(f"/documents/{did}").json()
        assert d["status"] == "done" and d["observations"][0]["interpretation"] == "L"  # male range, not the old widest
        assert len(d["observations"]) == 1
        c.delete("/profile")
