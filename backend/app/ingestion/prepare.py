from pathlib import Path

import pymupdf as fitz  # PyMuPDF
from PIL import Image, ImageOps

from ..db import SessionLocal
from ..models import Document

MAX_PAGES, DPI, MAX_EDGE = 10, 170, 2048
MIN_PAGE_TEXT = 200  # chars; a page with less text is treated as scanned and sent as an image


def prepare_file(src: Path, mime: str, out: Path) -> tuple[list[str], str]:
    """Page images (scans only) and text layer for the model. Images are written to `out`."""
    paths, text = [], []
    if mime == "application/pdf":
        with fitz.open(src) as pdf:
            for i, page in enumerate(pdf):
                if i >= MAX_PAGES:
                    break
                text.append(page.get_text())  # digital PDFs carry a text layer
                if len(text[-1].strip()) < MIN_PAGE_TEXT:  # digital pages go as text only: far fewer tokens
                    p = out / f"page{i}.jpg"
                    page.get_pixmap(dpi=DPI).save(p, jpg_quality=85)
                    paths.append(str(p))
    else:
        img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
        img.thumbnail((MAX_EDGE, MAX_EDGE))
        p = out / "page0.jpg"
        img.save(p, quality=85)  # JPEG is ~5x smaller than PNG to upload to the model
        paths.append(str(p))
    return paths, "\n".join(text).strip()


def prepare(state):
    with SessionLocal() as db:
        doc = db.get(Document, state["document_id"])
        src, mime = Path(doc.file_path), doc.mime
    paths, text = prepare_file(src, mime, src.parent)
    return {"page_paths": paths, "text_layer": text}
