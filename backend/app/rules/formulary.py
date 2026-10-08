import csv
import re
from functools import lru_cache
from pathlib import Path

from .lookup import lookup

FORMS = r"\b(tab|tablet|tablets|cap|capsule|capsules|syp|syrup|inj|injection)\b\.?"


def _key(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(FORMS, "", s.lower().replace("-", " "))).strip()


@lru_cache
def formulary() -> dict[str, dict]:
    path = Path(__file__).resolve().parents[2] / "data" / "formulary.csv"
    with open(path, encoding="utf-8", newline="") as f:
        return {_key(r["brand"]): r for r in csv.DictReader(f)}


def match(name: str) -> dict | None:
    """Exact then fuzzy (>= 85) brand lookup. Returns the formulary row or None."""
    return lookup(formulary(), _key(name), 0.85)
