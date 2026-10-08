from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Profile, User


def current_profile(db: Session = Depends(get_db)) -> Profile:
    """No login: everyone is the single local demo user, created on first use."""
    p = db.scalar(select(Profile))
    if not p:
        user = User()
        user.profile = Profile(name="Demo User")
        db.add(user)
        db.commit()
        p = user.profile
    return p
