import json
import re
from pathlib import Path

T = json.loads((Path(__file__).with_name("dosage_terms.json")).read_text(encoding="utf-8"))
FRACTIONS = {"½": 0.5, "¼": 0.25, "¾": 0.75}
DASH = re.compile(r"[\d½¼¾.]+(?:\s*[-–]\s*[\d½¼¾.]+){1,3}")
SLOTS_BY_LEN = {2: ["morning", "night"], 3: ["morning", "afternoon", "night"],
                4: ["morning", "afternoon", "evening", "night"]}
UNIT_DAYS = [("day", 1), ("din", 1), ("दिन", 1), ("week", 7), ("wk", 7), ("हफ्त", 7),
             ("month", 30), ("mth", 30), ("महीन", 30)]


def _has(text: str, terms: list[str]) -> bool:
    words = set(re.findall(r"[\wऀ-ॿ]+", text))
    return any((t in text) if " " in t else (t in words or (not t.isascii() and t in text)) for t in terms)


def _dose(entry: str) -> float:
    return FRACTIONS.get(entry) or float(entry)


def parse_dose(pattern: str | None) -> dict:
    """'1-0-1' -> per_day 2, timing 'morning, night'. Unknown input -> all None."""
    out = {"per_day": None, "timing": None, "as_needed": False}
    if not pattern:
        return out
    text = pattern.lower()
    slots: list[str] = []
    m = DASH.search(text)
    if m:
        try:
            entries = [_dose(e.strip()) for e in re.split(r"[-–]", m.group())]
        except ValueError:
            entries = []
        names = SLOTS_BY_LEN.get(len(entries), [])
        slots = [n for n, e in zip(names, entries) if e > 0]
        out["per_day"] = len(slots) or None
    else:
        words = re.findall(r"[\wऀ-ॿ]+", text)
        freq = next((T["frequency"][w] for w in words if w in T["frequency"]), None)
        slots = [s for s, terms in T["slots"].items() if _has(text, terms)]
        out["per_day"] = freq or len(slots) or None
    if _has(text, T["as_needed"]):
        out["as_needed"] = True
    food = food_timing(text)
    out["timing"] = ", ".join(slots + ([food] if food else [])) or None
    return out


def food_timing(text: str | None) -> str | None:
    if not text:
        return None
    t = text.lower()
    return "after food" if _has(t, T["after_food"]) else "before food" if _has(t, T["before_food"]) else None


def parse_duration_days(text: str | None) -> int | None:
    """'5 days' -> 5, '2 weeks' -> 14, 'continue' / unparseable -> None (open-ended)."""
    if not text or _has(text.lower(), T["continue"]):
        return None
    m = re.search(r"(\d+)\s*([^\d\s]+)", text.lower())
    if not m:
        return None
    return next((int(m.group(1)) * d for k, d in UNIT_DAYS if m.group(2).startswith(k)), None)
