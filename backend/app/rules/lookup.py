from difflib import get_close_matches


def lookup(idx: dict, key: str, cutoff: float):
    """Exact key, then the closest fuzzy key at or above `cutoff`. None if nothing is close enough."""
    if key in idx:
        return idx[key]
    hit = get_close_matches(key, idx, n=1, cutoff=cutoff)
    return idx[hit[0]] if hit else None
