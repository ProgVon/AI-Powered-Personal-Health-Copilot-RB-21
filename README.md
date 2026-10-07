# AI-Powered Personal Health Copilot

Upload prescriptions, lab reports and discharge summaries → structured extraction → plain-language summary
(English / Hindi / Telugu) → unified profile and timeline → ABHA link, import and FHIR export (mock ABDM).

LLM reads documents and writes explanations; everything that must be exact (abnormal flags, units, test and
medicine mapping, dose parsing) is plain Python in `backend/app/rules/` and `backend/app/ingestion/normalize.py`.

## Run

```bash
docker compose up -d                         # Postgres
cd backend && python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                         # set ANTHROPIC_API_KEY (or change VISION_MODEL / TEXT_MODEL + provider package)
uvicorn app.main:app --reload                # :8000, tables created on startup

cd frontend && npm install && npm run dev    # :5173
```

## Test / evaluate

```bash
cd backend && pytest                         # rules, FHIR validity + round-trip, API flow with a stubbed LLM
python -m eval.run_eval                      # needs a labelled gold set in backend/eval/gold/ (see run_eval.py)
```

## Before a real demo

- Use synthetic or de-identified documents only.
- `data/lab_catalog.csv` (34 tests) and `data/formulary.csv` (45 brands) are drafts. Have a clinician review them
  and extend toward the plan's ~50 / ~200 entries.
- Run the model bake-off from the plan (§1) on 5 sample documents before fixing `VISION_MODEL`.
- ABHA linking is a mock (demo OTP `123456`); real integration needs ABDM sandbox registration.
