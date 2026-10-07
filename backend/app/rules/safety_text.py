import re

BANNED = [re.compile(p, re.I) for p in [
    r"\byou (?:have|probably have|likely have|suffer from|are suffering from)\b"
    r"(?! (?:questions?|been|an appointment|a prescription))",
    r"\bstop (?:taking|using|your)\b",
    r"\b(?:increase|decrease|reduce|raise|lower|double|skip|change|adjust)\b[^.]{0,25}\b(?:dose|dosage|medicines?|medications?)\b",
    r"\bno need to (?:see|visit|consult|worry)\b",
    r"\bdon'?t (?:need|have) to (?:see|visit|consult)\b",
    r"\bcures?d?\b",
]]


def _strings(x):
    if isinstance(x, str):
        yield x
    elif isinstance(x, dict):
        for v in x.values():
            yield from _strings(v)
    elif isinstance(x, list):
        for v in x:
            yield from _strings(v)


def check(obj) -> list[str]:
    """Banned phrases found anywhere in a string or nested summary. Empty list = safe."""
    return [m.group() for s in _strings(obj) for p in BANNED for m in p.finditer(s)]
