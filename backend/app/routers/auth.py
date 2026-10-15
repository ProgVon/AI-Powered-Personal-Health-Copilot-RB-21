import hmac
import logging
import secrets
import time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from .. import auth
from ..db import get_db
from ..models import Account, Profile, User

router = APIRouter(prefix="/auth", tags=["auth"])
OTP_TTL = timedelta(minutes=10)
RESEND_AFTER = timedelta(seconds=30)
MAX_TRIES = 5
WINDOW, PER_IP, PER_ACCOUNT = 15 * 60, 20, 5  # code requests / login attempts per 15 minutes
log = logging.getLogger(__name__)
_hits: dict[str, list[float]] = {}  # shortcut: per process, move to the DB if you run more than one backend instance


def _limit(request: Request, who: str):
    """Stops scripts from flooding inboxes, burning the email quota, or guessing passwords and codes."""
    # behind Vercel's proxy the client is the first X-Forwarded-For entry; it can be faked, the per-account limit can't
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
    now = time.monotonic()
    if len(_hits) > 50_000:  # bound memory against spoofed IPs
        _hits.clear()
    for key, cap in ((f"ip:{ip}", PER_IP), (f"who:{who.lower()}", PER_ACCOUNT)):
        recent = [t for t in _hits.get(key, []) if now - t < WINDOW]
        if len(recent) >= cap:
            raise HTTPException(429, "Too many attempts, please try again in 15 minutes")
        _hits[key] = recent + [now]


class EmailBody(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)

    @field_validator("email", mode="before")  # before the pattern check, so " Ann@x.com " is cleaned, not rejected
    @classmethod
    def lower(cls, v):
        return v.strip().lower() if isinstance(v, str) else v


class Signup(EmailBody):
    username: str = Field(min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)


class Login(BaseModel):
    login: str = Field(min_length=1, max_length=254)  # username or email
    password: str = Field(max_length=128)


class Verify(EmailBody):
    otp: str = Field(pattern=r"^\d{6}$")


def _issue_otp(db: Session, acc: Account):
    now = datetime.utcnow()
    if acc.otp_expires and acc.otp_expires - OTP_TTL + RESEND_AFTER > now:
        raise HTTPException(429, "Please wait a few seconds before asking for a new code")
    code = f"{secrets.randbelow(10**6):06d}"
    acc.otp_hash, acc.otp_expires, acc.otp_tries = auth.hash_otp(code), now + OTP_TTL, 0
    try:
        auth.send_otp(acc.email, code)
    except Exception:  # bad SMTP settings or provider down; nothing is saved
        log.exception("sending OTP failed")
        db.rollback()
        raise HTTPException(502, "Couldn't send the verification email, please try again")
    db.commit()
    return {"email": acc.email}


@router.post("/signup")
def signup(body: Signup, request: Request, db: Session = Depends(get_db)):
    _limit(request, body.email)
    if db.scalar(select(Account).where(Account.username == body.username)):
        raise HTTPException(409, "That username is taken")
    if db.scalar(select(Account).where(Account.email == body.email)):  # answer as if new, so emails can't be probed
        try:
            auth.send_mail(body.email, "You already have a Health Copilot account",
                           "Someone tried to sign up with this email. You already have an account: log in, "
                           "or use \"Forgot password?\" if you can't remember your password.")
        except Exception:
            log.exception("sending already-registered notice failed")
        return {"email": body.email}
    user = User()
    user.profile = Profile(name=body.username)
    user.account = Account(username=body.username, email=body.email, password_hash=auth.hash_password(body.password))
    db.add(user)
    return _issue_otp(db, user.account)


@router.post("/login")
def login(body: Login, request: Request, db: Session = Depends(get_db)):
    who = body.login.strip()
    _limit(request, who)
    acc = db.scalar(select(Account).where(or_(Account.email == who.lower(), Account.username == who)))
    if not acc or not auth.check_password(body.password, acc.password_hash):
        raise HTTPException(401, "Wrong username/email or password")
    return _issue_otp(db, acc)


def _check_otp(db: Session, body: Verify) -> Account:
    acc = db.scalar(select(Account).where(Account.email == body.email))
    expired = HTTPException(401, "This code has expired, please request a new one")
    if not acc or not acc.otp_hash or acc.otp_expires < datetime.utcnow():
        raise expired
    # count the try in one statement before comparing, so parallel guesses can't all slip under the limit
    counted = db.execute(update(Account).where(Account.id == acc.id, Account.otp_tries < MAX_TRIES)
                         .values(otp_tries=Account.otp_tries + 1)).rowcount
    db.commit()
    if not counted:
        raise expired
    if not hmac.compare_digest(acc.otp_hash, auth.hash_otp(body.otp)):
        raise HTTPException(401, "Wrong code")
    # only wrong guesses use up tries; forgot-password checks the right code twice (Verify, then Save)
    db.execute(update(Account).where(Account.id == acc.id).values(otp_tries=Account.otp_tries - 1))
    db.commit()
    return acc


@router.post("/verify")
def verify(body: Verify, db: Session = Depends(get_db)):
    acc = _check_otp(db, body)
    acc.otp_hash = None  # one use only
    db.commit()
    return {"token": auth.make_token(acc.user)}


@router.post("/forgot")
def forgot(body: EmailBody, request: Request, db: Session = Depends(get_db)):
    _limit(request, body.email)
    if acc := db.scalar(select(Account).where(Account.email == body.email)):
        try:
            _issue_otp(db, acc)
        except HTTPException:  # a 429 or 502 here would reveal that the account exists
            pass
    return {"email": body.email}  # same answer either way, so this can't be used to find who has an account


@router.post("/reset/check")
def reset_check(body: Verify, db: Session = Depends(get_db)):
    """Lets the page confirm the code before asking for a new password; the code stays valid for /reset."""
    _check_otp(db, body)
    return {"ok": True}


class Reset(Verify):
    password: str = Field(min_length=8, max_length=128)


@router.post("/reset")
def reset(body: Reset, db: Session = Depends(get_db)):
    acc = _check_otp(db, body)
    acc.password_hash = auth.hash_password(body.password)  # also logs out every existing session (see auth._pw_stamp)
    acc.otp_hash = None
    db.commit()
    return {"ok": True}  # no token: the user logs in again with the new password
