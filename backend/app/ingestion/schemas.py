from typing import Literal

from pydantic import BaseModel, Field


class Medication(BaseModel):
    name: str
    strength: str | None = None
    form: str | None = None
    dose_pattern: str | None = None  # exactly as written: "1-0-1", "BD", "सुबह-शाम"
    timing: str | None = None  # "after food"
    duration: str | None = None  # "5 days", "continue"
    source_text: str
    confidence: float = Field(ge=0, le=1)


class LabResult(BaseModel):
    test_name: str
    value: str  # string: "<0.5", "Positive", "7.8"
    unit: str | None = None
    ref_range: str | None = None
    flag_on_report: str | None = None
    source_text: str
    confidence: float = Field(ge=0, le=1)


class Diagnosis(BaseModel):
    name: str
    source_text: str
    confidence: float = Field(ge=0, le=1)


class DocumentExtraction(BaseModel):
    doc_type: Literal["prescription", "lab_report", "discharge_summary", "diagnostic_report", "other"]
    doc_date: str | None = None
    patient_name: str | None = None
    facility: str | None = None
    practitioner: str | None = None
    admission_date: str | None = None
    discharge_date: str | None = None
    diagnoses: list[Diagnosis] = []
    medications: list[Medication] = []
    lab_results: list[LabResult] = []
    allergies: list[str] = []
    impression: str | None = None  # imaging findings
    follow_up: str | None = None
    languages_detected: list[str] = []
    handwritten: bool = False


class AbnormalExplanation(BaseModel):
    test: str
    value: str
    status: str
    what_it_means: str
    common_reasons: str
    question_for_doctor: str


class MedicineExplained(BaseModel):
    name: str
    general_purpose: str
    how_to_take: str


class Summary(BaseModel):
    headline: str
    key_points: list[str]
    abnormal_explanations: list[AbnormalExplanation] = []
    medicines_explained: list[MedicineExplained] = []
    next_steps: list[str] = []
