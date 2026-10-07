import csv
import re
from functools import lru_cache
from pathlib import Path

from rapidfuzz import fuzz, process

DATA = Path(__file__).resolve().parents[2] / "data"
NUM = ["ref_low_m", "ref_high_m", "ref_low_f", "ref_high_f", "critical_low", "critical_high",
       "plausible_min", "plausible_max"]


def norm_unit(u: str | None) -> str:
    return re.sub(r"\s+", "", (u or "").lower().replace("µ", "u").replace("μ", "u"))


@lru_cache
def catalog() -> tuple[dict, ...]:
    rows = []
    with open(DATA / "lab_catalog.csv", encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            r["aliases"] = [a.strip().lower() for a in [r["canonical_name"], *r["aliases"].split("|")] if a.strip()]
            r["unit_factors"] = {norm_unit(k): float(v) for k, v in
                                 (p.rsplit(":", 1) for p in r["unit_factors"].split("|") if p)}
            for k in NUM:
                r[k] = float(r[k]) if r[k] else None
            rows.append(r)
    return tuple(rows)


@lru_cache
def _alias_index() -> dict[str, dict]:
    return {a: r for r in catalog() for a in r["aliases"]}


def find(name: str) -> dict | None:
    """Exact alias match, then fuzzy (>= 88)."""
    n = re.sub(r"\s+", " ", name.lower()).strip()
    idx = _alias_index()
    if n in idx:
        return idx[n]
    hit = process.extractOne(n, idx.keys(), scorer=fuzz.ratio, score_cutoff=88)
    return idx[hit[0]] if hit else None


def unit_factor(row: dict, unit: str | None) -> float | None:
    """Multiplier to canonical unit; None if the unit is unknown. A missing unit is assumed canonical."""
    u = norm_unit(unit)
    if not u or u == norm_unit(row["canonical_unit"]):
        return 1.0
    return row["unit_factors"].get(u)


def catalog_range(row: dict, sex: str | None) -> tuple[float | None, float | None]:
    s = "f" if sex == "female" else "m"
    return row[f"ref_low_{s}"], row[f"ref_high_{s}"]


def interpret(v: float, lo: float | None, hi: float | None,
              crit_lo: float | None = None, crit_hi: float | None = None) -> str | None:
    """LL / L / N / H / HH, computed here and never by the LLM. None if no range is known."""
    if crit_lo is not None and v <= crit_lo:
        return "LL"
    if crit_hi is not None and v >= crit_hi:
        return "HH"
    if lo is None and hi is None:
        return None
    if lo is not None and v < lo:
        return "L"
    if hi is not None and v > hi:
        return "H"
    return "N"
