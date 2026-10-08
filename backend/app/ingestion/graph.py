import base64
import logging
import mimetypes
import time

from langchain_core.messages import HumanMessage

from ..config import settings
from ..db import SessionLocal
from ..models import Allergy, Condition, Document, Medication, Observation
from .llm import structured
from .normalize import normalize
from .prepare import prepare
from .prompts import EXTRACT_PROMPT
from .schemas import DocumentExtraction
from .summarize import summarize

log = logging.getLogger(__name__)


def _image_block(path: str) -> dict:
    with open(path, "rb") as f:
        return {"type": "image", "base64": base64.b64encode(f.read()).decode(), "mime_type": mimetypes.guess_type(path)[0]}


def extract(state):
    content = [{"type": "text", "text": EXTRACT_PROMPT.format(text_layer=state["text_layer"] or "none")}]
    content += [_image_block(p) for p in state["page_paths"]]
    t0 = time.time()
    result = structured(settings.VISION_MODEL, DocumentExtraction).invoke([HumanMessage(content=content)])
    log.info("extract took %.1fs", time.time() - t0)
    if result is None:
        raise ValueError("model returned no structured output")
    return {"extraction": result.model_dump()}


def persist(state):
    rec, pid, did = state["record"], state["profile_id"], state["document_id"]
    with SessionLocal() as db:  # one transaction
        doc = db.get(Document, did)
        for k in ("doc_type", "doc_date", "facility", "practitioner", "admission_date", "discharge_date"):
            setattr(doc, k, rec[k])
        doc.extraction = {**state["extraction"], "_warnings": state["warnings"]}
        ids = {"profile_id": pid, "document_id": did}
        for o in rec["observations"]:
            db.add(Observation(**ids, **{k: v for k, v in o.items() if k != "explainer"}))
        for m in rec["medications"]:
            db.add(Medication(**ids, **{k: v for k, v in m.items() if k != "as_needed"}))
        db.add_all(Condition(**ids, **c) for c in rec["conditions"])
        db.add_all(Allergy(**ids, **a) for a in rec["allergies"])
        doc.status = "summarizing"  # results are visible now; the summary follows
        db.commit()
    return {}


STEPS = [prepare, extract, normalize, persist, summarize]  # each takes the state dict and returns new keys


def _extract_retrying(state):
    try:  # bad JSON and flaky calls get one retry; client-level retries cover the rest
        return extract(state)
    except Exception:
        return extract(state)


def run_ingest(document_id: int, profile_id: int):
    """Background-task entry point. Any failure marks the document failed instead of leaving it 'processing'."""
    try:
        state = {"document_id": document_id, "profile_id": profile_id}
        for fn in STEPS:
            state |= (_extract_retrying if fn is extract else fn)(state)
    except Exception as e:
        log.exception("ingestion failed")
        with SessionLocal() as db:
            doc = db.get(Document, document_id)
            doc.status, doc.extraction = "failed", {"_error": str(e)}
            db.commit()
