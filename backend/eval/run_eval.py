"""Field-level extraction accuracy on the gold set.

Gold layout: eval/gold/<name>.<jpg|png|pdf> + eval/gold/<name>.json, where the JSON is a hand-labelled
DocumentExtraction plus an optional "category": "printed" | "handwritten" | "bilingual".

Run from backend/:  python -m eval.run_eval
"""
import json
from collections import defaultdict
from pathlib import Path

from app.ingestion.normalize import normalize_record
from app.rules import safety_text
from app.ingestion.summarize import build_summary
from app.ingestion.graph import _image_block, extract
from app.ingestion.prompts import EXTRACT_PROMPT  # noqa: F401  (documented dependency of extract)

GOLD = Path(__file__).parent / "gold"
norm = lambda s: " ".join(str(s or "").lower().split())  # noqa: E731


def pages_for(f: Path) -> tuple[list[str], str]:
    """Same preparation as the agent's `prepare` node, without needing a DB row."""
    import pymupdf as fitz
    from PIL import Image, ImageOps
    out = f.parent / ".prepared" / f.stem
    out.mkdir(parents=True, exist_ok=True)
    if f.suffix == ".pdf":
        paths, text = [], []
        with fitz.open(f) as pdf:
            for i, pg in enumerate(list(pdf)[:10]):
                text.append(pg.get_text())
                pg.get_pixmap(dpi=170).save(out / f"p{i}.png")
                paths.append(str(out / f"p{i}.png"))
        return paths, "\n".join(text)
    img = ImageOps.exif_transpose(Image.open(f)).convert("RGB")
    img.thumbnail((2048, 2048))
    img.save(out / "p0.png")
    return [str(out / "p0.png")], ""


def score(pred: dict, gold: dict, acc: dict[str, list[int]]):
    acc["doc_type"].append(pred["doc_type"] == gold["doc_type"])
    acc["doc_date"].append(norm(pred.get("doc_date")) == norm(gold.get("doc_date")))
    pm = {norm(m["name"]): m for m in pred["medications"]}
    for g in gold.get("medications", []):
        p = pm.get(norm(g["name"]))
        acc["med_name"].append(p is not None)
        for k in ("strength", "dose_pattern", "duration"):
            acc[f"med_{k}"].append(bool(p) and norm(p.get(k)) == norm(g.get(k)))
    pl = {norm(l["test_name"]): l for l in pred["lab_results"]}
    for g in gold.get("lab_results", []):
        p = pl.get(norm(g["test_name"]))
        acc["lab_test"].append(p is not None)
        acc["lab_value"].append(bool(p) and norm(p["value"]) == norm(g["value"]))
        acc["lab_unit"].append(bool(p) and norm(p.get("unit")) == norm(g.get("unit")))


def main():
    by_cat: dict[str, dict] = defaultdict(lambda: defaultdict(list))
    violations = n = 0
    for lf in sorted(GOLD.glob("*.json")):
        gold = json.loads(lf.read_text(encoding="utf-8"))
        src = next((f for f in GOLD.glob(f"{lf.stem}.*") if f.suffix in (".jpg", ".png", ".pdf")), None)
        if not src:
            continue
        paths, text = pages_for(src)
        state = extract({"text_layer": text, "page_paths": paths, "attempts": 0})
        if not state["extraction"]:
            print(f"{lf.stem}: extraction failed ({state.get('error')})")
            continue
        n += 1
        score(state["extraction"], gold, by_cat[gold.get("category", "printed")])
        rec, _ = normalize_record(state["extraction"], gold.get("patient_name") or "", None, None)
        violations += len(safety_text.check(build_summary(rec)))
    if not n:
        print("No gold documents found in eval/gold/ (add <name>.jpg|png|pdf + <name>.json).")
        return
    fields = sorted({k for c in by_cat.values() for k in c})
    print(f"{'field':<18}" + "".join(f"{c:>13}" for c in by_cat))
    for f in fields:
        row = "".join(f"{(sum(c[f]) / len(c[f]) * 100 if c.get(f) else float('nan')):>12.0f}%" for c in by_cat.values())
        print(f"{f:<18}{row}")
    print(f"\n{n} documents; safety violations across summaries: {violations} (target 0)")


if __name__ == "__main__":
    main()
