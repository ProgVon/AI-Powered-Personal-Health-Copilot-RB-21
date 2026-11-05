import base64
import logging
import mimetypes
import time
from concurrent.futures import ThreadPoolExecutor

from langchain_core.messages import HumanMessage
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..models import Allergy, Condition, Document, Medication, Observation, Profile
from .llm import structured
from .normalize import normalize, normalize_record, person
from .prepare import prepare
from .prompts import EXTRACT_PROMPT
from .schemas import DocumentExtraction
from .summarize import flags, summarize

log = logging.getLogger(__name__)
# own threads, so slow model calls can't take the request thread pool; also caps parallel LLM calls
INGEST = ThreadPoolExecutor(4, thread_name_prefix="ingest")


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
        db.add_all(_observations(rec, ids))
        for m in rec["medications"]:
            db.add(Medication(**ids, **m))
        db.add_all(Condition(**ids, **c) for c in rec["conditions"])
        db.add_all(Allergy(**ids, **a) for a in rec["allergies"])
        doc.status = "summarizing"  # results are visible now; the summary follows
        db.commit()
    return {}


def _observations(rec: dict, ids: dict) -> list[Observation]:
    return [Observation(**ids, **{k: v for k, v in o.items() if k != "explainer"}) for o in rec["observations"]]


def _recheck(doc: Document, who: tuple) -> tuple[dict, bool]:
    """Recompute one upload's flags and warnings from its saved extraction (no LLM).
    Returns its summarize() state and whether any flag moved."""
    record, warnings = normalize_record(doc.extraction, *who)
    ids = {"profile_id": doc.profile_id, "document_id": doc.id}
    old = flags(doc)
    doc.observations[:] = _observations(record, ids)  # delete-orphan removes the old rows
    doc.extraction = {**doc.extraction, "_warnings": warnings}
    return {"record": record, **ids}, [o["interpretation"] for o in record["observations"]] != old


def reflag(db: Session, p: Profile) -> list[dict]:
    """Profile details changed: re-check every read upload. Returns summarize() states for the documents whose
    flags moved; the caller commits and runs them."""
    who, redo = person(p), []
    for doc in p.documents:
        # "summarizing" too: a second save while the first one's summary is being written must still apply
        if doc.source != "upload" or doc.status not in ("done", "summarizing") or not doc.extraction:
            continue
        state, moved = _recheck(doc, who)
        if moved:
            doc.status = "summarizing"  # the old summary explains the old flags
            redo.append(state)
    return redo


def resume(db: Session) -> list[dict]:
    """Startup: a document cut off while summarizing has all its rows, so only its summary is rebuilt (no new read)."""
    return [_recheck(d, person(db.get(Profile, d.profile_id)))[0]
            for d in db.scalars(select(Document).where(Document.status == "summarizing"))]


def _extract_retrying(state):
    try:  # bad JSON and flaky calls get one retry; client-level retries cover the rest
        return extract(state)
    except Exception:
        return extract(state)


BUSY_HINTS = ("timeout", "timed out", "429", "503", "504", "529", "overloaded", "resource_exhausted", "unavailable", "rate limit")


def _busy(e: BaseException | None) -> bool:
    """Provider overload or timeout rather than an unreadable document; walks the cause chain."""
    # ponytail: string match across providers' error types; switch to status codes if false positives show up
    while e:
        if any(h in f"{type(e).__name__} {e}".lower() for h in BUSY_HINTS):
            return True
        e = e.__cause__ or e.__context__
    return False


STEPS = [prepare, _extract_retrying, normalize, persist, summarize]  # each takes the state dict and returns new keys


def run_ingest(document_id: int, profile_id: int):
    """Background-task entry point. Any failure marks the document failed instead of leaving it 'processing'."""
    try:
        state = {"document_id": document_id, "profile_id": profile_id}
        for fn in STEPS:
            state |= fn(state)
    except Exception as e:
        log.exception("ingestion failed")
        with SessionLocal() as db:
            doc = db.get(Document, document_id)
            doc.status, doc.extraction = "failed", {"_error": str(e), "_busy": _busy(e)}
            db.commit()
        return
    try:  # outside the try above: the document itself is fine even if this fails
        _catch_up(state)
    except Exception:
        log.exception("re-check after changed profile details failed")


def _catch_up(state):
    """Details saved while this document was being read: PUT /profile skipped it (not 'done' yet), so re-check now."""
    with SessionLocal() as db:
        p = db.get(Profile, state["profile_id"])
        if not p or person(p) == state["who"]:
            return
        redo = reflag(db, p)
        db.commit()
    for s in redo:
        summarize(s)
