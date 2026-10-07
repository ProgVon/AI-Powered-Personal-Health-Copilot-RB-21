from pathlib import Path

import pymupdf as fitz  # PyMuPDF
from PIL import Image, ImageOps

from ..db import SessionLocal
from ..models import Document

MAX_PAGES, DPI, MAX_EDGE = 10, 170, 2048


def prepare(state):
    with SessionLocal() as db:
        doc = db.get(Document, state["document_id"])
        src, mime = Path(doc.file_path), doc.mime
    paths, text = [], []
    if mime == "application/pdf":
        with fitz.open(src) as pdf:
            for i, page in enumerate(pdf):
                if i >= MAX_PAGES:
                    break
                text.append(page.get_text())  # digital PDFs carry a text layer
                p = src.parent / f"page{i}.png"
                page.get_pixmap(dpi=DPI).save(p)
                paths.append(str(p))
    else:
        img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
        img.thumbnail((MAX_EDGE, MAX_EDGE))
        p = src.parent / "page0.png"
        img.save(p)
        paths.append(str(p))
    return {"page_paths": paths, "text_layer": "\n".join(text).strip(), "attempts": 0, "warnings": []}
