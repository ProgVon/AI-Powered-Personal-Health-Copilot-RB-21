from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

CASCADE = "all, delete-orphan"


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    preferred_language: Mapped[str] = mapped_column(String, default="en")
    profile: Mapped["Profile"] = relationship(back_populates="user", cascade=CASCADE, uselist=False)


class Profile(Base):  # FHIR Patient
    __tablename__ = "profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    name: Mapped[str]
    dob: Mapped[date | None]
    sex: Mapped[str | None]  # male | female | other
    abha_number: Mapped[str | None]
    abha_address: Mapped[str | None]
    abha_linked_at: Mapped[datetime | None]
    user: Mapped[User] = relationship(back_populates="profile")
    documents: Mapped[list["Document"]] = relationship(cascade=CASCADE)


class Document(Base):  # FHIR DocumentReference + Composition
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    file_path: Mapped[str | None]
    mime: Mapped[str | None]
    doc_type: Mapped[str | None]
    doc_date: Mapped[date | None]
    facility: Mapped[str | None]
    practitioner: Mapped[str | None]
    admission_date: Mapped[date | None]
    discharge_date: Mapped[date | None]
    status: Mapped[str] = mapped_column(String, default="processing")  # processing | summarizing | done | failed
    extraction: Mapped[dict | None] = mapped_column(JSON)
    summary: Mapped[dict | None] = mapped_column(JSON)
    summary_i18n: Mapped[dict | None] = mapped_column(JSON)
    source: Mapped[str] = mapped_column(String, default="upload")  # upload | abdm
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    observations: Mapped[list["Observation"]] = relationship(cascade=CASCADE)
    medications: Mapped[list["Medication"]] = relationship(cascade=CASCADE)
    conditions: Mapped[list["Condition"]] = relationship(cascade=CASCADE)
    allergies: Mapped[list["Allergy"]] = relationship(cascade=CASCADE)


class Observation(Base):
    __tablename__ = "observations"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))
    loinc_code: Mapped[str | None]
    display_name: Mapped[str]
    value_num: Mapped[float | None] = mapped_column(Float)
    value_text: Mapped[str | None]
    unit: Mapped[str | None]
    ref_low: Mapped[float | None] = mapped_column(Float)
    ref_high: Mapped[float | None] = mapped_column(Float)
    interpretation: Mapped[str | None]  # N L H LL HH
    effective_at: Mapped[date | None]
    confidence: Mapped[float | None] = mapped_column(Float)
    note: Mapped[str | None]  # e.g. "check original report"


class Medication(Base):
    __tablename__ = "medications"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))
    brand_name: Mapped[str]
    salt: Mapped[str | None]
    strength: Mapped[str | None]
    form: Mapped[str | None]
    dose_pattern: Mapped[str | None]
    per_day: Mapped[int | None] = mapped_column(Integer)
    timing: Mapped[str | None]
    duration_days: Mapped[int | None] = mapped_column(Integer)
    start_date: Mapped[date | None]
    end_date: Mapped[date | None]
    prescriber: Mapped[str | None]
    confidence: Mapped[float | None] = mapped_column(Float)


class Condition(Base):
    __tablename__ = "conditions"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))
    name: Mapped[str]
    icd10_code: Mapped[str | None]
    recorded_at: Mapped[date | None]


class Allergy(Base):
    __tablename__ = "allergies"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))
    substance: Mapped[str]
    reaction: Mapped[str | None]
