import re
from difflib import get_close_matches

NUMS = re.compile(r"\d+(?:\.\d+)?")
WORDS = re.compile(r"[^\W\d_]+")


def _same_kind(a: str, b: str) -> bool:
    """A close name is a different strength or test, not a typo, if its numbers differ ("Telma 80" / "Telma 40"),
    a short word is swapped ("VLDL" / "HDL", "Telma AM" / "Telma H") or a prefix is added ("Non-HDL" / "HDL")."""
    wa, wb = set(WORDS.findall(a)), set(WORDS.findall(b))
    swapped = any(len(w) <= 4 for w in wa - wb) and any(len(w) <= 4 for w in wb - wa)
    return NUMS.findall(a) == NUMS.findall(b) and not swapped and not (a.endswith(b) or b.endswith(a))


def lookup(idx: dict, key: str, cutoff: float):
    """Exact key, then the closest fuzzy key at or above `cutoff` that is the same kind. None if nothing fits."""
    if key in idx:
        return idx[key]
    hit = next((k for k in get_close_matches(key, idx, n=3, cutoff=cutoff) if _same_kind(key, k)), None)
    return idx[hit] if hit else None
