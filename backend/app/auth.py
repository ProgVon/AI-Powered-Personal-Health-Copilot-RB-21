import hashlib
import hmac
import json
import logging
import secrets
import shutil
import smtplib
import urllib.request
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import parseaddr
from pathlib import Path

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Account, Profile, User

TOKEN_TTL = timedelta(days=7)
log = logging.getLogger(__name__)


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    return salt.hex() + "$" + hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1).hex()


def check_password(pw: str, stored: str) -> bool:
    salt, digest = stored.split("$")
    return hmac.compare_digest(hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1).hex(), digest)


def hash_otp(code: str) -> str:  # keyed so a leaked DB doesn't give away pending codes
    return hmac.new(settings.JWT_SECRET.encode(), code.encode(), "sha256").hexdigest()


def _pw_stamp(acc: Account) -> str:  # changes with every new password, so it voids all earlier tokens
    return hash_otp(acc.password_hash)[:16]


def make_token(user: User) -> str:
    return jwt.encode({"sub": str(user.id), "pw": _pw_stamp(user.account), "exp": datetime.now(timezone.utc) + TOKEN_TTL},
                      settings.JWT_SECRET, "HS256")


def send_otp(email: str, code: str):
    send_mail(email, "Your Health Copilot code", f"Your verification code is {code}. It expires in 10 minutes.\n\n"
              "If you didn't try to sign in, ignore this email.")


def send_mail(to: str, subject: str, text: str):
    sender = settings.SMTP_FROM or settings.SMTP_USER
    if settings.BREVO_API_KEY:  # HTTPS email API: works on hosts that block SMTP ports (e.g. Render's free plan)
        name, addr = parseaddr(sender)
        body = {"sender": {"name": name or "Health Copilot", "email": addr}, "to": [{"email": to}],
                "subject": subject, "textContent": text}
        req = urllib.request.Request("https://api.brevo.com/v3/smtp/email", json.dumps(body).encode(), method="POST",
                                     headers={"api-key": settings.BREVO_API_KEY, "content-type": "application/json",
                                              "accept": "application/json"})
        urllib.request.urlopen(req, timeout=15).close()  # raises on any non-2xx, so the caller reports the failure
        return
    if not settings.SMTP_HOST:
        log.warning("SMTP_HOST not set; email to %s: %s", to, text)
        return
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, sender, to
    msg.set_content(text)
    smtp_cls = smtplib.SMTP_SSL if settings.SMTP_PORT == 465 else smtplib.SMTP
    with smtp_cls(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as s:
        if settings.SMTP_PORT != 465:
            s.starttls()
        if settings.SMTP_USER:
            s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        s.send_message(msg)


def delete_profile_data(db: Session, p: Profile):
    doc_ids = [d.id for d in p.documents]
    db.delete(p.user)  # cascades to account, profile, documents and every clinical row
    db.commit()  # files go only once the rows are gone
    for i in doc_ids:
        shutil.rmtree(Path(settings.STORAGE_DIR) / str(i), ignore_errors=True)


def current_profile(cred: HTTPAuthorizationCredentials | None = Depends(HTTPBearer(auto_error=False)),
                    db: Session = Depends(get_db)) -> Profile:
    try:
        claims = jwt.decode(cred.credentials, settings.JWT_SECRET, ["HS256"]) if cred else {}
        user = db.get(User, int(claims["sub"])) if claims else None
    except (jwt.PyJWTError, KeyError, ValueError):
        user = None
    if not user or not user.account or claims.get("pw") != _pw_stamp(user.account):
        raise HTTPException(401, "Please log in", headers={"WWW-Authenticate": "Bearer"})
    return user.profile
