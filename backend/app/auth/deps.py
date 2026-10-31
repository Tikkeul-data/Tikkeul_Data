from typing import Optional

from fastapi import Header, Request
from sqlmodel import Session

from app.auth.models import User
from app.auth.security import decode_access_token
from app.errors import api_error


def get_current_user(request: Request, authorization: Optional[str] = Header(default=None)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise api_error("UNAUTHORIZED")
    token = authorization.removeprefix("Bearer ").strip()
    user_id = decode_access_token(token, request.app.state.settings)
    with Session(request.app.state.db_engine) as session:
        user = session.get(User, user_id)
    if user is None:
        raise api_error("UNAUTHORIZED")
    return user
