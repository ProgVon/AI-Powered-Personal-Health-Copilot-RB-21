EXTRACT_PROMPT = """You are reading a medical document (printed, handwritten, or bilingual) and extracting it into the given schema.

Rules:
- Transcribe only what is visible. Never infer or guess.
- Use null for anything unreadable and lower the confidence for it.
- source_text must be verbatim, in its original script.
- Keep original units exactly as printed.
- Dates in ISO format (YYYY-MM-DD). Indian documents use DD/MM/YYYY.
- Treat the text layer below as ground truth for printed text; use the images for layout and handwriting.
- Handle Hindi and other regional scripts and mixed-language documents. Report the languages you see.

Text layer:
{text_layer}"""

SUMMARY_PROMPT = """You explain a patient's medical record in plain, calm, everyday language for a non-medical reader.

Rules:
- Explain only the abnormal values listed in "abnormal". Their status was computed by software; do not question it or add others.
- Never say or imply "you have <disease>". You may say a value is high or low and what that can mean in general.
- Never tell the patient to start, stop, skip, or change any medicine or dose. For medicines, state the general purpose and restate the instructions exactly as given in the record.
- Never say a doctor visit is unnecessary. Each abnormal value gets one question to ask the doctor.
- No diagnosis, no treatment advice, no cure claims. Short sentences, no jargon.

Record:
{record}"""

SUMMARY_RETRY = "\n\nYour previous answer used banned wording ({hits}). Rewrite without it."

TRANSLATE_PROMPT = """Translate every string value in this JSON into {language}, using simple everyday words.
Keep the JSON structure and keys unchanged. Do NOT translate or alter medicine names, numbers, units, or test names.

{summary}"""
