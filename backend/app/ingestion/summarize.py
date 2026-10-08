import json
import logging
import time

from ..config import settings
from ..db import SessionLocal
from ..models import Document, Profile
from ..rules import safety_text
from .llm import structured
from .prompts import SUMMARY_PROMPT, SUMMARY_RETRY, TRANSLATE_PROMPT
from .schemas import Summary

log = logging.getLogger(__name__)
CRITICAL_MSG = "This value is far outside the usual range. Please contact a doctor promptly."
STATUS = {"L": "Low", "H": "High", "LL": "Critically low", "HH": "Critically high"}
LANGS = {"hi": "Hindi", "te": "Telugu", "ta": "Tamil"}


def _val(o: dict) -> str:
    return " ".join(str(x) for x in (o["value_num"], o["unit"]) if x is not None)


def _abnormal(record: dict) -> list[dict]:
    return [{"test": o["display_name"], "value": _val(o), "status": STATUS[o["interpretation"]],
             "code": o["interpretation"], "reference": [o["ref_low"], o["ref_high"]],
             "test_explainer": o["explainer"]}
            for o in record["observations"] if o["interpretation"] in STATUS]


def template_summary(record: dict, abnormal: list[dict]) -> dict:
    """Deterministic fallback built straight from the record: no LLM, nothing to get wrong."""
    kind = record["doc_type"].replace("_", " ")
    meds = record["medications"]
    return {
        "headline": f"Summary of your {kind}" + (f" dated {record['doc_date']}" if record["doc_date"] else ""),
        "key_points": ([f"{len(record['observations'])} test result(s) were read."] if record["observations"] else [])
                      + ([f"{len(meds)} medicine(s) were listed."] if meds else [])
                      + [f"Diagnosis listed: {c['name']}" for c in record["conditions"]]
                      + ([f"{len(abnormal)} result(s) are outside the usual range."] if abnormal else []),
        "abnormal_explanations": [
            {"test": a["test"], "value": a["value"], "status": a["status"],
             "what_it_means": a["test_explainer"] or "This result is outside the reference range.",
             "common_reasons": "", "question_for_doctor": f"What could explain my {a['test']} result?"}
            for a in abnormal],
        "medicines_explained": [
            {"name": m["brand_name"], "general_purpose": m["salt"] or "",
             "how_to_take": " ".join(x for x in [m["dose_pattern"], m["timing"], m["duration_days"] and f"for {m['duration_days']} days"] if x)}
            for m in meds],
        "next_steps": ["Discuss this document with your doctor."] + ([record["follow_up"]] if record["follow_up"] else []),
    }


def build_summary(record: dict) -> dict:
    abnormal = _abnormal(record)
    critical = [a for a in abnormal if a["code"] in ("LL", "HH")]
    rest = [a for a in abnormal if a["code"] not in ("LL", "HH")]
    # the LLM only ever sees non-critical values; critical ones get the fixed message
    llm_in = {k: record[k] for k in ("doc_type", "doc_date", "impression", "follow_up")}
    llm_in |= {"diagnoses": [c["name"] for c in record["conditions"]], "abnormal": rest,
               "medicines": [{k: m[k] for k in ("brand_name", "salt", "strength", "dose_pattern", "timing", "duration_days")}
                             for m in record["medications"]]}
    prompt = SUMMARY_PROMPT.format(record=json.dumps(llm_in, default=str, ensure_ascii=False))
    summary = None
    try:
        llm = structured(settings.TEXT_MODEL, Summary)
        for attempt in range(2):  # regenerate once on a banned phrase
            t0 = time.time()
            out = llm.invoke(prompt).model_dump()
            log.info("summary call %s took %.1fs", attempt + 1, time.time() - t0)
            hits = safety_text.check(out)
            if not hits:
                summary = out
                break
            prompt += SUMMARY_RETRY.format(hits=", ".join(hits))
    except Exception:
        log.exception("summary LLM failed; using template")
    if summary is None:
        return template_summary(record, abnormal)
    allowed = {a["test"] for a in rest}
    summary["abnormal_explanations"] = [
        {"test": c["test"], "value": c["value"], "status": c["status"], "what_it_means": CRITICAL_MSG,
         "common_reasons": "", "question_for_doctor": f"What should I do about my {c['test']} result?"}
        for c in critical
    ] + [e for e in summary["abnormal_explanations"] if e["test"] in allowed]
    return summary


def translate_summary(summary: dict, lang: str) -> dict:
    out = structured(settings.TEXT_MODEL, Summary).invoke(TRANSLATE_PROMPT.format(language=LANGS[lang], summary=json.dumps(summary, ensure_ascii=False)))
    return out.model_dump()


def summarize(state):
    summary = build_summary(state["record"])  # model calls happen outside any DB session, so SQLite isn't locked
    with SessionLocal() as db:
        lang = db.get(Profile, state["profile_id"]).user.preferred_language
    i18n = None
    if lang in LANGS:  # translate now so the reader's language is ready when they open it
        try:
            i18n = {lang: translate_summary(summary, lang)}
        except Exception:
            log.exception("pre-translation failed; it will run on demand")
    with SessionLocal() as db:
        doc = db.get(Document, state["document_id"])
        doc.summary, doc.summary_i18n, doc.status = summary, i18n, "done"
        db.commit()
    return {}
