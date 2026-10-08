import base64
import logging
import time
from typing import TypedDict

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage
from langgraph.graph import END, START, StateGraph

from ..config import settings
from ..db import SessionLocal
from ..models import Allergy, Condition, Document, Medication, Observation
from .normalize import normalize
from .prepare import prepare
from .prompts import EXTRACT_PROMPT
from .schemas import DocumentExtraction
from .summarize import summarize

log = logging.getLogger(__name__)


class IngestState(TypedDict, total=False):
    document_id: int
    profile_id: int
    page_paths: list[str]
    text_layer: str
    extraction: dict | None
    record: dict | None
    attempts: int
    error: str | None
    warnings: list[str]


def _image_block(path: str) -> dict:
    with open(path, "rb") as f:
        return {"type": "image", "base64": base64.b64encode(f.read()).decode(), "mime_type": "image/png"}


def extract(state):
    extractor = init_chat_model(settings.VISION_MODEL, temperature=0, api_key=settings.LLM_API_KEY or None, timeout=60, max_retries=1).with_structured_output(DocumentExtraction)
    content = [{"type": "text", "text": EXTRACT_PROMPT.format(text_layer=state["text_layer"] or "none")}]
    content += [_image_block(p) for p in state["page_paths"]]
    attempts = state["attempts"] + 1
    t0 = time.time()
    try:
        result = extractor.invoke([HumanMessage(content=content)])
        log.info("extract took %.1fs", time.time() - t0)
        if result is None:
            raise ValueError("model returned no structured output")
        return {"extraction": result.model_dump(), "attempts": attempts}
    except Exception as e:  # validation errors and transient API errors both get one retry
        log.warning("extract attempt %s failed: %s", attempts, e)
        return {"extraction": None, "attempts": attempts, "error": str(e)}


def persist(state):
    rec, pid, did = state["record"], state["profile_id"], state["document_id"]
    with SessionLocal() as db:  # one transaction
        doc = db.get(Document, did)
        for k in ("doc_type", "doc_date", "facility", "practitioner", "admission_date", "discharge_date"):
            setattr(doc, k, rec[k])
        doc.extraction = {**state["extraction"], "_warnings": state["warnings"]}
        keys = ("profile_id", "document_id")
        ids = dict(zip(keys, (pid, did)))
        for o in rec["observations"]:
            db.add(Observation(**ids, **{k: v for k, v in o.items() if k != "explainer"}))
        for m in rec["medications"]:
            db.add(Medication(**ids, **{k: v for k, v in m.items() if k != "as_needed"}))
        db.add_all(Condition(**ids, **c) for c in rec["conditions"])
        db.add_all(Allergy(**ids, **a) for a in rec["allergies"])
        db.commit()
    return {}


def fail(state):
    with SessionLocal() as db:
        doc = db.get(Document, state["document_id"])
        doc.status, doc.extraction = "failed", {"_error": state.get("error")}
        db.commit()
    return {}


g = StateGraph(IngestState)
for name, fn in {"prepare": prepare, "extract": extract, "normalize": normalize,
                 "persist": persist, "summarize": summarize, "fail": fail}.items():
    g.add_node(name, fn)
g.add_edge(START, "prepare")
g.add_edge("prepare", "extract")
g.add_conditional_edges("extract", lambda s: "normalize" if s["extraction"]
                        else ("extract" if s["attempts"] < 2 else "fail"))
g.add_edge("normalize", "persist")
g.add_edge("persist", "summarize")
g.add_edge("summarize", END)
g.add_edge("fail", END)
ingest_graph = g.compile()


def run_ingest(document_id: int, profile_id: int):
    """Background-task entry point. Any crash marks the document failed instead of leaving it 'processing'."""
    try:
        ingest_graph.invoke({"document_id": document_id, "profile_id": profile_id})
    except Exception as e:
        log.exception("ingestion crashed")
        fail({"document_id": document_id, "error": str(e)})
