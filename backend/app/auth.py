from datetime import date, datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Profile, User

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer()


class Register(BaseModel):
    email: str
    password: str
    name: str
    dob: date | None = None
    sex: str | None = None
    preferred_language: str = "en"


class Login(BaseModel):
    email: str
    password: str


def _token(user_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=7)
    return jwt.encode({"sub": str(user_id), "exp": exp}, settings.JWT_SECRET, "HS256")


@router.post("/register")
def register(body: Register, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "Email already registered")
    user = User(email=body.email.lower(), preferred_language=body.preferred_language,
                password_hash=bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode())
    user.profile = Profile(name=body.name, dob=body.dob, sex=body.sex)
    db.add(user)
    db.commit()
    return {"token": _token(user.id)}


@router.post("/login")
def login(body: Login, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not bcrypt.checkpw(body.password.encode(), user.password_hash.encode()):
        raise HTTPException(401, "Invalid email or password")
    return {"token": _token(user.id)}


def current_profile(creds: HTTPAuthorizationCredentials = Depends(bearer),
                    db: Session = Depends(get_db)) -> Profile:
    try:
        uid = int(jwt.decode(creds.credentials, settings.JWT_SECRET, ["HS256"])["sub"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    profile = db.scalar(select(Profile).where(Profile.user_id == uid))
    if not profile:
        raise HTTPException(401, "Unknown user")
    return profile
