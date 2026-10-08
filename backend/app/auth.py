import shutil
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import Depends, Header
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Profile, User, Visit

TTL = timedelta(hours=24)


def purge_stale(db: Session):
    """Delete users (and their files) whose visit is older than TTL, plus pre-session users with no visit."""
    # ponytail: age is from first request, so a tab left open > 24h loses its data; track last_seen if that matters
    stale = db.scalars(select(User).outerjoin(Visit)
                       .where(or_(Visit.token.is_(None), Visit.created_at < datetime.utcnow() - TTL))).all()
    for u in stale:
        if u.profile:
            delete_profile_data(db, u.profile)


def delete_profile_data(db: Session, p: Profile):
    for d in p.documents:
        shutil.rmtree(Path(settings.STORAGE_DIR) / str(d.id), ignore_errors=True)
    db.delete(p.user)  # cascades to visit, profile, documents and every clinical row
    db.commit()


def current_profile(x_visit: str = Header(min_length=32, max_length=64), db: Session = Depends(get_db)) -> Profile:
    """No login: each browser tab sends a random id from sessionStorage (kept on refresh, gone when the tab closes)."""
    if visit := db.get(Visit, x_visit):
        return visit.user.profile
    purge_stale(db)  # cheap moment to clean up: only on new visitors
    user = User()
    user.profile = Profile(name="Guest")
    user.visit = Visit(token=x_visit)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # the tab's parallel first requests raced; the other one created it
        db.rollback()
        return db.get(Visit, x_visit).user.profile
    return user.profile
